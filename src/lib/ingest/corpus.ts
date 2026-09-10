import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ChunkStore, DocumentChunk } from "./pipeline";
import { prepareDocument } from "./pipeline";

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
 * A corpus proven complete and coherent: read from the corpus directory itself,
 * every document parsed, and no two documents claiming the same canonical URL.
 *
 * **This type is the destructive precondition, not a comment about it.** Removal
 * is driven by "stored, but not in the corpus", so a partial, empty, or
 * duplicate-URL corpus produces a deletion plan that looks valid and withdraws
 * live documents.
 *
 * There is deliberately **no public way to build one from a caller-supplied
 * list**. {@link loadCompleteCorpus} is the only construction path, and it is
 * bound to {@link corpusDocumentPaths} — the same rule that defines what a
 * corpus document is. A caller therefore cannot mint a "complete" corpus from
 * one document and use it to withdraw every other stored document.
 */
export class CompleteCorpus {
  private constructor(
    readonly urls: readonly string[],
    /** The parsed documents, so the run that validated them is the run that
     *  ingests them. Reading twice left a window in which a file could change
     *  between validation and ingestion, making the deletion plan stale. */
    readonly documents: readonly LoadedDocument[],
  ) {}

  /** Module-private: the loader below is the only caller. */
  private static of(documents: readonly LoadedDocument[]): CompleteCorpus {
    if (documents.length === 0) {
      throw new IncompleteCorpusError(
        "the corpus is empty; refusing to treat that as 'every document is withdrawn'",
      );
    }
    const byUrl = new Map<string, string[]>();
    for (const { file, url } of documents) {
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
    return new CompleteCorpus([...byUrl.keys()].sort(), documents);
  }

  /** Bound to `of` so the class keeps its own invariant; exported only through
   *  {@link loadCompleteCorpus}. */
  static fromLoaded(documents: readonly LoadedDocument[]): CompleteCorpus {
    return CompleteCorpus.of(documents);
  }
}

/** One corpus document, read and parsed once. */
export interface LoadedDocument {
  /** Path relative to the working directory, for reporting. */
  readonly file: string;
  readonly url: string;
  readonly markdown: string;
  readonly chunks: readonly DocumentChunk[];
}

/**
 * Read, parse and validate the whole corpus directory — the only way to obtain
 * a {@link CompleteCorpus}.
 *
 * Every document is read and parsed exactly once here, and the result carries
 * those parsed documents, so the run that proved the corpus complete is the run
 * that ingests it. A parse failure propagates: a corpus that cannot be read is
 * not a corpus that can drive deletions.
 */
export function loadCompleteCorpus(dir: string = CORPUS_DIR): CompleteCorpus {
  const documents = corpusDocumentPaths(dir).map((path): LoadedDocument => {
    const markdown = readFileSync(path, "utf8");
    const chunks = prepareDocument(markdown);
    return {
      file: relative(".", path),
      url: chunks[0].source.url,
      markdown,
      chunks,
    };
  });
  return CompleteCorpus.fromLoaded(documents);
}

/**
 * Which stored documents are no longer in the committed corpus.
 *
 * **Module-private.** It is the raw deletion plan, and an exported one is an API
 * future tooling can call without the surrounding guarantees;
 * {@link reconcileCorpus} is the only exported operation that deletes.
 * Comparison is by exact
 * source URL: a document whose URL is corrected counts as a removal of the old
 * URL and an ingest of the new one, which is what keeps the store equal to the
 * corpus.
 */
function documentsToRemove(
  storedUrls: readonly string[],
  corpus: CompleteCorpus,
): string[] {
  const keep = new Set(corpus.urls);
  return [...new Set(storedUrls)].filter((url) => !keep.has(url)).sort();
}

/**
 * Make the store hold exactly the documents the committed corpus names.
 *
 * The one exported operation that deletes. It reads the stored catalogue itself
 * rather than trusting a caller-supplied list, and it can only be called with a
 * corpus loaded from the corpus directory. Removal reuses the transactional
 * empty-set replacement, so each withdrawal is atomic.
 *
 * `onRemoved` is invoked **immediately after each store-confirmed withdrawal**,
 * before the next one is attempted. The batch as a whole is NOT atomic — only
 * each withdrawal is — so a failure part-way leaves earlier documents already
 * removed. Reporting as it goes is what makes that partial state auditable: the
 * caller has already printed every completed removal when the error propagates.
 * Returns the URLs removed, in order.
 */
export async function reconcileCorpus(
  corpus: CompleteCorpus,
  store: ChunkStore,
  onRemoved: (url: string) => void = () => {},
): Promise<string[]> {
  const stale = documentsToRemove(await store.listDocumentUrls(), corpus);
  const removed: string[] = [];
  for (const url of stale) {
    await store.replaceDocument(url, []);
    removed.push(url);
    onRemoved(url);
  }
  return removed;
}
