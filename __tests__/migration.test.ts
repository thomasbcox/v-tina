import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS } from "../src/lib/embeddings";
import { DOCUMENT_KINDS } from "../src/lib/ingest/metadata";
import { MAX_MATCH_COUNT } from "../src/lib/supabase";

/**
 * The schema and the code each declare the same facts — the vector dimension,
 * the result-count ceiling, the document-kind set. The code's constants are the
 * source; these tests hold the migration equal to them, so changing one without
 * the other fails here with no edit to the test.
 */

const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url);

/** The migration that creates policy_chunks: the extent is every migration file,
 *  so the test does not silently pin one filename. */
function policyChunksMigration(): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  const matching = files.filter((f) =>
    /create table public\.policy_chunks\b/.test(readFileSync(new URL(f, MIGRATIONS), "utf8")),
  );
  expect(matching, "exactly one migration creates public.policy_chunks").toHaveLength(1);
  return readFileSync(new URL(matching[0], MIGRATIONS), "utf8");
}

/** The body of the `create table public.policy_chunks (...)` statement only,
 *  so a `vector(N)` elsewhere in the file cannot satisfy the check. */
function tableBody(sql: string): string {
  const m = /create table public\.policy_chunks\s*\(([\s\S]*?)\n\);/.exec(sql);
  expect(m, "policy_chunks create-table statement not found").not.toBeNull();
  return m![1];
}

describe("the policy_chunks migration agrees with the code (AC7)", () => {
  const sql = policyChunksMigration();

  it("declares the embedding column with the code's vector dimension", () => {
    const column = /^\s*embedding\s+(?:extensions\.)?vector\((\d+)\)/m.exec(tableBody(sql));
    expect(column, "policy_chunks.embedding vector(N) column not found").not.toBeNull();
    expect(Number(column![1])).toBe(EMBEDDING_DIMENSIONS);
  });

  it("declares match_policy_chunks's query parameter with the same dimension", () => {
    const param = /query_embedding\s+(?:extensions\.)?vector\((\d+)\)/.exec(sql);
    expect(param, "match_policy_chunks query_embedding parameter not found").not.toBeNull();
    expect(Number(param![1])).toBe(EMBEDDING_DIMENSIONS);
  });

  it("guards match_count with the code's documented maximum", () => {
    const guard = /match_count\s*>\s*(\d+)/.exec(sql);
    expect(guard, "match_count upper-bound guard not found").not.toBeNull();
    expect(Number(guard![1])).toBe(MAX_MATCH_COUNT);
  });

  it("constrains document_kind to exactly the code's declared kinds", () => {
    const check = /document_kind\s+in\s*\(([^)]*)\)/.exec(tableBody(sql));
    expect(check, "document_kind check constraint not found").not.toBeNull();
    const declared = check![1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .sort();
    expect(declared).toEqual([...DOCUMENT_KINDS].sort());
  });
});
