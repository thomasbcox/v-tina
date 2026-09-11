import { z } from "zod";
import type { RetrievedPolicyChunk } from "../../types";
import { SAFETY_CLASSIFICATIONS } from "../safety";

/**
 * The `/api/chat` wire contract, as a runtime schema.
 *
 * **The schema is the authority and the TypeScript type is derived from it**, not
 * the other way round. That ordering is the point: the union used to exist only
 * as a type, so the server's own tests hand-wrote a checker for it and User Story
 * 4 would have written a second one — two validators for one contract, each free
 * to drift. Now there is one definition, and both ends `parse` against it.
 *
 * Approach review finding 1 (2026-09-10). zod is already this repository's
 * boundary-validation idiom: the embeddings client, the retrieval rows and the
 * request body are all validated this way.
 */

/**
 * A retrieved passage as it crosses the wire.
 *
 * Annotated with the interface rather than inferring a second shape, so the
 * compiler refuses a schema that has fallen behind `RetrievedPolicyChunk`. The
 * interface stays where every workstream already reads it; this is the runtime
 * check for it, not a rival declaration.
 */
const retrievedChunkSchema: z.ZodType<RetrievedPolicyChunk> = z.object({
  id: z.string(),
  content: z.string(),
  chunkIndex: z.number().int(),
  source: z.object({
    documentTitle: z.string(),
    date: z.string(),
    url: z.string(),
    pillar: z.string(),
    documentKind: z.enum(["executive", "legislative"]),
  }),
  similarity: z.number(),
});

/**
 * Why an exchange failed, from a closed vocabulary.
 *
 * Deliberately coarse, and deliberately NOT a free-text message. Every error
 * upstream carries internal detail — `EmbeddingError` embeds HTTP statuses,
 * `queryPolicyChunks` embeds the database's own error text, the chat client
 * embeds response bodies — and none of that goes to a member of the public
 * reading answers from a service that speaks in a sitting governor's name. The
 * detail is logged server-side; only this crosses the wire.
 */
export const FAILURE_REASONS = [
  "classification",
  "retrieval",
  "generation",
  "unknown",
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];

/**
 * Every record `/api/chat` can emit. A discriminated union on `type`, with no
 * catch-all member, so consumers narrow exhaustively rather than falling through
 * to an untyped branch.
 */
export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("safety_status"),
    classification: z.enum(SAFETY_CLASSIFICATIONS),
    /** The neutralised question this exchange will actually search on, present
     *  only on the partisan path. Shown to the reader deliberately: silently
     *  rewording someone's own words is the less honest option for a service
     *  whose premise is that every claim can be checked. */
    neutralisedQuestion: z.string().optional(),
  }),
  z.object({
    type: z.literal("retrieved_chunks"),
    chunks: z.array(retrievedChunkSchema),
  }),
  z.object({ type: z.literal("streamed_tokens"), text: z.string() }),
  z.object({
    type: z.literal("audit_log_status"),
    recorded: z.boolean(),
    auditId: z.string().optional(),
  }),
  /** A failure after the response has already begun. Without it a stream that
   *  simply stopped would be indistinguishable from a complete answer. */
  z.object({
    type: z.literal("error"),
    reason: z.enum(FAILURE_REASONS),
    notice: z.string(),
  }),
]);

export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
