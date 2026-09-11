import { z } from "zod";
import {
  RETRY_BASE_MS,
  RETRY_MAX_ATTEMPTS,
  TransportError,
  fetchWithRetry,
  type RetryNotice,
} from "./retry";

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

/**
 * Attempts per batch before giving up.
 *
 * The service returns fast, independent, transient upstream errors often enough
 * that a full corpus run rarely completes without one. A small bounded retry
 * turns that from an obstacle into a non-event. The measurement this was sized
 * from is dated evidence and lives in `reviews/seed-corpus-ingest.md`; it is
 * deliberately not restated here, where it would decay into folklore as the
 * corpus and the service change.
 */
export const EMBEDDING_MAX_ATTEMPTS = RETRY_MAX_ATTEMPTS;

/** Base backoff. Deliberately short: these failures return in milliseconds and
 *  are independent, so a long wait buys nothing. Doubles per attempt. */
export const EMBEDDING_RETRY_BASE_MS = RETRY_BASE_MS;

/** What a retry is told about. Reported rather than silent: a service degrading
 *  under the operator is something they should see, not something the library
 *  smooths over. */
export type EmbeddingRetry = RetryNotice;

/** nomic-embed-text is trained with task prefixes: documents being indexed and
 *  queries being searched are embedded differently. */
export type EmbeddingTask = "document" | "query";
const TASK_PREFIX: Record<EmbeddingTask, string> = {
  document: "search_document: ",
  query: "search_query: ",
};

/** `signal` is per CALL, not per embedder: one embedder serves every request, so
 *  a request-scoped deadline cannot live in its construction options. */
export type EmbedFn = (texts: string[], signal?: AbortSignal) => Promise<number[][]>;

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
  /** Attempts per batch. One means no retry. */
  maxAttempts?: number;
  /** Called before each wait, so the caller can report a degrading service. */
  onRetry?: (retry: EmbeddingRetry) => void;
  /** Injected for tests so they never actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

export function createFireworksEmbedder(options: FireworksEmbedderOptions): EmbedFn {
  const doFetch = options.fetch ?? globalThis.fetch;
  const prefix = TASK_PREFIX[options.task];
  const maxAttempts = options.maxAttempts ?? EMBEDDING_MAX_ATTEMPTS;
  const onRetry = options.onRetry ?? (() => {});
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  /**
   * One batch, through the shared transient-failure policy.
   *
   * The loop this replaced lived here and was about to be copied verbatim into
   * the chat client; it now lives in `retry.ts` and both callers share it. The
   * error type is translated back to `EmbeddingError` so this module's callers
   * still catch one named thing — the policy is shared, the vocabulary is not.
   */
  async function requestBatch(batch: string[], signal?: AbortSignal): Promise<Response> {
    try {
      return await fetchWithRetry(
        "Fireworks embeddings",
        doFetch,
        FIREWORKS_EMBEDDINGS_URL,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: batch.map((t) => prefix + t),
          }),
        },
        { maxAttempts, onRetry, sleep, signal },
      );
    } catch (error) {
      if (error instanceof TransportError) throw new EmbeddingError(error.message);
      throw error;
    }
  }

  return async (texts, signal) => {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
      const response = await requestBatch(batch, signal);
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
