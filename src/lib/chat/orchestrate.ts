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

/** How much opening to hold before judging it: the first complete sentence that
 *  has something after it, or this many characters, whichever comes first. The
 *  knob trading delay against an impersonation slipping past — stated, not
 *  buried. A boundary with nothing after it is not a release point: there would
 *  be nothing to strip an impersonating sentence back to. */
export const OPENING_HOLD_CHARS = 240;

/** How much already-emitted text to keep for citation context. A quotation is
 *  cited just before it, and the verifier needs that text to know which document
 *  the span claims to come from. */
const CITATION_CONTEXT_CHARS = 240;

/** Straight and typographic quote marks, as the answer may use either. */
const OPEN_MARKS = ['"', "\u201C"];
const CLOSE_OF: Record<string, string> = { '"': '"', "\u201C": "\u201D" };

/** True when every quote mark in `text` is matched. An opening is not released
 *  while a quotation is still open in it, or the quoted words would escape
 *  verification entirely. */
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
 * The **opening** is held until `screenOpening` can judge it: an impersonation is
 * stripped to a clean boundary, or refused if stripping would leave wreckage; a
 * missing frame is prefixed rather than refused, because the likeliest slip
 * should not cost an answer.
 *
 * Each **quotation** is held from its opening mark to its closing mark and
 * verified against the passages before release — a citation makes a claim more
 * credible, so words presented as the record's must actually be the record's. The
 * text already emitted travels with the span, because that is where the citation
 * naming the document lives. Prose outside quotations streams as it arrives.
 *
 * A refusal for either reason emits `PROVENANCE_NOTICE`, **never**
 * `FAILURE_NOTICE`: telling a reader something went wrong when a provenance gate
 * fired is a false statement about what happened.
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

  const emit = function* (text: string): Generator<ChatStreamEvent> {
    emitted = (emitted + text).slice(-CITATION_CONTEXT_CHARS);
    yield { type: "streamed_tokens", text };
  };

  const refuse = function* (why: string): Generator<ChatStreamEvent> {
    log("answer refused on provenance", why);
    yield { type: "streamed_tokens", text: PROVENANCE_NOTICE };
  };

  /** Verifies one complete quotation, with the preceding text for its citation. */
  const quotationOk = (span: string): string | null => {
    const bad = verifyQuotations(emitted + span, chunks);
    const mine = bad.find((b) => span.includes(b.text.slice(0, 24)));
    return mine ? `quotation ${mine.reason}: ${mine.text.slice(0, 60)}` : null;
  };

  /** Releases the held opening, repairing or refusing per the screen. */
  const releaseOpening = function* (): Generator<ChatStreamEvent, boolean> {
    if (!marksBalanced(opening)) {
      yield* refuse("answer ended inside an unterminated quotation");
      return false;
    }
    const verdict = screenOpening(opening);
    if (verdict.kind === "impersonates") {
      const cut = opening.search(/(?<=[.!?])\s+(?=[A-Z"\u201C])/);
      const rest = cut === -1 ? "" : opening.slice(cut).trim();
      if (rest === "") {
        yield* refuse(`opening impersonated ("${verdict.form}") and could not be repaired`);
        return false;
      }
      opening = `${AVATAR_FRAME[0]}, ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
    } else if (verdict.kind === "missing-frame") {
      opening = `${AVATAR_FRAME[0]}, ${opening.charAt(0).toLowerCase()}${opening.slice(1)}`;
    }
    // The opening may itself carry a complete, cited quotation.
    const why = quotationOk(opening);
    if (why) {
      yield* refuse(why);
      return false;
    }
    yield* emit(opening);
    return true;
  };

  try {
    for await (const text of tokens) {
      if (!text) continue;

      if (!openingReleased) {
        opening += text;
        const settled =
          marksBalanced(opening) &&
          (/[.!?]\s+\S/.test(opening) || opening.length >= OPENING_HOLD_CHARS);
        if (!settled) continue;
        const ok = yield* releaseOpening();
        openingReleased = true;
        if (!ok) return;
        continue;
      }

      let buffer = text;
      while (buffer !== "") {
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
            const why = quotationOk(span);
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
  } catch (error) {
    // Generation died while the opening was still held. Release it — SCREENED,
    // never raw — before the failure propagates: `FAILURE_NOTICE` promises
    // nothing above it is affected, and silently swallowing generated text would
    // make that untrue. Found by story 2's own suite.
    if (!openingReleased && opening !== "" && marksBalanced(opening)) {
      yield* releaseOpening();
    }
    throw error;
  }

  // A short answer may never have reached the release threshold.
  if (!openingReleased && opening !== "") {
    const ok = yield* releaseOpening();
    if (!ok) return;
  }
  // An unterminated quotation is never released — it was never verifiable.
  if (quoting !== null) yield* refuse("answer ended inside an unterminated quotation");
}
