import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS } from "../src/lib/embeddings";
import type { NewPolicyChunk } from "../src/lib/ingest/pipeline";
import {
  URL_PAGE_SIZE,
  createSupabaseChunkStore,
  createSupabaseClient,
  queryPolicyChunks,
  type MatchRow,
  type RpcClient,
  type StoreClient,
} from "../src/lib/supabase";

/** Records every RPC and answers with whatever the test hands it. `pages`, when
 *  given, answers the paginated table read one page per `.range()` call. */
function fakeClient(
  answer: { data: unknown; error: { message: string } | null },
  pages: { data: unknown; error: { message: string } | null }[] = [],
) {
  const calls: { fn: string; args: Record<string, unknown> | undefined }[] = [];
  const ranges: [number, number][] = [];
  const client: StoreClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(answer);
    },
    from() {
      return {
        select() {
          return {
            range(from: number, to: number) {
              ranges.push([from, to]);
              return Promise.resolve(
                pages[ranges.length - 1] ?? { data: [], error: null },
              );
            },
          };
        },
      };
    },
  };
  return { client, calls, ranges };
}

const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / 1000);

const row: MatchRow = {
  id: "8f2c1a1e-0000-4000-8000-000000000001",
  content: "A retrieved passage.",
  chunk_index: 3,
  document_title: "Fixture EO 00-01",
  document_date: "2023-01-10",
  url: "https://www.oregon.gov/gov/eo/fixture.pdf",
  pillar: "housing",
  document_kind: "executive",
  similarity: 0.83,
};

describe("queryPolicyChunks — forwarding and mapping only (AC5)", () => {
  it("passes the four parameters to match_policy_chunks by name", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await queryPolicyChunks(client, embedding, 0.7, 5, "housing");
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("match_policy_chunks");
    expect(calls[0].args).toEqual({
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 5,
      filter_pillar: "housing",
    });
  });

  it("omits the pillar rather than sending an empty value when none is given", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await queryPolicyChunks(client, embedding, 0.7, 5);
    expect(Object.hasOwn(calls[0].args ?? {}, "filter_pillar")).toBe(false);
  });

  it("maps each row to a RetrievedPolicyChunk with its similarity and full source", async () => {
    const { client } = fakeClient({ data: [row], error: null });
    const [chunk] = await queryPolicyChunks(client, embedding, 0.7, 5);
    expect(chunk).toEqual({
      id: row.id,
      content: row.content,
      chunkIndex: 3,
      source: {
        documentTitle: row.document_title,
        date: row.document_date,
        url: row.url,
        pillar: row.pillar,
        documentKind: "executive",
      },
      similarity: 0.83,
    });
  });

  it("surfaces a database error rather than returning an empty result", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    await expect(queryPolicyChunks(client, embedding, 0.7, 5)).rejects.toThrow("boom");
  });

  it("refuses rows of an unexpected shape", async () => {
    const { client } = fakeClient({ data: [{ ...row, similarity: "high" }], error: null });
    await expect(queryPolicyChunks(client, embedding, 0.7, 5)).rejects.toThrow(
      /unexpected shape/,
    );
  });

  it("refuses a query embedding of the wrong dimension before calling the database", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await expect(queryPolicyChunks(client, [1, 2, 3], 0.7, 5)).rejects.toThrow(/dimensions/);
    expect(calls).toHaveLength(0);
  });

  it("accepts a real Supabase client as an RpcClient", () => {
    // Compile-time: a real client must satisfy the narrow interface the fakes do.
    const real: RpcClient = createSupabaseClient("https://example.supabase.co", "public-key");
    expect(typeof real.rpc).toBe("function");
  });
});

describe("createSupabaseChunkStore", () => {
  const rows: NewPolicyChunk[] = [
    {
      content: "First.",
      chunkIndex: 0,
      source: {
        documentTitle: "T",
        date: "2024-01-01",
        url: "https://oregon.gov/t",
        pillar: "p",
        documentKind: "legislative",
      },
      embedding: [0.1, 0.2],
    },
  ];

  it("calls replace_document_chunks with the url and pgvector-formatted rows, returning the count", async () => {
    const { client, calls } = fakeClient({ data: 1, error: null });
    const count = await createSupabaseChunkStore(client).replaceDocument(
      "https://oregon.gov/t",
      rows,
    );
    expect(count).toBe(1);
    expect(calls[0].fn).toBe("replace_document_chunks");
    expect(calls[0].args).toEqual({
      p_url: "https://oregon.gov/t",
      p_rows: [
        {
          content: "First.",
          chunk_index: 0,
          document_title: "T",
          document_date: "2024-01-01",
          url: "https://oregon.gov/t",
          pillar: "p",
          document_kind: "legislative",
          embedding: "[0.1,0.2]",
        },
      ],
    });
  });

  it("surfaces a database error, and refuses a non-count reply", async () => {
    const failing = fakeClient({ data: null, error: { message: "denied" } });
    await expect(
      createSupabaseChunkStore(failing.client).replaceDocument("u", rows),
    ).rejects.toThrow("denied");
    const odd = fakeClient({ data: "ok", error: null });
    await expect(
      createSupabaseChunkStore(odd.client).replaceDocument("u", rows),
    ).rejects.toThrow(/row count/);
  });
});

describe("listDocumentUrls — the list that drives deletion", () => {
  const page = (urls: string[]) => ({ data: urls.map((url) => ({ url })), error: null });

  it("returns each distinct document url once, sorted", async () => {
    const { client } = fakeClient({ data: null, error: null }, [
      page(["https://oregon.gov/b", "https://oregon.gov/a", "https://oregon.gov/b"]),
    ]);
    expect(await createSupabaseChunkStore(client).listDocumentUrls()).toEqual([
      "https://oregon.gov/a",
      "https://oregon.gov/b",
    ]);
  });

  // The whole point: a caller of this list DELETES what is missing from it, so a
  // truncated read would withdraw live documents.
  it("pages until a short page, so a full first page is never mistaken for the whole table", async () => {
    const full = Array.from({ length: URL_PAGE_SIZE }, () => "https://oregon.gov/a");
    const { client, ranges } = fakeClient({ data: null, error: null }, [
      page(full),
      page(["https://oregon.gov/z"]),
    ]);
    const urls = await createSupabaseChunkStore(client).listDocumentUrls();
    expect(urls).toEqual(["https://oregon.gov/a", "https://oregon.gov/z"]);
    expect(ranges).toEqual([
      [0, URL_PAGE_SIZE - 1],
      [URL_PAGE_SIZE, URL_PAGE_SIZE * 2 - 1],
    ]);
  });

  it("does not stop on a full page that contributed no new url", async () => {
    const same = Array.from({ length: URL_PAGE_SIZE }, () => "https://oregon.gov/a");
    const { client } = fakeClient({ data: null, error: null }, [
      page(same),
      page(same),
      page(["https://oregon.gov/last"]),
    ]);
    expect(await createSupabaseChunkStore(client).listDocumentUrls()).toEqual([
      "https://oregon.gov/a",
      "https://oregon.gov/last",
    ]);
  });

  it("surfaces a database error rather than returning a short list", async () => {
    const { client } = fakeClient({ data: null, error: null }, [
      { data: null, error: { message: "denied" } },
    ]);
    await expect(
      createSupabaseChunkStore(client).listDocumentUrls(),
    ).rejects.toThrow("denied");
  });

  it("refuses rows of an unexpected shape", async () => {
    const { client } = fakeClient({ data: null, error: null }, [
      { data: [{ href: "https://oregon.gov/a" }], error: null },
    ]);
    await expect(
      createSupabaseChunkStore(client).listDocumentUrls(),
    ).rejects.toThrow(/unexpected shape/);
  });
});
