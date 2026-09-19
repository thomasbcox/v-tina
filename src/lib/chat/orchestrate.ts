import type { ChatStreamEvent, RetrievedPolicyChunk } from "../../types";
import {
  ANSWER_SYSTEM_PROMPT,
  FAILURE_NOTICE,
  GROUNDED_DEFERRAL,
  PROVENANCE_NOTICE,
} from "../prompts";
import {
  CITATION_WINDOW,
  DISPLAY_FRAME,
  LOOK_BEHIND_CHARS,
  cadenceAfter,
  citationTextOf,
  indexPassages,
  lex,
  rawOf,
  scanCadence,
  screenOpening,
  verifyQuotations,
  verifyQuotedSpan,
  type CadenceState,
  type LexResult,
  type LexResume,
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

/** How much opening to hold before judging it: the earliest sentence end in the
 *  avatar's own prose that has something after it, or this many characters. */
export const OPENING_HOLD_CHARS = 240;

/** Sentence-starting words that read naturally lowercased after the frame. Any
 *  other first word — a proper noun, an acronym — keeps its capital. */
const FUNCTION_WORDS = new Set([
  "the", "this", "that", "these", "those", "it", "its", "in", "on", "under", "for",
  "a", "an", "and", "but", "also", "however", "their", "they", "there", "we", "what",
]);

/** A sentence's first word as it reads after the frame: lowercased only when it is a
 *  function word, so "The order…" becomes "…Governor, the order…" and "Oregon's
 *  order…" keeps its capital. */
function afterFrame(word: string): string {
  return FUNCTION_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word;
}

/** Prefixes `sentence` with the frame. */
function framed(sentence: string): string {
  const first = /^\s*(\p{L}+)/u.exec(sentence)?.[1] ?? "";
  return `${DISPLAY_FRAME}, ${sentence.trimStart().replace(first, afterFrame(first))}`;
}

/** The letters of the word starting at `at`. */
const LETTERS = /\p{L}+/uy;
function wordAt(text: string, at: number): string {
  LETTERS.lastIndex = at;
  return LETTERS.exec(text)?.[0] ?? "";
}

/**
 * The answer, screened on its way to the reader.
 *
 * **Built on the one grammar.** `lex` decides what is prose, what is a quotation
 * and what is a violation, here and in every offline check alike; this function
 * only decides what to do with each token. The first version re-implemented the
 * grammar as a character scanner, and the two drifted — a fabricated quotation in
 * single quotes reached the reader.
 *
 * - The **opening** is held until its own prose reaches a sentence end with more to
 *   follow, then screened: impersonation is stripped (or refused if nothing would
 *   survive), a missing frame is prefixed.
 * - Text is released only as far as the lexer calls it **stable**, so a quotation
 *   is held from its opening mark until nesting closes, then verified against the
 *   document the preceding text cites.
 * - The avatar's own words are counted by `scanCadence`, and at the first sentence
 *   start past the target without a frame, **the frame is injected** (Thomas chose
 *   enforcement over documentation, knowing it may read abruptly). That sentence's
 *   start is held until its first word is complete and it is clear the model is not
 *   repeating the frame itself — a few characters, never a sentence.
 * - A refusal emits `PROVENANCE_NOTICE`, never `FAILURE_NOTICE`.
 *
 * **Linear in the answer.** Each model token lexes only what has not been released,
 * a quotation still held resumes its scan instead of starting it again, and the
 * passages are indexed once. The first version re-lexed the whole answer on every
 * token: 465 ms of CPU for a maximum-length answer, quadratic (approach review round
 * b6039ac). **Stated limit:** held text is still copied once per token when the next
 * token is appended to it — about 10 ms for a single 4,000-word quotation.
 */
export async function* screenedAnswer(
  tokens: AsyncIterable<string>,
  chunks: readonly RetrievedPolicyChunk[],
  log: (context: string, error: unknown) => void,
): AsyncGenerator<ChatStreamEvent> {
  const passages = indexPassages(chunks);
  /**
   * The model's text the stream still needs: everything not yet released, behind
   * `LOOK_BEHIND_CHARS` of what was. A character in it never changes, only how much
   * of it is decided. Offsets below are into this buffer.
   */
  let buf = "";
  /** How much of `buf` has been released to the reader, or deliberately dropped. */
  let released = 0;
  /** How many characters have been discarded from the front of `buf`. */
  let discarded = 0;
  /** Where the lexer's scan of a still-undecided construct had got to, as offsets
   *  into the whole answer so that discarding cannot move them. */
  let held: LexResume | undefined;
  let openingDone = false;
  let refused = false;
  /** The avatar's own words at the end of what the reader has received — where a
   *  quotation's citation is read. Built with `citationTextOf`. */
  let context = "";
  let cadence: CadenceState = { words: 0 };

  /** Sends `text` to the reader. `cites` is what it adds to the citation context:
   *  all of it for the avatar's own words, less for anything quoted. */
  function* emit(text: string, cites: string = text): Generator<ChatStreamEvent> {
    if (text === "") return;
    context = (context + cites).slice(-CITATION_WINDOW * 2);
    yield { type: "streamed_tokens", text };
  }

  function* refuse(why: string): Generator<ChatStreamEvent> {
    refused = true;
    log("answer refused on provenance", why);
    yield { type: "streamed_tokens", text: PROVENANCE_NOTICE };
  }

  function* releaseOpening(opening: string, hasMore: boolean): Generator<ChatStreamEvent, boolean> {
    let text = opening;
    const verdict = screenOpening(text);
    if (verdict.kind === "impersonates") {
      const cut = text.search(/(?<=[.!?])\s+(?=[A-Z\u201C])/);
      const kept = cut === -1 ? "" : text.slice(cut).trim();
      if (kept === "") {
        if (!hasMore) {
          yield* refuse(`opening impersonated ("${verdict.form}") and could not be repaired`);
          return false;
        }
        log("impersonating opening dropped", verdict.form);
        text = `${DISPLAY_FRAME}, `;
      } else {
        text = framed(kept);
      }
    } else if (verdict.kind === "missing-frame") {
      text = framed(text);
    }
    const bad = verifyQuotations(text, passages).filter((b) => b.reason !== "no-citation");
    if (bad.length > 0) {
      yield* refuse(`quotation ${bad[0].reason}: ${bad[0].text.slice(0, 60)}`);
      return false;
    }
    cadence = cadenceAfter(text);
    yield* emit(text, lex(text, true).tokens.map(citationTextOf).join(""));
    return true;
  }

  /** The earliest sentence end inside the avatar's own prose with text after it. */
  function openingSplit(stableText: string, final: boolean): number {
    const ranges: Array<[number, number]> = [];
    let at = 0;
    for (const t of lex(stableText, true).tokens) {
      const raw = rawOf(t);
      if (t.kind === "prose") ranges.push([at, at + raw.length]);
      at += raw.length;
    }
    for (const m of stableText.matchAll(/[.!?]\s+(?=\S)/g)) {
      const pos = m.index ?? 0;
      if (ranges.some(([a, b]) => pos >= a && pos < b)) return pos + m[0].length;
    }
    if (stableText.length >= OPENING_HOLD_CHARS || final) return stableText.length;
    return -1;
  }

  /**
   * Releases the avatar's own words in `buf[from, to)`, injecting the frame where the
   * cadence is due. Returns how far it released: `to`, or the start of a sentence that
   * must wait for more text before the frame can be placed in front of it.
   */
  function* releaseProse(from: number, to: number, final: boolean): Generator<ChatStreamEvent, number> {
    let at = from;
    for (;;) {
      const stop = scanCadence(buf, at, to, cadence, final);
      if (stop.kind === "end") {
        yield* emit(buf.slice(at, to));
        return to;
      }
      yield* emit(buf.slice(at, stop.at));
      const word = wordAt(buf, stop.at);
      if (stop.kind === "undecided" || (!final && stop.at + word.length >= buf.length)) {
        return stop.at;
      }
      log("cadence frame injected", cadence.words);
      yield* emit(`${DISPLAY_FRAME}, ${afterFrame(word)}`);
      cadence.words = 1;
      at = stop.at + word.length;
    }
  }

  /** Lexes `buf` from `from`, resuming any scan the previous call left open. */
  function lexFrom(from: number, final: boolean): LexResult {
    const base = discarded + from;
    const resume = held && { at: held.at - base, scanned: held.scanned - base, depth: held.depth };
    const result = lex(buf.slice(from), final, buf[from - 1] ?? " ", resume);
    const next = result.resume;
    held = next && { at: next.at + base, scanned: next.scanned + base, depth: next.depth };
    return result;
  }

  function* advance(final: boolean): Generator<ChatStreamEvent> {
    if (!openingDone) {
      const split = openingSplit(buf.slice(0, lexFrom(0, final).stable), final);
      if (split <= 0) return;
      const ok = yield* releaseOpening(buf.slice(0, split), !final || split < buf.length);
      openingDone = true;
      released = split;
      if (!ok) return;
    }
    // Only what is unreleased, with the one character of look-behind the grammar reads.
    const { tokens: toks } = lexFrom(released, final);
    let start = released;
    for (const t of toks) {
      const end = start + rawOf(t).length;
      if (t.kind === "prose") {
        released = yield* releaseProse(start, end, final);
        if (released < end) return;
      } else if (t.kind === "violation") {
        yield* refuse(`grammar: ${t.reason}`);
        return;
      } else {
        const problem = verifyQuotedSpan(t.text, context, passages);
        if (problem && problem.reason !== "no-citation") {
          yield* refuse(`quotation ${problem.reason}: ${problem.text.slice(0, 60)}`);
          return;
        }
        if (problem) log("quotation released without a detected citation", problem.text.slice(0, 60));
        yield* emit(t.raw, citationTextOf(t));
        released = end;
      }
      start = end;
    }
  }

  /** Drops released text no rule can read any more. */
  function forgetReleased(): void {
    const drop = released - LOOK_BEHIND_CHARS;
    if (drop <= 0) return;
    buf = buf.slice(drop);
    released -= drop;
    discarded += drop;
  }

  try {
    for await (const text of tokens) {
      if (refused) return;
      if (!text) continue;
      buf += text;
      yield* advance(false);
      forgetReleased();
    }
  } catch (error) {
    // Generation died with the opening still held. Release what is stable —
    // SCREENED, never raw — before the failure propagates: `FAILURE_NOTICE`
    // promises nothing above it is affected (found by story 2's own suite).
    if (!openingDone && !refused) {
      const { stable } = lex(buf, false);
      if (stable > 0) yield* releaseOpening(buf.slice(0, stable), false);
    }
    throw error;
  }
  if (!refused) yield* advance(true);
}
