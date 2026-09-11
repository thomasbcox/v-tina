import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { RetrievedPolicyChunk } from "../types";
import { EMBEDDING_DIMENSIONS } from "./embeddings";
import { DOCUMENT_KINDS } from "./ingest/metadata";
import type { ChunkStore, NewPolicyChunk } from "./ingest/pipeline";

/**
 * The Supabase boundary: retrieval (User Story 1's `queryPolicyChunks`) and the
 * store the ingestion pipeline writes through.
 *
 * SQL owns ranking, filtering and the argument guards (see the migration);
 * TypeScript owns mapping. The client is passed in, never read from
 * `process.env` at module level, so tests inject a fake and each runtime builds
 * its own client from its own validated environment contract.
 */

/** The largest result count `match_policy_chunks` will serve. The guard lives
 *  in SQL, where a direct caller cannot bypass it; a unit test holds this equal
 *  to the migration's value so the documented maximum is the enforced one. */
export const MAX_MATCH_COUNT = 50;

/**
 * The similarity below which a chunk is not considered grounding for an answer.
 *
 * **Measured, not assumed.** The specification names 0.7, but that number was
 * written before any corpus existed and it does not discriminate for the
 * embedding model the specification also chose. Against the seed corpus on
 * 2026-09-08, over six in-scope and five out-of-scope questions:
 *
 * - worst in-scope question's best hit: 0.732
 * - best out-of-scope question's hit:   0.718
 *
 * So 0.7 admits noise: a question about highway funding retrieved an unrelated
 * passage of EO 23-02 at 0.718. This value sits above every measured
 * out-of-scope hit and below every measured in-scope one.
 *
 * **The margin is 0.014 over eleven questions, which is thin, and it will move
 * as the corpus grows.** Treat this as a measured starting point to re-check
 * when the corpus changes, not a settled constant. Erring high is deliberate:
 * refusing to answer a question it could have grounded is a smaller harm than
 * answering one it could not. The README documents this number and a test holds
 * the two equal.
 */
export const DEFAULT_MATCH_THRESHOLD = 0.73;

export type RpcResult = { data: unknown; error: { message: string } | null };

/**
 * What `rpc` hands back: awaitable, and — on the real client — able to carry a
 * cancellation signal.
 *
 * `abortSignal` is **optional** so a recording fake can keep returning a plain
 * promise. Where it exists the caller's signal reaches the database, so a query
 * begun for a reader who has since disconnected does not run to completion.
 */
export interface RpcBuilder extends PromiseLike<RpcResult> {
  abortSignal?(signal: AbortSignal): PromiseLike<RpcResult>;
}

/** The one method this module needs from a Supabase client, stated narrowly so
 *  a test can hand in a recording fake. A real `SupabaseClient` satisfies it. */
export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): RpcBuilder;
}

/** Attaches the caller's signal when the client supports it, and otherwise
 *  awaits the builder unchanged — which is what every test fake does. */
function withSignal(builder: RpcBuilder, signal?: AbortSignal): PromiseLike<RpcResult> {
  return signal && builder.abortSignal ? builder.abortSignal(signal) : builder;
}

export function createSupabaseClient(url: string, key: string): SupabaseClient {
  // No user sessions anywhere in V-Tina; nothing to persist.
  return createClient(url, key, { auth: { persistSession: false } });
}

const matchRowSchema = z.object({
  id: z.string(),
  content: z.string(),
  chunk_index: z.number().int(),
  document_title: z.string(),
  document_date: z.string(),
  url: z.string(),
  pillar: z.string(),
  document_kind: z.enum(DOCUMENT_KINDS),
  similarity: z.number(),
});

export type MatchRow = z.infer<typeof matchRowSchema>;

export function toRetrievedPolicyChunk(row: MatchRow): RetrievedPolicyChunk {
  return {
    id: row.id,
    content: row.content,
    chunkIndex: row.chunk_index,
    source: {
      documentTitle: row.document_title,
      date: row.document_date,
      url: row.url,
      pillar: row.pillar,
      documentKind: row.document_kind,
    },
    similarity: row.similarity,
  };
}

/**
 * Semantic retrieval: the chunks most similar to `embedding`, most similar
 * first, none at or below `matchThreshold`, at most `matchCount`, and only from
 * `pillar` when one is given. Those guarantees are the SQL function's.
 */
export async function queryPolicyChunks(
  client: RpcClient,
  embedding: number[],
  matchThreshold: number,
  matchCount: number,
  pillar?: string,
  signal?: AbortSignal,
): Promise<RetrievedPolicyChunk[]> {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `query embedding has ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
  const args: Record<string, unknown> = {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  };
  // Omitted, not sent empty: the SQL default (null) means "no filter".
  if (pillar !== undefined) args.filter_pillar = pillar;

  const { data, error } = await withSignal(
    client.rpc("match_policy_chunks", args),
    signal,
  );
  if (error) throw new Error(`match_policy_chunks failed: ${error.message}`);

  const rows = z.array(matchRowSchema).safeParse(data);
  if (!rows.success) {
    throw new Error(
      `match_policy_chunks returned rows of an unexpected shape:\n${z.prettifyError(rows.error)}`,
    );
  }
  return rows.data.map(toRetrievedPolicyChunk);
}

/** The JSON row `replace_document_chunks` expects. The embedding travels as
 *  pgvector's text form and is cast in SQL. */
function toStoredRow(row: NewPolicyChunk) {
  return {
    content: row.content,
    chunk_index: row.chunkIndex,
    document_title: row.source.documentTitle,
    document_date: row.source.date,
    url: row.source.url,
    pillar: row.source.pillar,
    document_kind: row.source.documentKind,
    embedding: `[${row.embedding.join(",")}]`,
  };
}

/** The ingestion pipeline's store, backed by the transactional
 *  `replace_document_chunks` function. Needs a service-role client: the public
 *  roles can neither write the table nor execute the function. */
export function createSupabaseChunkStore(client: RpcClient): ChunkStore {
  return {
    async replaceDocument(url, rows) {
      const { data, error } = await client.rpc("replace_document_chunks", {
        p_url: url,
        p_rows: rows.map(toStoredRow),
      });
      if (error) throw new Error(`replace_document_chunks failed: ${error.message}`);
      const count = z.number().int().nonnegative().safeParse(data);
      if (!count.success) {
        throw new Error(
          `replace_document_chunks returned ${JSON.stringify(data)} instead of a row count`,
        );
      }
      return count.data;
    },
  };
}
