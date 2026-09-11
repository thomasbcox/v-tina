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
): AsyncGenerator<string> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const response = await doFetch(FIREWORKS_CHAT_URL, {
    method: "POST",
    headers: headers(options.apiKey),
    body: body(request, true),
    signal,
  });
  if (!response.ok) {
    throw new ChatError(
      `Fireworks chat stream failed: HTTP ${response.status}`,
      response.status,
    );
  }
  if (!response.body) throw new ChatError("Fireworks chat stream carried no body");

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of streamLines(response.body, decoder)) {
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
}

/** Reads a byte stream as decoded text. Split out so the loop above reads as
 *  record framing rather than as byte plumbing. */
async function* streamLines(
  body: ReadableStream<Uint8Array>,
  decoder: TextDecoder,
): AsyncGenerator<string> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
