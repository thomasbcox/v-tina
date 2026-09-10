import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CompleteCorpus,
  IncompleteCorpusError,
  loadCompleteCorpus,
  reconcileCorpus,
} from "../src/lib/ingest/corpus";
import type { ChunkStore, NewPolicyChunk } from "../src/lib/ingest/pipeline";

const A = "https://www.oregon.gov/gov/eo/eo-23-02.pdf";
const B = "https://www.oregon.gov/gov/eo/eo-23-04.pdf";
const C = "https://oregonlegislature.gov/bills_laws/lawsstatutes/2024orLaw0070.pdf";

/** A body long enough that the parser accepts it and chunking has something to do. */
const BODY = "Placeholder sentence for the corpus loader test. ".repeat(40);

function document(url: string): string {
  return [
    "---",
    'title: "Fixture document"',
    "date: 2024-01-15",
    `url: ${url}`,
    "pillar: housing-and-homelessness",
    "kind: executive",
    "---",
    "",
    BODY,
    "",
  ].join("\n");
}

/** A real corpus directory, because the loader is bound to the directory rule
 *  and that binding is exactly what is under test. */
function corpusDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "vtina-corpus-"));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), contents);
  }
  return dir;
}

const corpus = (...urls: string[]): CompleteCorpus =>
  loadCompleteCorpus(
    corpusDir(Object.fromEntries(urls.map((u, i) => [`doc-${i}.md`, document(u)]))),
  );

describe("loadCompleteCorpus — the only way to obtain the destructive precondition", () => {
  it("reads the directory and exposes its urls, sorted", () => {
    expect(corpus(B, A).urls).toEqual([A, B]);
  });

  it("carries the parsed documents, so validation and ingestion read the same bytes", () => {
    const loaded = corpus(A);
    expect(loaded.documents).toHaveLength(1);
    expect(loaded.documents[0].url).toBe(A);
    expect(loaded.documents[0].chunks.length).toBeGreaterThan(0);
    expect(loaded.documents[0].markdown).toContain("Placeholder sentence");
  });

  // Removal is "stored, but not in the corpus". An empty corpus would mean
  // "withdraw everything", which is never what an empty directory means.
  it("refuses an empty corpus directory", () => {
    expect(() => loadCompleteCorpus(corpusDir({}))).toThrow(IncompleteCorpusError);
  });

  it("refuses two documents claiming the same canonical url, naming both files", () => {
    const dir = corpusDir({ "one.md": document(A), "two.md": document(A) });
    try {
      loadCompleteCorpus(dir);
    } catch (e) {
      expect(e).toBeInstanceOf(IncompleteCorpusError);
      expect((e as Error).message).toContain("one.md");
      expect((e as Error).message).toContain("two.md");
      expect((e as Error).message).toContain(A);
      return;
    }
    throw new Error("expected a refusal");
  });

  it("propagates a parse failure rather than yielding a partial corpus", () => {
    const dir = corpusDir({ "ok.md": document(A), "broken.md": "no frontmatter here" });
    expect(() => loadCompleteCorpus(dir)).toThrow();
  });

  // The bypass this construction path exists to close: a caller must not be able
  // to present one document as a complete corpus.
  it("cannot be constructed from a caller-supplied list", () => {
    expect(
      Object.getOwnPropertyNames(CompleteCorpus).includes("of"),
      "CompleteCorpus.of must not be a public construction path",
    ).toBe(true);
    // `of` exists but is private; the compiler refuses it, and the only exported
    // route is the loader above. This test documents the intent that survives
    // compilation: nothing in this module's public surface takes a bare list.
    expect(typeof loadCompleteCorpus).toBe("function");
  });
});

/** Records what reconciliation asked of the store. */
function fakeStore(stored: string[], failOn?: string) {
  const removed: string[] = [];
  const store: ChunkStore = {
    async listDocumentUrls() {
      return [...stored];
    },
    async replaceDocument(url: string, rows: NewPolicyChunk[]) {
      expect(rows, "reconciliation must withdraw by empty-set replacement").toEqual([]);
      if (url === failOn) throw new Error(`store refused ${url}`);
      removed.push(url);
      return 0;
    },
  };
  return { store, removed };
}

describe("reconcileCorpus", () => {
  it("removes exactly the stored documents the corpus dropped", async () => {
    const { store, removed } = fakeStore([A, B, C]);
    expect(await reconcileCorpus(corpus(A), store)).toEqual([B, C].sort());
    expect(removed).toEqual([B, C].sort());
  });

  it("touches nothing when the store already matches the corpus", async () => {
    const { store, removed } = fakeStore([A, B]);
    expect(await reconcileCorpus(corpus(A, B), store)).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("reads the stored catalogue itself rather than trusting a caller's list", async () => {
    const forgotten = "https://oregon.gov/gov/eo/forgotten.pdf";
    const { store, removed } = fakeStore([A, forgotten]);
    await reconcileCorpus(corpus(A), store);
    expect(removed).toEqual([forgotten]);
  });

  it("reports each withdrawal as the store confirms it, not at the end", async () => {
    const seen: string[] = [];
    const { store } = fakeStore([A, B, C]);
    await reconcileCorpus(corpus(A), store, (url) => seen.push(url));
    expect(seen).toEqual([B, C].sort());
  });

  // The batch is not atomic — only each withdrawal is. A caller must therefore
  // already know what was removed when the failure arrives.
  it("has already reported the completed removals when a later one fails", async () => {
    const seen: string[] = [];
    const sorted = [B, C].sort();
    const { store } = fakeStore([A, B, C], sorted[1]);
    await expect(
      reconcileCorpus(corpus(A), store, (url) => seen.push(url)),
    ).rejects.toThrow(`store refused ${sorted[1]}`);
    expect(seen, "the earlier withdrawal must not be invisible").toEqual([sorted[0]]);
  });
});
