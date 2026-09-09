import { describe, expect, it } from "vitest";
import {
  CompleteCorpus,
  IncompleteCorpusError,
  documentsToRemove,
  reconcileCorpus,
} from "../src/lib/ingest/corpus";
import type { ChunkStore, NewPolicyChunk } from "../src/lib/ingest/pipeline";

const A = "https://www.oregon.gov/gov/eo/eo-23-02.pdf";
const B = "https://www.oregon.gov/gov/eo/eo-23-04.pdf";
const C = "https://oregonlegislature.gov/bills_laws/lawsstatutes/2024orLaw0070.pdf";
const corpus = (...urls: string[]) =>
  CompleteCorpus.of(urls.map((url, i) => ({ file: `doc-${i}.md`, url })));

describe("CompleteCorpus — the destructive precondition", () => {
  it("accepts a corpus with distinct urls and exposes them sorted", () => {
    expect(corpus(B, A).urls).toEqual([A, B]);
  });

  // Removal is "stored, but not in the corpus". An empty corpus would therefore
  // mean "withdraw everything", which is never what an empty read means.
  it("refuses an empty corpus", () => {
    expect(() => CompleteCorpus.of([])).toThrow(IncompleteCorpusError);
  });

  it("refuses two documents claiming the same canonical url, naming both files", () => {
    try {
      CompleteCorpus.of([
        { file: "one.md", url: A },
        { file: "two.md", url: A },
      ]);
    } catch (e) {
      expect(e).toBeInstanceOf(IncompleteCorpusError);
      expect((e as Error).message).toContain("one.md");
      expect((e as Error).message).toContain("two.md");
      expect((e as Error).message).toContain(A);
      return;
    }
    throw new Error("expected a refusal");
  });
});

describe("documentsToRemove", () => {
  it("removes a stored document the corpus no longer contains", () => {
    expect(documentsToRemove([A, B], corpus(A))).toEqual([B]);
  });

  it("removes nothing when the store and the corpus agree", () => {
    expect(documentsToRemove([A, B], corpus(B, A))).toEqual([]);
  });

  it("removes nothing when the store is empty", () => {
    expect(documentsToRemove([], corpus(A, B))).toEqual([]);
  });

  it("treats a corrected url as a removal of the old one", () => {
    expect(documentsToRemove([A], corpus(C))).toEqual([A]);
  });

  it("never proposes removing a url the corpus still has, even listed twice", () => {
    expect(documentsToRemove([A, A, B], corpus(A))).toEqual([B]);
  });
});

/** Records what reconciliation asked of the store. */
function fakeStore(stored: string[]) {
  const removed: string[] = [];
  const store: ChunkStore = {
    async listDocumentUrls() {
      return [...stored];
    },
    async replaceDocument(url: string, rows: NewPolicyChunk[]) {
      expect(rows, "reconciliation must withdraw by empty-set replacement").toEqual([]);
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
    // The store knows about a document the caller never mentions; reconciliation
    // must still find and remove it.
    const { store, removed } = fakeStore([A, "https://oregon.gov/gov/eo/forgotten.pdf"]);
    await reconcileCorpus(corpus(A), store);
    expect(removed).toEqual(["https://oregon.gov/gov/eo/forgotten.pdf"]);
  });
});
