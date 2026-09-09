import { readdirSync } from "node:fs";
import { join } from "node:path";

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

/**
 * Which stored documents are no longer in the committed corpus.
 *
 * Pure, and deliberately separate from the operator script so the rule that
 * decides what gets DELETED is unit-tested rather than buried in a command.
 * Comparison is by exact source URL: a document whose URL is corrected counts
 * as a removal of the old URL and an ingest of the new one, which is the
 * behaviour that keeps the store equal to the corpus.
 */
export function documentsToRemove(
  storedUrls: readonly string[],
  corpusUrls: readonly string[],
): string[] {
  const keep = new Set(corpusUrls);
  return [...new Set(storedUrls)].filter((url) => !keep.has(url)).sort();
}
