import { z } from "zod";

/**
 * The `/api/chat` request contract.
 *
 * Validated before anything else happens. A malformed body is refused naming
 * what was wrong, and — this is the part that matters — nothing downstream runs
 * for it: no classification, no embedding, no search, no answer. This is the
 * public entry point of the whole application, so garbage input must cost
 * nothing.
 */

/** Long enough for a real multi-part question, short enough that nobody pays to
 *  classify a pasted document. */
export const MAX_QUESTION_LENGTH = 2000;

/** Earlier turns passed to the answering model as context. Bounded because the
 *  whole history is re-sent on every request. */
export const MAX_HISTORY_MESSAGES = 20;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .trim()
    .min(1, "message content must not be empty")
    .max(
      MAX_QUESTION_LENGTH,
      `message content must be at most ${MAX_QUESTION_LENGTH} characters`,
    ),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1, "messages must contain at least one message")
    .max(
      MAX_HISTORY_MESSAGES,
      `messages must contain at most ${MAX_HISTORY_MESSAGES} messages`,
    )
    // The thing being asked is the last user message; a history whose final turn
    // is the assistant's has no question in it.
    //
    // The length guard is NOT redundant with `.min(1)` above: zod runs every
    // check and collects all the issues rather than stopping at the first, so an
    // empty array still reaches this refinement. Indexing it unguarded threw a
    // TypeError out of the parser — a malformed body crashing the thing whose
    // whole job is to refuse malformed bodies.
    .refine((m) => m.length > 0 && m[m.length - 1].role === "user", {
      message: "the last message must be from the user",
    }),
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;

export type ParseResult =
  | { ok: true; body: ChatRequestBody }
  | { ok: false; problem: string };

/**
 * Parses and validates a request body.
 *
 * Takes the already-read text rather than a `Request` so it is a pure function
 * the unit suite calls directly. Every refusal names the offending field —
 * "invalid request body" for all five failure modes tells an API consumer
 * nothing it can act on.
 */
export function parseChatRequest(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "request body must be JSON" };
  }
  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      problem: parsed.error.issues
        .map((i) => {
          const path = i.path.join(".");
          return path ? `${path}: ${i.message}` : i.message;
        })
        .join("; "),
    };
  }
  return { ok: true, body: parsed.data };
}

/** The question being asked: the last message, which the schema has already
 *  guaranteed is the user's. */
export function currentQuestion(body: ChatRequestBody): string {
  return body.messages[body.messages.length - 1].content;
}
