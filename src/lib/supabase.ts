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

/** The one method this module needs from a Supabase client, stated narrowly so
 *  a test can hand in a recording fake. A real `SupabaseClient` satisfies it. */
export interface RpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** The table read the reconciliation step needs, stated as narrowly as the RPC
 *  surface above so a test can hand in a recording fake. Keyset pagination:
 *  `gt` on the ordered column is the cursor, so the read never depends on
 *  offsets or on how many rows the server chose to return. */
export interface TableClient {
  from(table: string): {
    select(columns: string): {
      gt(
        column: string,
        value: string,
      ): {
        order(
          column: string,
          options: { ascending: boolean },
        ): {
          limit(
            count: number,
          ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };
}

export type StoreClient = RpcClient & TableClient;

/** Rows requested per page of the URL listing. Deliberately NOT load-bearing:
 *  with keyset pagination the read ends on an EMPTY page, so a server that
 *  returns fewer rows than asked is handled rather than mistaken for the end.
 *  A short page used to mean "last page", which encoded someone else's server
 *  configuration into the step that deletes. */
export const URL_PAGE_SIZE = 1000;

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

  const { data, error } = await client.rpc("match_policy_chunks", args);
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
export function createSupabaseChunkStore(client: StoreClient): ChunkStore {
  return {
    async listDocumentUrls() {
      const urls = new Set<string>();
      // Every URL sorts above the empty string, so the first page needs no
      // special case. The cursor advances past ALL rows sharing a URL, which is
      // exactly right: only distinct URLs are wanted, and it guarantees progress.
      let cursor = "";
      for (;;) {
        const { data, error } = await client
          .from("policy_chunks")
          .select("url")
          .gt("url", cursor)
          .order("url", { ascending: true })
          .limit(URL_PAGE_SIZE);
        if (error) throw new Error(`listing document urls failed: ${error.message}`);
        const rows = z.array(z.object({ url: z.string() })).safeParse(data);
        if (!rows.success) {
          throw new Error(
            `listing document urls returned rows of an unexpected shape:\n${z.prettifyError(rows.error)}`,
          );
        }
        if (rows.data.length === 0) break;
        for (const row of rows.data) urls.add(row.url);
        const next = rows.data[rows.data.length - 1].url;
        if (next <= cursor) {
          // The server ignored the ordering or the cursor; continuing would loop
          // forever or silently skip rows, and this list drives deletion.
          throw new Error(
            `listing document urls did not advance past ${JSON.stringify(cursor)}; ` +
              `refusing to build a deletion plan from an unordered read`,
          );
        }
        cursor = next;
      }
      return [...urls].sort();
    },

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
