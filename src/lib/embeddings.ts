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

/**
 * Attempts per batch before giving up.
 *
 * Measured against the live service on 2026-09-09: 25 sequential 64-input
 * batches produced 21 successes and 4 failures — a 16% rate — every failure an
 * Envoy `upstream connect error ... reset reason: connection termination` from
 * Fireworks' own load balancer. The failures are fast (100–280ms, before any
 * work), independent, and carry no `Retry-After`, so they are not rate limiting.
 *
 * A full corpus run sends roughly 22 batches, so at 16% the chance of a wholly
 * clean run is about 2% — which is why eleven consecutive attempts produced
 * none. Three attempts take a batch to roughly 0.4% and a full run to about 92%.
 * Batch size is NOT the trigger: 8, 32 and 64 inputs all succeed in isolation.
 */
export const EMBEDDING_MAX_ATTEMPTS = 3;

/** Base backoff. Deliberately short: these failures return in milliseconds and
 *  are independent, so a long wait buys nothing. Doubles per attempt. */
export const EMBEDDING_RETRY_BASE_MS = 250;

/** What a retry is told about. Reported rather than silent: a service degrading
 *  under the operator is something they should see, not something the library
 *  smooths over. */
export interface EmbeddingRetry {
  readonly attempt: number;
  readonly of: number;
  readonly status?: number;
  readonly reason: string;
  readonly delayMs: number;
}

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
  /** Attempts per batch. One means no retry. */
  maxAttempts?: number;
  /** Called before each wait, so the caller can report a degrading service. */
  onRetry?: (retry: EmbeddingRetry) => void;
  /** Injected for tests so they never actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

/** Only a transient failure is worth another attempt. A 4xx is deterministic —
 *  a bad key or a malformed request fails identically forever, and retrying it
 *  turns one clear error into three and a longer wait. */
function isTransient(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export function createFireworksEmbedder(options: FireworksEmbedderOptions): EmbedFn {
  const doFetch = options.fetch ?? globalThis.fetch;
  const prefix = TASK_PREFIX[options.task];
  const maxAttempts = options.maxAttempts ?? EMBEDDING_MAX_ATTEMPTS;
  const onRetry = options.onRetry ?? (() => {});
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  /**
   * One batch, with bounded retries on transient failures only.
   *
   * Nothing is swallowed: a non-transient failure throws immediately, and an
   * exhausted retry budget throws the last reason with the attempt count in the
   * message. Every retry is announced through `onRetry` before its wait.
   */
  async function requestBatch(batch: string[]): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      let response: Response | undefined;
      let reason: string;
      let status: number | undefined;
      try {
        response = await doFetch(FIREWORKS_EMBEDDINGS_URL, {
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
        if (response.ok) return response;
        status = response.status;
        reason = `HTTP ${response.status}`;
        if (!isTransient(response.status)) {
          throw new EmbeddingError(
            `Fireworks embeddings request failed: ${reason}`,
          );
        }
      } catch (error) {
        if (error instanceof EmbeddingError) throw error;
        // A transport failure never produced a response; treat it as transient.
        reason = error instanceof Error ? error.message : String(error);
      }
      if (attempt >= maxAttempts) {
        throw new EmbeddingError(
          `Fireworks embeddings request failed after ${attempt} attempt(s): ${reason}`,
        );
      }
      const retryAfter = Number(response?.headers.get("retry-after"));
      const delayMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : EMBEDDING_RETRY_BASE_MS * 2 ** (attempt - 1);
      onRetry({ attempt, of: maxAttempts, status, reason, delayMs });
      await sleep(delayMs);
    }
  }

  return async (texts) => {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
      const response = await requestBatch(batch);
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
