/**
 * The transient-failure policy for every Fireworks call.
 *
 * Extracted from `embeddings.ts`, which owned it alone until a second model
 * client needed the same behaviour. One policy rather than two that drift: the
 * embedder and the chat client share this module, so a change to what counts as
 * transient, or to how long a caller waits, happens once.
 *
 * Everything here is injectable — `fetch`, `sleep`, and the deadline — so the
 * unit suite exercises every branch with no network and no waiting.
 */

/** Attempts per request before giving up. One means no retry. */
export const RETRY_MAX_ATTEMPTS = 3;

/** Base backoff. Deliberately short: these failures return in milliseconds and
 *  are independent, so a long wait buys nothing. Doubles per attempt. */
export const RETRY_BASE_MS = 250;

/** What a retry is told about. Reported rather than silent: a service degrading
 *  under the operator is something they should see, not something the library
 *  smooths over. */
export interface RetryNotice {
  readonly attempt: number;
  readonly of: number;
  readonly status?: number;
  readonly reason: string;
  readonly delayMs: number;
}

/**
 * Only a transient failure is worth another attempt. A 4xx is deterministic — a
 * bad key or a malformed request fails identically forever, and retrying it
 * turns one clear error into three and a longer wait.
 */
export function isTransient(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export interface RetryOptions {
  /** Attempts per request. One means no retry. */
  maxAttempts?: number;
  /** Called before each wait, so the caller can report a degrading service. */
  onRetry?: (notice: RetryNotice) => void;
  /** Injected for tests so they never actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * The caller's wall-clock budget for the WHOLE operation, retries and backoff
   * sleeps included.
   *
   * This is the one clock. Without it the deadline and the retry loop are two
   * clocks that disagree: three attempts, each inside its own timeout, can total
   * far more than the budget the caller declared, and a slow first attempt can
   * consume the entire budget before the second begins. Passed to `fetch` as its
   * signal, checked before each retry, and used to cut a backoff sleep short.
   */
  signal?: AbortSignal;
}

/**
 * Thrown when the attempt budget is exhausted, or a deterministic failure is
 * met. Carries the last status when there was one, so a caller can tell a
 * refused key from an unreachable service.
 */
export class TransportError extends Error {
  readonly status?: number;
  readonly attempts: number;
  constructor(message: string, attempts: number, status?: number) {
    super(message);
    this.name = "TransportError";
    this.attempts = attempts;
    this.status = status;
  }
}

/** Resolves when `ms` has passed OR `signal` aborts — whichever comes first, so
 *  a backoff can never outlive the deadline it sits inside. */
function sleepBounded(
  ms: number,
  sleep: (ms: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", done);
      resolve();
    };
    signal.addEventListener("abort", done, { once: true });
    void sleep(ms).then(done);
  });
}

/**
 * One request, with bounded retries on transient failures only.
 *
 * Nothing is swallowed: a non-transient failure throws immediately, and an
 * exhausted budget throws the last reason with the attempt count in the message.
 * Every retry is announced through `onRetry` before its wait.
 *
 * `label` names the caller ("Fireworks embeddings", "Fireworks chat") so an
 * error says which call failed without the caller re-wrapping it.
 */
export async function fetchWithRetry(
  label: string,
  doFetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? RETRY_MAX_ATTEMPTS;
  const onRetry = options.onRetry ?? (() => {});
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const signal = options.signal;

  for (let attempt = 1; ; attempt++) {
    let response: Response | undefined;
    let reason: string;
    let status: number | undefined;
    try {
      response = await doFetch(url, signal ? { ...init, signal } : init);
      if (response.ok) return response;
      status = response.status;
      reason = `HTTP ${response.status}`;
      if (!isTransient(response.status)) {
        throw new TransportError(`${label} request failed: ${reason}`, attempt, status);
      }
    } catch (error) {
      if (error instanceof TransportError) throw error;
      // A transport failure never produced a response; treat it as transient.
      reason = error instanceof Error ? error.message : String(error);
    }
    // The budget is checked here as well as inside fetch: an abort that lands
    // between the response and the next attempt must stop the loop, not start
    // another request against a deadline that has already passed.
    if (attempt >= maxAttempts || signal?.aborted) {
      const why = signal?.aborted ? `${reason} (deadline reached)` : reason;
      throw new TransportError(
        `${label} request failed after ${attempt} attempt(s): ${why}`,
        attempt,
        status,
      );
    }
    const retryAfter = Number(response?.headers.get("retry-after"));
    const delayMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : RETRY_BASE_MS * 2 ** (attempt - 1);
    onRetry({ attempt, of: maxAttempts, status, reason, delayMs });
    await sleepBounded(delayMs, sleep, signal);
  }
}
