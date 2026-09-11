import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { corpusDocumentPaths } from "../src/lib/ingest/corpus";
import {
  DOCUMENT_KINDS,
  isAllowedSourceHost,
} from "../src/lib/ingest/metadata";
import { parseDocument } from "../src/lib/ingest/parse";
import { POLICY_PILLARS } from "../src/lib/ingest/pillars";
import { prepareDocument } from "../src/lib/ingest/pipeline";

/**
 * The committed seed corpus, judged by the real parser (AC1).
 *
 * The extent is the directory itself, so a document added without validating
 * fails here with no edit to this test.
 */
const paths = corpusDocumentPaths();

/** A stub with correct frontmatter and a one-line body would satisfy every
 *  membership check while grounding nothing; three chunks is roughly 1500
 *  characters of real text. */
const MIN_CHUNKS_PER_DOCUMENT = 3;

describe("the seed corpus", () => {
  // Without this the whole suite passes vacuously on an empty directory.
  it("contains documents at all", () => {
    expect(paths.length).toBeGreaterThan(0);
  });

  it.each(paths)("%s parses with complete, valid metadata", (path) => {
    const { source } = parseDocument(readFileSync(path, "utf8"));
    expect(source.documentTitle.length).toBeGreaterThan(0);
    expect(source.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(
      isAllowedSourceHost(new URL(source.url).hostname),
      `${basename(path)} cites ${source.url}, which is not an allowed official host`,
    ).toBe(true);
    expect(POLICY_PILLARS as readonly string[]).toContain(source.pillar);
    expect(DOCUMENT_KINDS as readonly string[]).toContain(source.documentKind);
  });

  it.each(paths)("%s carries enough text to ground a question", (path) => {
    const chunks = prepareDocument(readFileSync(path, "utf8"));
    expect(
      chunks.length,
      `${basename(path)} yields ${chunks.length} chunks; a document this thin cannot ground an answer`,
    ).toBeGreaterThanOrEqual(MIN_CHUNKS_PER_DOCUMENT);
  });

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

  it("covers every declared pillar and both document kinds", () => {
    const sources = paths.map((p) => parseDocument(readFileSync(p, "utf8")).source);
    expect([...new Set(sources.map((s) => s.pillar))].sort()).toEqual(
      [...POLICY_PILLARS].sort(),
    );
    expect([...new Set(sources.map((s) => s.documentKind))].sort()).toEqual(
      [...DOCUMENT_KINDS].sort(),
    );
  });
});
