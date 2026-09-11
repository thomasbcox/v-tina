import type { ChatStreamEvent, RetrievedPolicyChunk } from "../../types";
import {
  ANSWER_SYSTEM_PROMPT,
  FAILURE_NOTICE,
  GROUNDED_DEFERRAL,
} from "../prompts";
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

export interface Retriever {
  /** The chunks grounding this question, above the project's declared
   *  threshold, most similar first. Throws if the store is unreachable — see
   *  the note on `retrieval` below for why that must not be swallowed. */
  (question: string): Promise<RetrievedPolicyChunk[]>;
}

export interface Rewriter {
  /** A neutral restatement of a hostile question. */
  (question: string): Promise<string>;
}

export interface Classifier {
  (question: string): Promise<ClassificationResult>;
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

  // --- classify -----------------------------------------------------------
  // Fails CLOSED. A verdict that did not arrive, did not parse, or was not a
  // member of SAFETY_CLASSIFICATIONS is treated exactly as out of bounds:
  // nothing is embedded, nothing is searched, the answering model is never
  // called. A flaky classifier makes this service useless rather than wrong,
  // which is the right way round for an avatar wearing a sitting governor's name.
  let verdict: ClassificationResult;
  try {
    verdict = await deps.classify(asked);
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
      neutralised = (await deps.rewrite(asked)).trim();
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
  let chunks: RetrievedPolicyChunk[];
  try {
    chunks = await deps.retrieve(question);
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
  try {
    for await (const text of deps.answer(
      buildAnswerMessages(body, question, chunks),
      signal,
    )) {
      if (text) yield { type: "streamed_tokens", text };
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
