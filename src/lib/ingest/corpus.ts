import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { ChunkStore } from "./pipeline";

/**
 * What counts as a corpus document — one rule, used by both the ingest script
 * and the corpus tests so the two cannot drift about which files are documents.
 *
 * Every markdown file directly under `corpus/` is a policy document. There is
 * no reserved name and no exception: the provenance manifest lives at
 * `CORPUS.md` in the repository root precisely so that this rule can stay
 * exception-free.
 */
export const CORPUS_DIR = "corpus";

/** Absolute paths of every corpus document, in a stable order. */
export function corpusDocumentPaths(dir: string = CORPUS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => join(dir, name));
}

export class IncompleteCorpusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompleteCorpusError";
  }
}

/**
 * A corpus proven complete and coherent: at least one document, every document
 * parsed, and no two documents claiming the same canonical URL.
 *
 * **This type is the destructive precondition, not a comment about it.** Removal
 * is driven by "stored, but not in the corpus", so a partial, empty, or
 * duplicate-URL corpus produces a deletion plan that looks valid and withdraws
 * live documents. Making the plan reachable only from a validated value means
 * any future corpus tool inherits the guarantee by construction rather than by
 * remembering to re-implement checks that used to live in one script.
 *
 * The constructor is private: {@link CompleteCorpus.of} is the only way in.
 */
export class CompleteCorpus {
  private constructor(readonly urls: readonly string[]) {}

  static of(entries: readonly { file: string; url: string }[]): CompleteCorpus {
    if (entries.length === 0) {
      throw new IncompleteCorpusError(
        "the corpus is empty; refusing to treat that as 'every document is withdrawn'",
      );
    }
    const byUrl = new Map<string, string[]>();
    for (const { file, url } of entries) {
      byUrl.set(url, [...(byUrl.get(url) ?? []), file]);
    }
    const clashes = [...byUrl.entries()].filter(([, files]) => files.length > 1);
    if (clashes.length > 0) {
      const detail = clashes
        .map(([url, files]) => `  - ${url}: ${files.sort().join(", ")}`)
        .join("\n");
      throw new IncompleteCorpusError(
        `two or more documents claim the same canonical URL, so one silently ` +
          `overwrites the other in the store:\n${detail}`,
      );
    }
    return new CompleteCorpus([...byUrl.keys()].sort());
  }
}

/**
 * Which stored documents are no longer in the committed corpus.
 *
 * Pure, and takes a {@link CompleteCorpus} rather than a bare array so a raw or
 * partial URL list cannot be turned into a deletion plan. Comparison is by exact
 * source URL: a document whose URL is corrected counts as a removal of the old
 * URL and an ingest of the new one, which is what keeps the store equal to the
 * corpus.
 */
export function documentsToRemove(
  storedUrls: readonly string[],
  corpus: CompleteCorpus,
): string[] {
  const keep = new Set(corpus.urls);
  return [...new Set(storedUrls)].filter((url) => !keep.has(url)).sort();
}

/**
 * Make the store hold exactly the documents the committed corpus names.
 *
 * The one operation that deletes. It reads the stored catalogue itself rather
 * than trusting a caller-supplied list, and it can only be called with a
 * validated corpus. Removal reuses the transactional empty-set replacement, so
 * each withdrawal is atomic. Returns the URLs removed, in order.
 */
export async function reconcileCorpus(
  corpus: CompleteCorpus,
  store: ChunkStore,
): Promise<string[]> {
  const stale = documentsToRemove(await store.listDocumentUrls(), corpus);
  for (const url of stale) await store.replaceDocument(url, []);
  return stale;
}
