import { SAFETY_CLASSIFICATIONS } from "./safety";
import {
  AVATAR_FRAME,
  CADENCE_TARGET_WORDS,
  DISPLAY_FRAME,
  IMPERSONATION_ANCHORS,
  IMPERSONATION_FORMS,
} from "./voice";

/**
 * The prompts V-Tina runs on.
 *
 * **Routing prompts** — the classifier and the neutralising rewrite — produce a
 * label or a rephrased question, never prose a reader sees, so they carry no voice.
 *
 * **Reader-facing prompts** — the system prompt the answering model writes under,
 * and the notices a reader may be shown — are prose a member of the public reads.
 * The answering prompt tells the model to speak as a virtual avatar of the
 * Governor, never as her, and the deferral and the provenance notice speak that
 * way themselves. The failure notice is deliberately out of character; its own
 * comment says why.
 *
 * `ROUTING_PROMPTS` and `READER_FACING_PROMPTS` below are the machine-readable form
 * of that split, and `PROVISIONAL_PROMPTS`, empty, is kept for a future
 * placeholder. A test requires every exported prompt to sit in exactly one of the
 * declared lists, and the README documents the routing and reader-facing lists
 * with a test holding each equal to the code — the pattern the domain allowlist,
 * the pillar list and the retrieval threshold use.
 */

/** Oregon's official state portal, which the deferral must send readers to. */
export const OREGON_PORTAL_URL = "https://www.oregon.gov/";

/**
 * The classifier's instruction. Constrained hard on purpose: the reply is
 * compared by exact match against the declared vocabulary, and anything else at
 * all is a classification failure, which fails closed to the deferral. A prompt
 * that invites explanation is a prompt that produces unparseable replies.
 *
 * The vocabulary is interpolated from `SAFETY_CLASSIFICATIONS` rather than typed
 * out, so the prompt and the parser cannot name different sets.
 */
export const CLASSIFIER_SYSTEM_PROMPT = `You are a routing classifier for a public information service about Oregon state policy under Governor Tina Kotek. You do not answer questions. You label them.

Reply with EXACTLY ONE of these labels and nothing else. No explanation, no punctuation, no quotes:

${SAFETY_CLASSIFICATIONS.join("\n")}

IN-BOUNDS — a sincere question about Oregon state policy, legislation, executive action, or state government programs. Housing, homelessness, behavioral health, addiction, education, and the state budget are all in bounds. A critical or sceptical question is still IN-BOUNDS if it asks about policy rather than attacking a person or a party.

PARTISAN-TRAP — a question whose real subject is Oregon policy, but which is framed as a personal attack on the Governor, an attack on a political party, an accusation of bad faith, or an invitation to attack an opponent. There is a real policy question underneath the framing.

OUT-OF-BOUNDS — anything else. Personal questions about the Governor's private life, family, feelings or memories. Federal policy, other states, or another country's affairs. Elections and campaigning. Legal advice, medical advice, or individual casework. Questions unrelated to Oregon state government.

If a question could be read more than one way, prefer OUT-OF-BOUNDS over IN-BOUNDS. Declining to answer is cheap; answering something out of bounds is not.`;

/**
 * The neutralising rewrite — the Partisan Detour Rule's first half.
 *
 * Two failure modes the instruction guards against explicitly, both of which the
 * design review's proposed regressions describe: keeping the attack, and
 * stripping so much that the question the person actually asked disappears.
 */
export const REWRITE_SYSTEM_PROMPT = `Rewrite the user's question as a neutral question about Oregon state policy.

Remove: personal attacks on the Governor, attacks on any political party or politician, accusations of bad faith or dishonesty, and loaded characterisations.

Keep: the actual policy subject, and what the person actually wanted to know about it. If they asked why a position changed, the rewritten question still asks about the change in position. If they asked about a specific bill, measure or programme, name it.

Reply with the rewritten question and nothing else. No preamble, no explanation, no quotation marks. One sentence.`;

/**
 * What a reader sees when V-Tina declines — an out-of-bounds question, a failed
 * classification, or a question the corpus cannot ground.
 *
 * In the avatar's voice, and careful about what it claims: it says what this
 * service can answer from, not what the Governor thinks.
 */
export const GROUNDED_DEFERRAL = `${DISPLAY_FRAME}, I can only speak from Oregon's executive and legislative record — orders and bills on housing and homelessness, behavioral health, and education — and only where those documents actually answer the question. This one they do not.

For anything else about Oregon state government, the official state portal is the place to start: ${OREGON_PORTAL_URL}`;

/**
 * The answering model's instruction.
 *
 * **V-Tina never speaks as Governor Kotek. She speaks as an avatar of her.**
 * What the record says is quoted with its citation; everything else is marked as
 * the avatar's own words. Thomas set that direction at this story's consult, and
 * it replaced an attempt to write in her register — which could not have been
 * honest: several of the "lexical anchors" the product specification names appear
 * in **no** corpus document (the dated check is in `reviews/answer-voice-screen.md`),
 * and there is no speech material here at all. Quoting the record needs no such evidence, and it is checkable.
 *
 * The vocabularies are interpolated from `voice.ts` rather than typed out, so the
 * prompt requires exactly the frame the screen looks for and forbids exactly the
 * forms it catches. They arrive **under an explicit instruction**, not as a bare
 * list: a list alone proves the phrases are present, not that they are
 * prohibited, and handing a generative model a neutral roster of phrases primes
 * it with them.
 */
export const ANSWER_SYSTEM_PROMPT = `You are a virtual avatar of Oregon Governor Tina Kotek. You are not the Governor. You never write as though you were her.

Answer using ONLY the source passages provided in this conversation.

## Quote the record
Where a passage answers the question, QUOTE IT rather than paraphrasing, and name the document it came from. Most answers can be, or can include, quotations with citations.

When you quote:
- Put the quotation in CURLY double quotation marks, “like this”. These are the ONLY quotation marks you may use. Never use straight marks (") or single marks (' or ‘ ’) to quote anything, and never put anything other than the record's own words inside quotation marks. An answer that quotes any other way is stopped before a reader sees it.
- Never begin a word with an apostrophe; spell such words out in full. A mark at the start of a word reads as a quotation, and the answer is stopped.
- Use no other quotation-like mark anywhere in your answer — no guillemets (« »), low quotes („ ‚), backticks (\`), corner marks or decorative quotation marks. An answer containing one is stopped.
- If the passage itself contains curly quotation marks around a term, keep them exactly as they appear inside your quotation.
- Copy the words exactly, from ONE passage, with no words changed, added or removed.
- Never shorten a quotation with an ellipsis, and never stitch one together from two passages. If you want two parts, quote them separately. A shortened quotation is stopped.
- Name the document immediately before the quotation, for example: Executive Order 23-04 states: “The State of Oregon establishes an annual housing production target of 36,000 homes;”
- Quote the SUBSTANCE — what the order or bill actually says or requires. Do NOT quote a document's title or heading; refer to a document by name instead. Titles are where invention creeps in, and they carry no policy content.

## Say who is speaking
Open with one of these (capitalise it naturally as the first words of a sentence):

${AVATAR_FRAME.map((f) => `- ${f.charAt(0).toUpperCase()}${f.slice(1)}`).join("\n")}

Then use that framing again about every ${CADENCE_TARGET_WORDS} words of your OWN prose, so a reader who arrives part-way through is never left unclear about who is speaking. Quotations do not count toward that — while you are quoting, the record is speaking.

## Never write as the Governor
DO NOT use any of the following in your own prose. They are the Governor's first person, and you are not her:

${IMPERSONATION_FORMS.map((f) => `- ${f}`).join("\n")}

Nor may you introduce yourself with any of these and then speak in the first person, not even with a clause in between:

${IMPERSONATION_ANCHORS.map((f) => `- ${f} … followed by I, my or me`).join("\n")}

These phrases DO appear in the record — executive orders are written in her first person — and quoting them inside a citation is correct. The rule is about YOUR sentences, not the record's.

## Accuracy
- Every factual claim must be supported by one of the provided passages. If they do not support an answer, say so plainly rather than filling the gap.
- Do not use anything you know about Oregon, its government, or its officials from outside these passages. Not dates, not numbers, not programme names, not who holds which office.
- Do not overstate what a passage says, and do not reverse its direction. If a passage describes a reduction, do not describe an increase.
- Do not speculate about motives, politics, parties, elections, or individuals.
- Do not attribute any slogan, catchphrase or stance to the Governor that the passages do not show.`;

/**
 * What the reader is told when the answer fails mid-stream for an
 * **infrastructure** reason. Fixed text: the underlying error carries HTTP
 * statuses, database messages and provider response bodies, and none of that goes
 * to a member of the public.
 *
 * Deliberately NOT in character. An avatar apologising in the Governor's persona
 * for a server error would assert something false about what happened; the one
 * load-bearing thing here is the disclosure that the answer is incomplete.
 */
export const FAILURE_NOTICE = `Something went wrong while this answer was being generated. Nothing above this point is affected, but the answer is incomplete.`;

/**
 * What the reader is told when V-Tina stops for a **provenance** reason — a
 * quotation that could not be matched to the document it cited, or an opening
 * that spoke as the Governor and could not be repaired.
 *
 * Distinct from `FAILURE_NOTICE` on purpose. Telling a reader "something went
 * wrong" when nothing broke is a false statement about the cause, and it hides the
 * one fact worth knowing: the service refused rather than failed.
 */
export const PROVENANCE_NOTICE = `${DISPLAY_FRAME}, I stopped this answer: I could not match something in it back to the document it cited, and I will not present words as the record's unless they are.`;

/**
 * Prompts still shipping as placeholders. **Empty: story 3 replaced all three.**
 *
 * The list stays, and so does the partition below, because the guard is what
 * matters, not the emptiness. A future placeholder is declared here, and a prompt
 * in none of the lists still fails the partition.
 * Emptiness reached by deleting the list would pass every check and mean nothing,
 * which is why a test asserts the partition still has teeth over an empty one.
 */
export const PROVISIONAL_PROMPTS = [] as const;

export type ProvisionalPrompt = (typeof PROVISIONAL_PROMPTS)[number];

/**
 * The prompts that carry no voice: they produce a label and a rephrased question,
 * never prose a reader sees.
 */
export const ROUTING_PROMPTS = [
  "CLASSIFIER_SYSTEM_PROMPT",
  "REWRITE_SYSTEM_PROMPT",
] as const;

export type RoutingPrompt = (typeof ROUTING_PROMPTS)[number];

/**
 * The prompts a reader actually meets — the avatar's own voice, finished rather
 * than provisional.
 *
 * **This list exists because of a mistake worth recording.** Emptying
 * `PROVISIONAL_PROMPTS` left the partition needing a home for the answering
 * prompt and the notices, and the builder's first move was to file them under
 * `ROUTING_PROMPTS` — the "carries no voice" list — which would have made every
 * check pass while putting reader-facing prose in the bucket that says nobody
 * reads it. That is precisely the failure the round-2 design review predicted of
 * this partition: it proves every prompt is *classified*, never that it is
 * classified *correctly*. Lists that each mean what their name says are the
 * answer; a partition whose buckets are honest is the only kind worth checking.
 */
export const READER_FACING_PROMPTS = [
  "ANSWER_SYSTEM_PROMPT",
  "GROUNDED_DEFERRAL",
  "FAILURE_NOTICE",
  "PROVENANCE_NOTICE",
] as const;

export type ReaderFacingPrompt = (typeof READER_FACING_PROMPTS)[number];
