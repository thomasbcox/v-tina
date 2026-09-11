/**
 * Shared boundary types for V-Tina.
 *
 * These are the contracts the workstreams in `v-tina-user-stories.md` hand each
 * other. They are declarations only — no runtime code and no dependency — so any
 * workstream can import them without pulling in another's implementation.
 *
 * Values here are taken from the specification's own acceptance criteria, not
 * paraphrased, so the QA workstream's assertions and the backend's code agree.
 */

import type { DocumentKind } from "../lib/ingest/metadata";
import type { SafetyClassification } from "../lib/safety";

// Re-exported so consumers get the whole boundary from one place, while the
// runtime values they derive from stay in their own modules.
export type { DocumentKind, SafetyClassification };

// The chat wire contract is declared as a runtime schema and its type derived
// from it, so there is one definition for the server and the client to share.
// Re-exported here so consumers still get the whole boundary from one place.
export type { ChatStreamEvent, FailureReason } from "../lib/chat/events";

/** Where a policy chunk came from. Every field is required: the verification UI
 *  (User Story 4) must be able to render a citation for any chunk it receives. */
export interface PolicyChunkSource {
  /** Title of the source document, e.g. "EO 23-02". */
  documentTitle: string;
  /** The as-of date, ISO-8601, e.g. "2023-01-10": the date the content is
   *  current as of — an order's signing date, a revised page's last revision.
   *  Among equally similar chunks retrieval prefers the most recent. */
  date: string;
  /** Canonical public URL for the document, on an allowed official domain. */
  url: string;
  /** The policy pillar this document belongs to. */
  pillar: string;
  /** Executive file or legislative history; among equally similar chunks
   *  retrieval prefers executive. */
  documentKind: DocumentKind;
}

/** A stored passage plus its complete source metadata, as the ingestion pipeline
 *  writes it (User Story 1). Nothing has been searched yet, so there is no
 *  similarity score — see {@link RetrievedPolicyChunk} for the retrieval side. */
export interface PolicyChunk {
  id: string;
  content: string;
  /** Zero-based position of this chunk within its document. */
  chunkIndex: number;
  source: PolicyChunkSource;
}

/**
 * A chunk returned by semantic search. `similarity` is **required**, because
 * User Story 1's acceptance criteria require retrieval to return chunks with a
 * similarity score above 0.7 — a result without one cannot be judged against
 * that threshold, ranked, or shown in the verification panel.
 *
 * Note: the specification sketches `queryPolicyChunks` as returning
 * `PolicyChunk[]`, while its acceptance criteria require the score. The criteria
 * are the binding assertion, so retrieval returns this extended type.
 */
export interface RetrievedPolicyChunk extends PolicyChunk {
  similarity: number;
}
