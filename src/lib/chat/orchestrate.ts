import type { ChatStreamEvent, RetrievedPolicyChunk } from "../../types";
import {
  ANSWER_SYSTEM_PROMPT,
  FAILURE_NOTICE,
  GROUNDED_DEFERRAL,
  PROVENANCE_NOTICE,
} from "../prompts";
import {
  AVATAR_FRAME,
  screenOpening,
  verifyOneQuotation,
  verifyQuotations,
} from "../voice";
import type { ClassificationResult } from "../safety";
import type { ChatMessage } from "../fireworks";
import { currentQuestion, type ChatRequestBody } from "./request";

/**
 * The routing decision: classify, branch, rewrite, retrieve, answer.
 *
 * Every collaborator arrives as a parameter. A Next.js route handler receives
 * only a `Request`, so nothing can be injected into it — putting this logic in
 * the route file would make every failure path (a classifier that times out, a
 * search that returns nothing, an answer that dies half-written) reachable only
 * with live services. Here they are all ordinary unit tests.
 *
 * This function emits events and writes no bytes. Framing is `stream.ts`.
 */

/**
 * Every collaborator takes the request's cancellation signal.
 *
 * Not decoration: each is a network call made on behalf of one reader, and a
 * reader who disconnects should stop paying for all of them rather than only for
 * the answer. Threading it to `answer` alone — where this started — left
 * classification, rewriting, embedding and the database query running for nobody
 * (approach review round 2, finding 1).
 */
export interface Retriever {
  /** The chunks grounding this question, above the project's declared
   *  threshold, most similar first. Throws if the store is unreachable — see
   *  the note on `retrieval` below for why that must not be swallowed. */
  (question: string, signal?: AbortSignal): Promise<RetrievedPolicyChunk[]>;
}

export interface Rewriter {
  /** A neutral restatement of a hostile question. */
  (question: string, signal?: AbortSignal): Promise<string>;
}

export interface Classifier {
  (question: string, signal?: AbortSignal): Promise<ClassificationResult>;
}

export interface Answerer {
  /** `signal` aborts the upstream call when the reader disconnects. Passing it
   *  is what stops a model generating an answer nobody will read. */
  (messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string>;
}

export interface ChatDeps {
  classify: Classifier;
  rewrite: Rewriter;
  retrieve: Retriever;
  answer: Answerer;
  /** Where the detail that never reaches the reader goes. Defaults to the
   *  console; injected in tests so a deliberate failure does not print. */
  logError?: (context: string, error: unknown) => void;
}

/** How a chunk is presented to the answering model. The title and URL travel
 *  with the text so the answer can refer to documents a reader can check. */
function renderChunk(chunk: RetrievedPolicyChunk): string {
  const { documentTitle, date, url } = chunk.source;
  return `[${documentTitle}] (${date}) ${url}\n${chunk.content}`;
}

/**
 * Builds the answering model's messages.
 *
 * The retrieved passages are the ONLY grounding material supplied. There is no
 * second retrieval, no hard-coded digest of priorities, and nothing about Oregon
 * baked into the assembly — if it is not in `chunks`, the model was not given
 * it here. Prior turns are carried as conversation, which is what the reader
 * already saw, not as new facts.
 */
export function buildAnswerMessages(
  body: ChatRequestBody,
  question: string,
  chunks: RetrievedPolicyChunk[],
): ChatMessage[] {
  const sources = chunks.map(renderChunk).join("\n\n---\n\n");
  const history = body.messages
    .slice(0, -1)
    .map((m) => ({ role: m.role as ChatMessage["role"], content: m.content }));
  return [
    { role: "system", content: ANSWER_SYSTEM_PROMPT },
    ...history,
    {
      role: "user",
      content: `Source passages:\n\n${sources}\n\n---\n\nQuestion: ${question}`,
    },
  ];
}

/** The deferral, as the sequence of events a reader receives. Used by every path
 *  that declines: out of bounds, a classification that failed, and a question
 *  the corpus cannot ground. One definition, so the three cannot drift. */
function* deferral(): Generator<ChatStreamEvent> {
  yield { type: "streamed_tokens", text: GROUNDED_DEFERRAL };
}

/**
 * Runs one exchange.
 *
 * The contract, in order: a safety verdict first, always; then whatever that
 * verdict implies; then a terminating record, always. A caller reading to the
 * end can always tell a finished response from a truncated one.
 */
export async function* orchestrateChat(
  deps: ChatDeps,
  body: ChatRequestBody,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const log = deps.logError ?? ((context, error) => console.error(context, error));
  const asked = currentQuestion(body);

  /**
   * True once the reader has disconnected.
   *
   * Checked before each stage so an abort landing mid-exchange stops the next
   * network call rather than merely cancelling it after it starts. When true the
   * generator returns **without a terminating record**, and that does not break
   * the always-terminates contract: the signal is aborted only when the request
   * itself was, so there is no reader left to owe one to.
   */
  const gone = () => signal?.aborted === true;

  // --- classify -----------------------------------------------------------
  // Fails CLOSED. A verdict that did not arrive, did not parse, or was not a
  // member of SAFETY_CLASSIFICATIONS is treated exactly as out of bounds:
  // nothing is embedded, nothing is searched, the answering model is never
  // called. A flaky classifier makes this service useless rather than wrong,
  // which is the right way round for an avatar wearing a sitting governor's name.
  let verdict: ClassificationResult;
  try {
    verdict = await deps.classify(asked, signal);
  } catch (error) {
    log("classification failed", error);
    verdict = { ok: false, reason: "classifier call failed" };
  }
  if (!verdict.ok) {
    log("classification unusable", verdict.reason);
    yield { type: "safety_status", classification: "OUT-OF-BOUNDS" };
    yield* deferral();
    yield { type: "audit_log_status", recorded: false };
    return;
  }
  const classification = verdict.classification;

  if (gone()) return;

  if (classification === "OUT-OF-BOUNDS") {
    yield { type: "safety_status", classification };
    yield* deferral();
    yield { type: "audit_log_status", recorded: false };
    return;
  }

  // --- the Partisan Detour rewrite ----------------------------------------
  // The neutralised question, not the original, is what gets searched — and it
  // is what the answering model is asked. A rewrite that failed takes the
  // deferral rather than falling back to the hostile original, which would
  // defeat the point of rewriting at all.
  let question = asked;
  if (classification === "PARTISAN-TRAP") {
    let neutralised: string;
    try {
      neutralised = (await deps.rewrite(asked, signal)).trim();
    } catch (error) {
      log("rewrite failed", error);
      yield { type: "safety_status", classification: "OUT-OF-BOUNDS" };
      yield* deferral();
      yield { type: "audit_log_status", recorded: false };
      return;
    }
    if (neutralised === "") {
      log("rewrite failed", "the rewriter returned nothing");
      yield { type: "safety_status", classification: "OUT-OF-BOUNDS" };
      yield* deferral();
      yield { type: "audit_log_status", recorded: false };
      return;
    }
    question = neutralised;
    yield { type: "safety_status", classification, neutralisedQuestion: neutralised };
  } else {
    yield { type: "safety_status", classification };
  }

  // --- retrieve -----------------------------------------------------------
  // A store failure is NOT an empty result. Swallowing it would make a database
  // outage and a genuinely ungroundable question look identical to the reader —
  // the deferral says "the records do not support an answer", and saying that on
  // a night the database is down is a false claim about the corpus.
  if (gone()) return;

  let chunks: RetrievedPolicyChunk[];
  try {
    chunks = await deps.retrieve(question, signal);
  } catch (error) {
    log("retrieval failed", error);
    yield { type: "error", reason: "retrieval", notice: FAILURE_NOTICE };
    yield { type: "audit_log_status", recorded: false };
    return;
  }

  yield { type: "retrieved_chunks", chunks };

  // Nothing grounds it: decline rather than let the model write from its own
  // knowledge, which is the one thing this product must never do.
  if (chunks.length === 0) {
    yield* deferral();
    yield { type: "audit_log_status", recorded: false };
    return;
  }

  // --- answer -------------------------------------------------------------
  if (gone()) return;

  try {
    for await (const event of screenedAnswer(
      deps.answer(buildAnswerMessages(body, question, chunks), signal),
      chunks,
      log,
    )) {
      yield event;
    }
  } catch (error) {
    log("generation failed", error);
    yield { type: "error", reason: "generation", notice: FAILURE_NOTICE };
    yield { type: "audit_log_status", recorded: false };
    return;
  }

  // Stubbed deliberately: nothing defines what an audit log records, and it
  // would mean storing the public's questions — a privacy decision, not a
  // schema. Reported as not recorded so the absence is visible in the product
  // rather than hidden. Its own story; see the story file's Non-goals.
  yield { type: "audit_log_status", recorded: false };
}

/** How much opening to hold before judging it: the earliest complete sentence
 *  that ends at a point where no quotation is open, or this many characters. The
 *  knob trading delay against an impersonation slipping past. */
export const OPENING_HOLD_CHARS = 240;

/** How much already-emitted text to keep for citation context: a quotation is
 *  cited just before it. */
const CITATION_CONTEXT_CHARS = 240;

const OPEN_MARKS = ['"', "\u201C"];
const CLOSE_OF: Record<string, string> = { '"': '"', "\u201C": "\u201D" };

/** True when every quote mark in `text` is matched. */
function marksBalanced(text: string): boolean {
  let open = 0;
  for (const ch of text) {
    if (ch === '"') open ^= 1;
    else if (ch === "\u201C") open += 1;
    else if (ch === "\u201D") open -= 1;
  }
  return open === 0;
}

/**
 * The answer, screened on its way to the reader. **Two holds, and only two.**
 *
 * The **opening** is held until it can be judged — the earliest sentence boundary
 * at which no quotation is open. Releasing at the earliest such point matters:
 * a quote-heavy answer is unbalanced at most token boundaries, and waiting for
 * the whole accumulation to balance let the opening swallow entire answers, so
 * one unverifiable quotation late in an answer discarded every good one before it.
 *
 * Each **quotation** is then held from its opening mark to its closing mark and
 * verified before release — a citation makes a claim more credible, so words
 * presented as the record's must be the record's. Prose outside quotations
 * streams as it arrives.
 *
 * A refusal emits `PROVENANCE_NOTICE`, **never** `FAILURE_NOTICE`: telling a
 * reader something went wrong when a provenance gate fired is false about cause.
 */
export async function* screenedAnswer(
  tokens: AsyncIterable<string>,
  chunks: readonly RetrievedPolicyChunk[],
  log: (context: string, error: unknown) => void,
): AsyncGenerator<ChatStreamEvent> {
  let opening = "";
  let openingReleased = false;
  let quoting: string | null = null;
  let closeMark = "";
  let emitted = "";
  let refused = false;

  function* emit(text: string): Generator<ChatStreamEvent> {
    emitted = (emitted + text).slice(-CITATION_CONTEXT_CHARS);
    yield { type: "streamed_tokens", text };
  }

  function* refuse(why: string): Generator<ChatStreamEvent> {
    refused = true;
    log("answer refused on provenance", why);
    yield { type: "streamed_tokens", text: PROVENANCE_NOTICE };
  }

  /** Verifies the span this code is holding, using the preceding text for its
   *  citation. The span's text is NOT re-derived from `emitted + span`: the
   *  retained text ends with the previous quotation's closing mark, so pairing
   *  across the join extracts the prose between two quotations instead. */
  function quotationProblem(span: string): string | null {
    const inner = span.replace(/^["\u201C]/, "").replace(/["\u201D]$/, "");
    const bad = verifyOneQuotation(inner, emitted, chunks);
    if (!bad) return null;
    // Refuse on fabrication, not on a citation this code failed to recognise: a
    // reader is not misdirected to a specific document by a missing citation, and
    // refusing it suppressed correct answers on the live runs.
    if (bad.reason === "no-citation") {
      log("quotation released without a detected citation", bad.text.slice(0, 60));
      return null;
    }
    return `quotation ${bad.reason}: ${bad.text.slice(0, 60)}`;
  }

  /** Streams text, holding each quotation until it verifies. */
  function* streamRest(text: string): Generator<ChatStreamEvent> {
    let buffer = text;
    while (buffer !== "" && !refused) {
      if (quoting === null) {
        const at = buffer.split("").findIndex((c) => OPEN_MARKS.includes(c));
        if (at === -1) {
          yield* emit(buffer);
          buffer = "";
        } else {
          if (at > 0) yield* emit(buffer.slice(0, at));
          closeMark = CLOSE_OF[buffer[at]];
          quoting = buffer[at];
          buffer = buffer.slice(at + 1);
        }
      } else {
        const at = buffer.indexOf(closeMark);
        if (at === -1) {
          quoting += buffer;
          buffer = "";
        } else {
          const span = `${quoting}${buffer.slice(0, at)}${closeMark}`;
          const why = quotationProblem(span);
          if (why) {
            yield* refuse(why);
            return;
          }
          yield* emit(span);
          quoting = null;
          buffer = buffer.slice(at + 1);
        }
      }
    }
  }

  /** Releases the held opening, repairing or refusing per the screen. */
  function* releaseOpening(hasMore: boolean): Generator<ChatStreamEvent, boolean> {
    const verdict = screenOpening(opening);
    if (verdict.kind === "impersonates") {
      const cut = opening.search(/(?<=[.!?])\s+(?=[A-Z"\u201C])/);
      const kept = cut === -1 ? "" : opening.slice(cut).trim();
      if (kept === "") {
        // Nothing survives the strip. If the answer continues, drop the
        // impersonating sentence and let the rest stand behind the frame — the
        // reader loses one sentence of the model's throat-clearing, not the
        // answer. Only when nothing follows is there an answer to refuse.
        if (!hasMore) {
          yield* refuse(`opening impersonated ("${verdict.form}") and could not be repaired`);
          return false;
        }
        log("impersonating opening dropped", verdict.form);
        opening = `${AVATAR_FRAME[0]}, `;
        yield* emit(opening);
        return true;
      }
      opening = `${AVATAR_FRAME[0]}, ${kept.charAt(0).toLowerCase()}${kept.slice(1)}`;
    } else if (verdict.kind === "missing-frame") {
      opening = `${AVATAR_FRAME[0]}, ${opening.charAt(0).toLowerCase()}${opening.slice(1)}`;
    }
    // The opening may carry complete quotations of its own; nothing precedes
    // them, so ordinary extraction is correct here.
    const bad = verifyQuotations(opening, chunks).filter((b) => b.reason !== "no-citation");
    if (bad.length > 0) {
      yield* refuse(`quotation ${bad[0].reason}: ${bad[0].text.slice(0, 60)}`);
      return false;
    }
    yield* emit(opening);
    return true;
  }

  /** The earliest sentence end at which no quotation is open. */
  function releasePoint(text: string): number {
    for (const m of text.matchAll(/[.!?]\s+(?=\S)/g)) {
      const at = (m.index ?? 0) + m[0].length;
      if (marksBalanced(text.slice(0, at))) return at;
    }
    return text.length >= OPENING_HOLD_CHARS && marksBalanced(text) ? text.length : -1;
  }

  try {
    for await (const text of tokens) {
      if (!text || refused) continue;
      if (openingReleased) {
        yield* streamRest(text);
        continue;
      }
      opening += text;
      const split = releasePoint(opening);
      if (split === -1) continue;
      const rest = opening.slice(split);
      opening = opening.slice(0, split);
      const ok = yield* releaseOpening(rest !== "");
      openingReleased = true;
      if (!ok) return;
      if (rest !== "") yield* streamRest(rest);
    }
  } catch (error) {
    // Generation died with the opening still held. Release it — SCREENED, never
    // raw — before the failure propagates: `FAILURE_NOTICE` promises nothing
    // above it is affected. Found by story 2's own suite.
    if (!openingReleased && opening !== "" && marksBalanced(opening)) yield* releaseOpening(false);
    throw error;
  }

  if (refused) return;
  if (!openingReleased && opening !== "") {
    if (!marksBalanced(opening)) {
      yield* refuse("answer ended inside an unterminated quotation");
      return;
    }
    const ok = yield* releaseOpening(false);
    if (!ok) return;
  }
  if (quoting !== null) yield* refuse("answer ended inside an unterminated quotation");
}
