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

/** Where a policy chunk came from. Every field is required: the verification UI
 *  (User Story 4) must be able to render a citation for any chunk it receives. */
export interface PolicyChunkSource {
  /** Title of the source document, e.g. "EO 23-02". */
  documentTitle: string;
  /** ISO-8601 date of the source document, e.g. "2023-01-10". */
  date: string;
  /** Canonical public URL for the document, e.g. an oregon.gov link. */
  url: string;
  /** The policy pillar this document belongs to. */
  pillar: string;
}

/** A stored passage plus its complete source metadata, as the ingestion pipeline
 *  writes it (User Story 1). Nothing has been searched yet, so there is no
 *  similarity score — see {@link RetrievedPolicyChunk} for the retrieval side. */
export interface PolicyChunk {
  id: string;
  content: string;
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

import type { SafetyClassification } from "../lib/safety";

// Re-exported so consumers get the whole boundary from one place, while the
// runtime value it derives from stays in the safety module.
export type { SafetyClassification };

/** Events streamed by `/api/chat`. A discriminated union on `type` — the four
 *  kinds the backend contract names, with no catch-all member, so consumers
 *  narrow exhaustively rather than falling through to an untyped branch. */
export type ChatStreamEvent =
  | { type: "safety_status"; classification: SafetyClassification }
  | { type: "retrieved_chunks"; chunks: RetrievedPolicyChunk[] }
  | { type: "streamed_tokens"; text: string }
  | { type: "audit_log_status"; recorded: boolean; auditId?: string };
