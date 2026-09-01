/**
 * Shared boundary types for V-Tina.
 *
 * These are the contracts the workstreams in `v-tina-user-stories.md` hand each
 * other. They are declarations only — no runtime code and no dependency — so any
 * workstream can import them without pulling in another's implementation.
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

/** One retrievable passage plus its complete source metadata. Produced by the
 *  database workstream, consumed by the backend and the verification UI. */
export interface PolicyChunk {
  id: string;
  content: string;
  source: PolicyChunkSource;
  /** Similarity score from the semantic query, when the chunk arrived via search. */
  similarity?: number;
}

/** How the safety classifier routed a request. */
export type SafetyClassification =
  | "in_bounds"
  | "partisan_detour"
  | "grounded_deferral"
  | "crisis";

/** Events streamed by `/api/chat`. A discriminated union on `type` — the four
 *  kinds the backend contract names, with no catch-all member, so consumers
 *  narrow exhaustively rather than falling through to an untyped branch. */
export type ChatStreamEvent =
  | { type: "safety_status"; classification: SafetyClassification }
  | { type: "retrieved_chunks"; chunks: PolicyChunk[] }
  | { type: "streamed_tokens"; text: string }
  | { type: "audit_log_status"; recorded: boolean; auditId?: string };
