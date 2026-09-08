import { z } from "zod";

/**
 * Text embeddings via Fireworks' OpenAI-compatible embeddings endpoint.
 *
 * `fetch` is injected so the unit suite exercises the request and response
 * handling with no network. The response is validated rather than trusted: a
 * vector of the wrong length, a missing index, or a count mismatch is an error,
 * never a row silently written with a malformed embedding.
 */

/** The model User Story 1 names. Its output dimension is the schema's. */
export const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";

/** The single source of the vector dimension. The migration's
 *  `policy_chunks.embedding` column is held equal to this by a unit test. */
export const EMBEDDING_DIMENSIONS = 768;

export const FIREWORKS_EMBEDDINGS_URL =
  "https://api.fireworks.ai/inference/v1/embeddings";

/** Inputs per request; longer lists are sent in consecutive requests. */
export const EMBEDDING_BATCH_SIZE = 64;

/** nomic-embed-text is trained with task prefixes: documents being indexed and
 *  queries being searched are embedded differently. */
export type EmbeddingTask = "document" | "query";
const TASK_PREFIX: Record<EmbeddingTask, string> = {
  document: "search_document: ",
  query: "search_query: ",
};

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

const responseSchema = z.object({
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      // finite(): JSON cannot carry NaN, but an overflowing literal such as 1e999
      // parses to Infinity, which pgvector would store and PostgreSQL would then
      // sort above every real similarity — a silently wrong first result.
      embedding: z
        .array(z.number().finite("embedding components must be finite numbers"))
        .length(
          EMBEDDING_DIMENSIONS,
          `each embedding must have exactly ${EMBEDDING_DIMENSIONS} dimensions`,
        ),
    }),
  ),
});

export interface FireworksEmbedderOptions {
  apiKey: string;
  task: EmbeddingTask;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
}

export function createFireworksEmbedder(options: FireworksEmbedderOptions): EmbedFn {
  const doFetch = options.fetch ?? globalThis.fetch;
  const prefix = TASK_PREFIX[options.task];

  return async (texts) => {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
      const response = await doFetch(FIREWORKS_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: batch.map((t) => prefix + t),
        }),
      });
      if (!response.ok) {
        throw new EmbeddingError(
          `Fireworks embeddings request failed: HTTP ${response.status}`,
        );
      }
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new EmbeddingError(
          `Fireworks embeddings response was not the expected shape:\n${z.prettifyError(parsed.error)}`,
        );
      }
      const ordered = [...parsed.data.data].sort((a, b) => a.index - b.index);
      const indices = ordered.map((d) => d.index).join(",");
      const expected = batch.map((_, i) => i).join(",");
      if (indices !== expected) {
        throw new EmbeddingError(
          `Fireworks returned embeddings for indices [${indices}], expected [${expected}]`,
        );
      }
      vectors.push(...ordered.map((d) => d.embedding));
    }
    return vectors;
  };
}
