import { z } from "zod";
import { TransportError, fetchWithRetry, type RetryOptions } from "./retry";

/**
 * Chat completions via Fireworks' OpenAI-compatible endpoint.
 *
 * Same discipline as `embeddings.ts`, this project's existing model-client
 * shape: an injected `fetch`, a zod schema the response must satisfy, a named
 * error class, and the shared transient-retry policy. A second model client
 * reusing that shape verbatim is worth more than a new abstraction over the same
 * HTTP contract.
 *
 * **Why not the official `openai` package.** Fireworks serves an
 * OpenAI-compatible endpoint, so that package pointed at their base URL is the
 * obvious candidate and deserves a recorded answer. Declined: the repository
 * already owns the client shape above, proven by the embedder's suite, and the
 * SDK adds Node-runtime coupling and surface area an Edge bundle does not need.
 * The contract here is one POST and one response schema.
 */

export const FIREWORKS_CHAT_URL =
  "https://api.fireworks.ai/inference/v1/chat/completions";

/**
 * The model that classifies.
 *
 * **Not the model the specification names.** User Story 2 names
 * `llama-v3p1-8b-instruct`; on 2026-09-10 the Fireworks account serves no Llama
 * model at all — the request returns HTTP 404 — so the named model is not a
 * choice that exists. The specification's intent (a fast, cheap model whose only
 * job is to emit a label) is what is honoured here. Chosen by measurement over
 * every fast model the account does serve; the run is recorded in
 * `reviews/chat-safety-routing.md`.
 */
export const CLASSIFIER_MODEL = "accounts/fireworks/models/gpt-oss-120b";

/**
 * The model that writes the answer. Same substitution and the same reason: the
 * specification's 70B Llama is not served either.
 *
 * Chosen on time-to-first-token, which is what a reader of a streaming answer
 * actually experiences. Every model here reasons before it writes, so nothing
 * appears on screen until the reasoning finishes: measured 2026-09-10 over the
 * same grounded question, the largest candidate took **19.5 seconds** to its
 * first word against this one's 1.5. All three grounded their answers correctly;
 * only this one does so at a speed a person will wait through.
 */
export const ANSWER_MODEL = "accounts/fireworks/models/deepseek-v4p1-flash";

/**
 * How long the answer stream may go silent before it is abandoned.
 *
 * An **idle** bound, not a total one, and the distinction is the point: a
 * legitimately long answer must not be truncated mid-sentence, but a provider
 * that stops sending must not hold a public connection open forever. The clock
 * resets on every chunk received.
 */
export const ANSWER_IDLE_MS = 30_000;

/**
 * How long the answer call may take to produce a *response* before it is
 * abandoned.
 *
 * Separate from the idle bound because they guard different stalls, and one
 * budget cannot do both: a total timeout long enough for a real answer is far
 * too long to wait for a connection, and one short enough to catch a dead
 * connection would truncate a legitimate answer mid-sentence. This one stops
 * applying the moment the response arrives.
 */
export const ANSWER_CONNECT_MS = 10_000;

export class ChatError extends Error {
  /** Present when the failure came back as an HTTP status rather than a
   *  transport fault — a refused key reads differently from an unreachable
   *  service, and the caller decides which to report. */
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ChatError";
    this.status = status;
  }
}

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Only the fields this project reads. Anything else the service sends is
 *  ignored rather than rejected: an added field upstream must not break us. */
const completionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1, "response carried no choices"),
});

/**
 * A streaming chunk.
 *
 * `content` is absent on the final chunk and on the role preamble, which is why
 * it is optional rather than defaulted to "".
 *
 * `choices` is NOT required to be non-empty. The service interleaves records
 * carrying no choice at all — usage accounting and keepalives — and rejecting
 * them kills a perfectly healthy stream. Observed live on 2026-09-10: a stricter
 * schema failed every real answer while the unit suite passed, because a fake
 * only ever emits the records the author thought of.
 */
const streamChunkSchema = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().optional() }) })),
});

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  /** Capped deliberately at every call site: a classifier that can emit a
   *  thousand tokens is a classifier that can emit an essay instead of a label. */
  maxTokens: number;
  temperature?: number;
}

export interface FireworksChatOptions {
  apiKey: string;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Retry and the one wall-clock budget. See `retry.ts`. */
  retry?: RetryOptions;
  /** Where a failure to close the stream's connection is reported. Defaults to
   *  a warning. It is deliberately NOT rethrown — see `streamLines`. */
  onCleanupError?: (error: unknown) => void;
}

function body(request: ChatRequest, stream: boolean): string {
  return JSON.stringify({
    model: request.model,
    messages: request.messages,
    max_tokens: request.maxTokens,
    temperature: request.temperature ?? 0,
    stream,
  });
}

function headers(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function asChatError(error: unknown): never {
  if (error instanceof TransportError) throw new ChatError(error.message, error.status);
  throw error;
}

/**
 * One completion, whole. Retried on transient failures, bounded by the caller's
 * deadline if one was given.
 *
 * Used for classification and for the neutralising rewrite — both short, both
 * safe to re-issue, because neither has shown the reader anything yet.
 */
export async function createChatCompletion(
  options: FireworksChatOptions,
  request: ChatRequest,
): Promise<string> {
  const doFetch = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchWithRetry(
      "Fireworks chat",
      doFetch,
      FIREWORKS_CHAT_URL,
      { method: "POST", headers: headers(options.apiKey), body: body(request, false) },
      options.retry ?? {},
    );
  } catch (error) {
    asChatError(error);
  }
  const parsed = completionSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ChatError(
      `Fireworks chat response was not the expected shape:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data.choices[0].message.content;
}

/**
 * The answer, streamed as it is written.
 *
 * **Deliberately no retry.** Re-issuing a request whose first words have already
 * reached the reader would duplicate or contradict them, so this call is made
 * once and a failure is a failure. That is not an oversight: it is why the
 * failure event exists in the stream contract.
 *
 * Fireworks streams OpenAI-style server-sent events. Chunks can split across
 * network reads, so the decoder buffers and only emits complete records.
 */
export async function* createChatStream(
  options: FireworksChatOptions,
  request: ChatRequest,
  signal?: AbortSignal,
  idleMs: number = ANSWER_IDLE_MS,
  connectMs: number = ANSWER_CONNECT_MS,
): AsyncGenerator<string> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const onCleanupError =
    options.onCleanupError ??
    ((error: unknown) =>
      console.warn("Fireworks chat stream: failed to close the connection", error));

  // One controller for the whole call. The connect timer arms it until the
  // response arrives and is then cleared, so a dead connection is abandoned
  // while a long, healthy answer is never cut short for being long. The reader's
  // own signal forwards into it for as long as the call lives.
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  // WHY the timer records its own firing: the connect timeout and the reader
  // disconnecting trip the SAME controller, so the resulting AbortError is
  // identical for both. Reported undistinguished, a dead provider — exactly what
  // this bound was added to catch — reads in the log as ordinary client churn.
  let connectTimedOut = false;
  const connectTimer = setTimeout(() => {
    connectTimedOut = true;
    controller.abort();
  }, connectMs);

  let response: Response;
  try {
    response = await doFetch(FIREWORKS_CHAT_URL, {
      method: "POST",
      headers: headers(options.apiKey),
      body: body(request, true),
      signal: controller.signal,
    });
  } catch (error) {
    signal?.removeEventListener("abort", forwardAbort);
    if (connectTimedOut) {
      throw new ChatError(`Fireworks chat stream did not respond within ${connectMs}ms`);
    }
    if (signal?.aborted) {
      throw new ChatError("Fireworks chat stream abandoned: the reader disconnected");
    }
    throw new ChatError(
      `Fireworks chat stream could not be opened: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(connectTimer);
  }
  // The two throws below previously sat OUTSIDE this try, between the catch above
  // and the finally at the end — so a refused response or an empty body left the
  // abort listener attached to the reader's signal. One cleanup site now covers
  // every exit.
  try {
  if (!response.ok) {
    throw new ChatError(
      `Fireworks chat stream failed: HTTP ${response.status}`,
      response.status,
    );
  }
  if (!response.body) throw new ChatError("Fireworks chat stream carried no body");

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of streamLines(response.body, decoder, idleMs, onCleanupError)) {
    buffer += chunk;
    // Records are separated by a blank line; anything after the last separator
    // is a partial record and stays in the buffer until the rest arrives.
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const record = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of record.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "" || payload === "[DONE]") continue;
        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          throw new ChatError("Fireworks chat stream carried an unparseable record");
        }
        const parsed = streamChunkSchema.safeParse(json);
        if (!parsed.success) {
          throw new ChatError(
            `Fireworks chat stream record was not the expected shape:\n${z.prettifyError(parsed.error)}`,
          );
        }
        const text = parsed.data.choices[0]?.delta.content;
        if (text) yield text;
      }
    }
  }
  } finally {
    signal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Rejects if `work` has not settled within `idleMs`.
 *
 * Used per read rather than per stream, so the budget is "time since the last
 * byte" and a long answer is never cut short for being long.
 */
async function withIdleBound<T>(work: Promise<T>, idleMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ChatError(`Fireworks chat stream stalled: nothing received for ${idleMs}ms`)),
      idleMs,
    );
  });
  try {
    return await Promise.race([work, stalled]);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a byte stream as decoded text, abandoning it if it goes silent. Split
 *  out so the loop above reads as record framing rather than as byte plumbing. */
async function* streamLines(
  body: ReadableStream<Uint8Array>,
  decoder: TextDecoder,
  idleMs: number,
  onCleanupError: (error: unknown) => void,
): AsyncGenerator<string> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await withIdleBound(reader.read(), idleMs);
      if (done) return;
      yield decoder.decode(value, { stream: true });
    }
  } finally {
    // Cancel before releasing: on a stall or an abort the connection is still
    // open, and releasing the lock alone would leak it.
    //
    // The failure is SWALLOWED but no longer BLIND. Rethrowing here would mask
    // the primary stall or abort error, which is the one worth having — but
    // discarding it entirely left a connection that genuinely fails to close with
    // no trace anywhere, which is the invisible degradation this module spent a
    // round removing everywhere else.
    try {
      await reader.cancel();
    } catch (error) {
      onCleanupError(error);
    }
    reader.releaseLock();
  }
}
