import { SAFETY_CLASSIFICATIONS } from "./safety";

/**
 * The prompts V-Tina runs on.
 *
 * Two kinds live here and they are not equal in standing.
 *
 * **Routing prompts** — the classifier and the neutralising rewrite — are this
 * story's own work. They produce a label or a rephrased question, never prose a
 * reader sees, so they carry no voice and nothing later replaces them.
 *
 * **Voice-bearing prompts** — the deferral the reader actually reads, and the
 * system prompt the answering model writes under — are PROVISIONAL. User Story 2
 * was deliberately cut so that Governor Kotek's voice (her lexicon, her four-step
 * pacing, the AI-ism validator, the legislative deflection framework) is User
 * Story 3's subject rather than a side effect of building the router. The
 * placeholder below is deliberately plain, chosen at this story's approval stop
 * precisely so that nobody mistakes it for a decision about how she sounds.
 *
 * `PROVISIONAL_PROMPTS` is the machine-readable form of that warning, and the
 * README documents the same list with a test holding the two equal — the pattern
 * the domain allowlist, the pillar list and the retrieval threshold already use.
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
 * **PROVISIONAL.** This is what the public reads, so it carries voice; Story 3
 * writes the real one.
 */
export const GROUNDED_DEFERRAL = `That falls outside what I can speak to here. This service answers from Oregon executive and legislative records on housing and homelessness, behavioral health, and education — and only where those records actually support an answer.

For anything else about Oregon state government, the official state portal is the place to start: ${OREGON_PORTAL_URL}`;

/**
 * The answering model's instruction.
 *
 * **PROVISIONAL, and deliberately plain.** It does one job — keep the answer
 * inside the retrieved passages — and makes no attempt at how the Governor
 * sounds. That was decided at this story's approval stop: a plausible-sounding
 * placeholder is worse than an obviously unfinished one, because Story 3 would
 * inherit it and ratify a voice that was never designed.
 *
 * Grounding is the one thing that must hold even while the voice is a
 * placeholder, which is why it is stated here in the imperative and asserted as
 * acceptance criterion 8.
 */
export const ANSWER_SYSTEM_PROMPT = `You answer questions about Oregon state policy using ONLY the source passages provided in this conversation.

Rules:
- Every factual claim you make must be supported by one of the provided passages. If the passages do not support an answer, say so plainly rather than filling the gap.
- Do not use anything you know about Oregon, its government, or its officials from outside these passages. Not dates, not numbers, not programme names, not who holds which office.
- Do not overstate what a passage says, and do not reverse its direction. If a passage describes a reduction, do not describe an increase.
- Refer to documents by the titles given with the passages, so a reader can check them.
- Do not speculate about motives, politics, parties, elections, or individuals.

This is a placeholder instruction. It governs accuracy only and says nothing about tone or style.`;

/**
 * What the reader is told when the answer fails mid-stream. Fixed text: the
 * underlying error carries HTTP statuses, database messages and provider
 * response bodies, and none of that goes to a member of the public.
 */
export const FAILURE_NOTICE = `Something went wrong while I was answering. Nothing above this point is affected, but the answer is incomplete.`;

/**
 * The prompts above that carry V-Tina's voice, and which User Story 3 replaces.
 *
 * This list exists so the placeholder cannot be mistaken for a decision. The
 * README documents the same names and a test holds the two equal in both
 * directions, so a prompt cannot quietly leave this list while still shipping
 * voice.
 */
export const PROVISIONAL_PROMPTS = [
  "GROUNDED_DEFERRAL",
  "ANSWER_SYSTEM_PROMPT",
  "FAILURE_NOTICE",
] as const;

export type ProvisionalPrompt = (typeof PROVISIONAL_PROMPTS)[number];

/**
 * The prompts that carry no voice and which Story 3 does NOT replace: they
 * produce a label and a rephrased question, never prose a reader sees.
 *
 * Declared so this list and PROVISIONAL_PROMPTS form an exhaustive partition of
 * every prompt this module exports. A test asserts exactly that, which is what stops a new
 * voice-bearing prompt from shipping unlisted — a prompt added to neither list
 * fails, so classifying it is not optional.
 */
export const ROUTING_PROMPTS = [
  "CLASSIFIER_SYSTEM_PROMPT",
  "REWRITE_SYSTEM_PROMPT",
] as const;

export type RoutingPrompt = (typeof ROUTING_PROMPTS)[number];
