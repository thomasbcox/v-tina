import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { corpusDocumentPaths } from "../src/lib/ingest/corpus";
import { parseDocument } from "../src/lib/ingest/parse";

/**
 * The committed seed corpus, judged by the real parser (AC1).
 *
 * The extent is the directory itself, so a document added without validating
 * fails here with no edit to this test.
 */
const paths = corpusDocumentPaths();

describe("the seed corpus", () => {
  // Found by the round-3 reviewer while reconciliation was still in scope. It is
  // a corpus defect regardless: the store is keyed by URL, so two files sharing
  // one would silently overwrite each other at ingest.
  it("has no two documents claiming the same canonical url", () => {
    const byUrl = new Map<string, string[]>();
    for (const path of paths) {
      const url = parseDocument(readFileSync(path, "utf8")).source.url;
      byUrl.set(url, [...(byUrl.get(url) ?? []), basename(path)]);
    }
    const clashes = [...byUrl.entries()].filter(([, files]) => files.length > 1);
    expect(
      clashes.map(([url, files]) => `${url}: ${files.join(", ")}`),
      "two documents sharing a url would silently overwrite each other",
    ).toEqual([]);
  });
});
