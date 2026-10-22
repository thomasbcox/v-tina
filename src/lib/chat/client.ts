import type { RetrievedPolicyChunk } from "../../types";
import type { DocumentKind } from "../ingest/metadata";
import type { SafetyClassification } from "../safety";
import { CONNECTION_NOTICE } from "../copy";
import { chatStreamEventSchema, type ChatStreamEvent } from "./events";
import { MAX_QUESTION_LENGTH, chatRequestSchema, type ChatRequestBody } from "./request";

/**
 * The chat screen's logic, with no React and no DOM in it.
 *
 * Everything the screen decides — what a record does to the state of one exchange,
 * how the sources are grouped, what goes in the next request, whether a question
 * may be sent — is a pure function here, tested in the node environment. The
 * components only render what these produce. Story `chat-screen`.
 */

/**
 * Where one exchange stands. `waiting` until the first words of the answer — not the
 * first record: the verdict and the passages arrive seconds before the answering
 * model's first word, and a reader cannot see a record (live run, 2026-10-03: the
 * verdict at about one second, the first word after twenty). `answering` until the
 * last record; then `done`, or `incomplete` when it was stopped, failed, or cut off.
 */
export type TurnStatus = "waiting" | "answering" | "done" | "incomplete";

/**
 * The notices a turn can end in. `provenance` and `failure` arrive from the server
 * with their text; `connection` is the screen's own, for a stream that ended before
 * its final record or a record that could not be read.
 */
export type TurnNoticeKind = "provenance" | "failure" | "connection";

/** One document the answer drew on, with every passage retrieved from it. */
export interface Source {
  url: string;
  documentTitle: string;
  date: string;
  documentKind: DocumentKind;
  passages: string[];
}

/** The state of one exchange, as the screen shows it. */
export interface Turn {
  id: number;
  question: string;
  status: TurnStatus;
  classification?: SafetyClassification;
  /** The neutral rewording that was actually answered, on the partisan path. */
  neutralisedQuestion?: string;
  /** The answer's own words, as received so far. Never a notice. */
  answer: string;
  sources: Source[];
  notice?: { kind: TurnNoticeKind; text: string };
  /** True once a record saying how the exchange ended has arrived. The contract
   *  promises one on every path; a stream that ends without it was cut off. */
  ended: boolean;
}

export function newTurn(id: number, question: string): Turn {
  return { id, question, status: "waiting", answer: "", sources: [], ended: false };
}

/**
 * Groups passages by the document they came from — by URL, never by title, since
 * two documents can share a short name — keeping retrieval order within and
 * between documents.
 */
export function sourcesOf(chunks: readonly RetrievedPolicyChunk[]): Source[] {
  const byUrl = new Map<string, Source>();
  for (const chunk of chunks) {
    const { url, documentTitle, date, documentKind } = chunk.source;
    const existing = byUrl.get(url);
    if (existing) existing.passages.push(chunk.content);
    else byUrl.set(url, { url, documentTitle, date, documentKind, passages: [chunk.content] });
  }
  return [...byUrl.values()];
}

/**
 * What one record does to a turn. Exhaustive over the record union: the union has
 * no catch-all member, so a record kind added to the contract fails the typecheck
 * here rather than falling through to the reader as nothing, or as text.
 */
export function reduceTurn(turn: Turn, event: ChatStreamEvent): Turn {
  switch (event.type) {
    case "safety_status":
      // Still waiting: nothing the reader can see has arrived yet.
      return {
        ...turn,
        classification: event.classification,
        neutralisedQuestion: event.neutralisedQuestion,
      };
    case "retrieved_chunks":
      return { ...turn, sources: sourcesOf(event.chunks) };
    case "streamed_tokens":
      return { ...turn, status: "answering", answer: turn.answer + event.text };
    case "notice":
      // The service speaking about the answer, never part of it. A notice means
      // the answer did not complete.
      return { ...turn, status: "incomplete", notice: { kind: event.kind, text: event.text } };
    case "error":
      // The terminator on a failure path; no `audit_log_status` need follow it.
      return {
        ...turn,
        status: "incomplete",
        ended: true,
        notice: { kind: "failure", text: event.notice },
      };
    case "audit_log_status":
      return { ...turn, ended: true, status: turn.status === "incomplete" ? "incomplete" : "done" };
    default: {
      const unhandled: never = event;
      throw new Error(`unhandled record ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Closes a turn whose stream has ended. A turn whose final record arrived is left
 * as it is. One whose stream ended early — the connection dropped, a record could
 * not be read — is incomplete, and says so with the screen's own notice unless a
 * server notice already explains the stop.
 */
export function endTurn(turn: Turn): Turn {
  if (turn.ended) return turn;
  return {
    ...turn,
    ended: true,
    status: "incomplete",
    notice: turn.notice ?? { kind: "connection", text: CONNECTION_NOTICE },
  };
}

/**
 * False until every exchange has ended — its final record arrived, or the screen
 * closed it. Not "none is waiting or answering": a stop notice makes a turn
 * `incomplete` a moment before the final record closes the stream, and that moment
 * must not open the gate (correctness review, round d2e7d11, finding 3). The one gate
 * for the send button and the submit handler alike.
 */
export function canSend(turns: readonly Turn[]): boolean {
  return turns.every((t) => t.ended);
}

/**
 * The next request's body.
 *
 * Each earlier turn contributes its question and the answer text the reader saw —
 * never a notice, which is the service's voice and not the avatar's. A turn with no
 * answer text is left out entirely, so the roles alternate as the answering model
 * expects. A prior answer is cut to the service's per-message limit: that limit was
 * sized for a question, and an answer can run far past it, so the model is reminded
 * of an earlier answer's opening rather than given all of it. Then the service's own
 * request schema has the last word — whole turns are dropped, oldest first, until it
 * accepts the body — so every limit it declares, now or later, is honoured here
 * without a copy (approach review, round d2e7d11, finding 1). The new question is
 * always last.
 */
export function buildRequest(turns: readonly Turn[], question: string): ChatRequestBody {
  const prior = turns
    .filter((t) => t.answer !== "")
    .map((t) => [
      { role: "user" as const, content: t.question.slice(0, MAX_QUESTION_LENGTH) },
      { role: "assistant" as const, content: t.answer.slice(0, MAX_QUESTION_LENGTH) },
    ]);
  const body = (): ChatRequestBody => ({
    messages: [...prior.flat(), { role: "user", content: question }],
  });
  let candidate = body();
  while (prior.length > 0 && !chatRequestSchema.safeParse(candidate).success) {
    prior.shift();
    candidate = body();
  }
  return candidate;
}

/**
 * Reads the chat endpoint's response body as the records it carries.
 *
 * Server-Sent Events framing: decode as a stream, keep what has not yet formed a
 * whole record, split at the blank line, take the `data:` lines, and validate each
 * payload with the declared schema — the same object the server derives its type
 * from, so there is no second parser to drift. A payload that is not a declared
 * record throws; the screen turns that into the incomplete state with its own
 * notice rather than skipping it, because a skipped record is a truncation nothing
 * reports.
 *
 * `eventsource-parser` was considered and rejected (`reviews/chat-screen.md`, design
 * sketch): the framing is these few lines, validation is zod's job either way, and the
 * chunk-boundary test holds the framing directly.
 */
export async function* readChatStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatStreamEvent> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffered = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffered += done ? decoder.decode() : decoder.decode(value, { stream: true });
      // A record ends at a blank line. Anything after the last one is still arriving.
      const records = buffered.split(/\r?\n\r?\n/);
      buffered = done ? "" : (records.pop() ?? "");
      for (const record of records) {
        let event: ChatStreamEvent | undefined;
        try {
          event = parseRecord(record);
        } catch (error) {
          // A record the screen cannot read ends the exchange, and the body is
          // cancelled with it, so the request closes rather than streaming on for
          // nobody (approach review, round d2e7d11, finding 2).
          await reader.cancel(error).catch(() => {});
          throw error;
        }
        if (event) yield event;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

/** One SSE record as a declared event, or nothing for a comment or a blank. */
function parseRecord(record: string): ChatStreamEvent | undefined {
  const data = record
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).replace(/^ /, ""))
    .join("\n");
  if (data === "") return undefined;
  let payload: unknown;
  // Each refusal carries its evidence as `cause` — the parse error, or the schema's
  // objection — so the console line the screen writes can tell a server bug from a
  // client one (hidden-failure review, round d2e7d11).
  try {
    payload = JSON.parse(data);
  } catch (error) {
    throw new Error("a record from the service was not readable", { cause: error });
  }
  const parsed = chatStreamEventSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("a record from the service was not a declared record", { cause: parsed.error });
  }
  return parsed.data;
}
