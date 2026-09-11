/**
 * The safety classification vocabulary (User Story 2).
 *
 * These are the exact flags the specification's acceptance criteria assert, not
 * paraphrases of the responses they trigger: a `PARTISAN-TRAP` classification is
 * what triggers the Partisan Detour Rule, and `OUT-OF-BOUNDS` is what triggers the
 * Grounded Deferral message. No further value is declared until a workstream's
 * specification actually defines one.
 *
 * This lives in a runtime module rather than the shared type barrel so the barrel
 * stays declaration-only. The array is the authority; the type is derived from it,
 * so a test can compare the vocabulary against the specification — a type alone
 * leaves nothing to check, which is how it drifted from the spec originally.
 */
export const SAFETY_CLASSIFICATIONS = [
  "IN-BOUNDS",
  "PARTISAN-TRAP",
  "OUT-OF-BOUNDS",
] as const;

export type SafetyClassification = (typeof SAFETY_CLASSIFICATIONS)[number];

/**
 * The wall-clock budget for the WHOLE classification step, retries and backoff
 * included.
 *
 * **The specification asks for 100ms and this is not that.** A network round
 * trip to a hosted model does not complete in 100ms; what is controllable is the
 * model (the 8B one the specification names), a short prompt, a hard cap on the
 * reply length, and an explicit deadline. This is that deadline. The latency
 * actually observed is measured, published in the README, and held at or below
 * this number by a test — the same measure-rather-than-assume treatment the
 * retrieval threshold already gets. Accepted knowingly at this story's approval
 * stop; recorded in `reviews/chat-safety-routing.md`, Open question 2.
 */
export const CLASSIFY_DEADLINE_MS = 3000;

/**
 * The token budget for one classification.
 *
 * **This budgets the model's REASONING, not the label.** Every model the account
 * serves is a reasoning model: it thinks in a separate `reasoning_content` field
 * and puts the bare label in `content`, which is why the exact-match parse works
 * at all. But the cap covers both, so a small cap starves the reasoning and the
 * label never arrives — measured 2026-09-10, a cap of 12 returned an empty
 * `content` from three different models and every question failed closed. The
 * number is generous on purpose: the label is four tokens and the rest is
 * headroom the failure mode above says to leave.
 */
export const CLASSIFY_MAX_TOKENS = 384;

/** The rewrite is one sentence, plus the same reasoning headroom. */
export const REWRITE_MAX_TOKENS = 512;

/**
 * A classification, or the reason there isn't one.
 *
 * Deliberately not `SafetyClassification | null`: the orchestrator treats every
 * failure as out of bounds, but an operator still needs to know whether the
 * service was slow, unreachable, or answering something unrecognised. The
 * failure is reported, never swallowed — it simply does not change the routing.
 */
export type ClassificationResult =
  | { ok: true; classification: SafetyClassification }
  | { ok: false; reason: string };

/** Exact match against the declared vocabulary, after trimming only.
 *
 *  Strictness is the point: this parse is what makes failing closed reliable.
 *  A lenient parse — substring search, case folding, "starts with" — is how a
 *  model's hedged reply ("PARTISAN-TRAP, though it could be read as...") becomes
 *  a confident label. The trimmed value is what gets emitted, so a client
 *  matching the vocabulary exactly never sees a stray space. */
export function parseClassification(reply: string): ClassificationResult {
  const trimmed = reply.trim();
  const match = SAFETY_CLASSIFICATIONS.find((c) => c === trimmed);
  if (match) return { ok: true, classification: match };
  return {
    ok: false,
    reason: `classifier replied with something outside the declared vocabulary: ${JSON.stringify(
      trimmed.slice(0, 80),
    )}`,
  };
}
