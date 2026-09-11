/**
 * Why an exchange failed, from a closed vocabulary.
 *
 * Deliberately coarse, and deliberately NOT a free-text message. Every error
 * upstream carries internal detail — `EmbeddingError` embeds HTTP statuses,
 * `queryPolicyChunks` embeds the database's own error text, the chat client
 * embeds response bodies — and none of that goes to a member of the public
 * reading answers from a service that speaks in a sitting governor's name. The
 * detail is logged server-side; only this crosses the wire.
 *
 * This lives in a runtime module rather than the shared type barrel so the
 * barrel stays declaration-only, exactly as `SAFETY_CLASSIFICATIONS` does. The
 * array is the authority; the type derives from it, so a test can compare the
 * vocabulary against the contract — a type alone leaves nothing to check.
 */
export const FAILURE_REASONS = [
  "classification",
  "retrieval",
  "generation",
  "unknown",
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];
