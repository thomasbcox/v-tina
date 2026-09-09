import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DocumentValidationError } from "../src/lib/ingest/parse";
import {
  IngestError,
  ingestDocument,
  prepareDocument,
  type ChunkStore,
  type NewPolicyChunk,
} from "../src/lib/ingest/pipeline";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** A deterministic vector per text, so a test can tell which text a row's
 *  embedding came from. */
const vectorFor = (text: string) => [text.length, text.charCodeAt(0)];

function fakeEmbedder(options: { failOnCall?: number } = {}) {
  const calls: string[][] = [];
  const embed = async (texts: string[]) => {
    calls.push(texts);
    if (options.failOnCall === calls.length) throw new Error("embedding service down");
    return texts.map(vectorFor);
  };
  return { embed, calls };
}

function fakeStore(options: { confirm?: (rows: NewPolicyChunk[]) => number; fail?: boolean } = {}) {
  const calls: { url: string; rows: NewPolicyChunk[] }[] = [];
  const store: ChunkStore = {
    async listDocumentUrls() {
      return [...new Set(calls.map((c) => c.url))].sort();
    },
    async replaceDocument(url, rows) {
      calls.push({ url, rows });
      if (options.fail) throw new Error("database unavailable");
      return options.confirm ? options.confirm(rows) : rows.length;
    },
  };
  return { store, calls };
}

describe("ingestDocument — a working service and store (AC3)", () => {
  it("embeds every chunk exactly once and stores them in one replacement", async () => {
    const markdown = fixture("housing-order.md");
    const chunks = prepareDocument(markdown);
    const embedder = fakeEmbedder();
    const store = fakeStore();

    const result = await ingestDocument(markdown, { embed: embedder.embed, store: store.store });

    expect(embedder.calls).toHaveLength(1);
    expect(embedder.calls[0]).toEqual(chunks.map((c) => c.content));

    expect(store.calls).toHaveLength(1);
    const { url, rows } = store.calls[0];
    expect(url).toBe(chunks[0].source.url);
    expect(rows).toHaveLength(chunks.length);
    rows.forEach((row, i) => {
      expect(row.content).toBe(chunks[i].content);
      expect(row.chunkIndex).toBe(i);
      expect(row.source).toEqual(chunks[i].source);
      expect(row.embedding).toEqual(vectorFor(chunks[i].content));
    });

    expect(result).toEqual({ url, chunkCount: chunks.length });
  });

  it("reports the count the store confirmed, and refuses a short count", async () => {
    const markdown = fixture("literacy-bill.md");
    const store = fakeStore({ confirm: (rows) => rows.length - 1 });
    await expect(
      ingestDocument(markdown, { embed: fakeEmbedder().embed, store: store.store }),
    ).rejects.toBeInstanceOf(IngestError);
  });

  it("refuses an embedding service that returns the wrong number of vectors", async () => {
    const markdown = fixture("literacy-bill.md");
    const embed = async (texts: string[]) => texts.slice(1).map(vectorFor);
    await expect(
      ingestDocument(markdown, { embed, store: fakeStore().store }),
    ).rejects.toBeInstanceOf(IngestError);
  });
});

describe("ingestDocument — failure part-way (AC4)", () => {
  it("rejects when the embedding service fails, and never touches the store", async () => {
    const embedder = fakeEmbedder({ failOnCall: 1 });
    const store = fakeStore();
    await expect(
      ingestDocument(fixture("housing-order.md"), { embed: embedder.embed, store: store.store }),
    ).rejects.toThrow("embedding service down");
    expect(store.calls).toHaveLength(0);
  });

  it("rejects when the store fails, having offered it the full row set exactly once", async () => {
    const markdown = fixture("housing-order.md");
    const chunkCount = prepareDocument(markdown).length;
    const store = fakeStore({ fail: true });
    await expect(
      ingestDocument(markdown, { embed: fakeEmbedder().embed, store: store.store }),
    ).rejects.toThrow("database unavailable");
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].rows).toHaveLength(chunkCount);
  });

  it("never resolves to a success-shaped value carrying an error", async () => {
    const outcome = await ingestDocument(fixture("housing-order.md"), {
      embed: fakeEmbedder({ failOnCall: 1 }).embed,
      store: fakeStore().store,
    }).then(
      (value) => ({ resolved: true as const, value }),
      (error: unknown) => ({ resolved: false as const, error }),
    );
    expect(outcome.resolved).toBe(false);
  });
});

describe("ingestDocument — a refused document (AC2)", () => {
  it("rejects before calling the embedding service or the store", async () => {
    const embedder = fakeEmbedder();
    const store = fakeStore();
    await expect(
      ingestDocument("---\ntitle: x\n---\n\nBody.\n", { embed: embedder.embed, store: store.store }),
    ).rejects.toBeInstanceOf(DocumentValidationError);
    expect(embedder.calls).toHaveLength(0);
    expect(store.calls).toHaveLength(0);
  });
});
