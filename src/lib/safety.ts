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
