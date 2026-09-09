import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { corpusDocumentPaths } from "../src/lib/ingest/corpus";
import { isAllowedSourceHost } from "../src/lib/ingest/metadata";

/**
 * The provenance manifest (AC7). `CORPUS.md` records what was retrieved and
 * when, so a later reader can fetch the same source and re-do the faithfulness
 * comparison by hand.
 *
 * The two extents are independent: the documents come from the directory, the
 * rows from the manifest's own text. Neither is read from the other.
 */
interface ManifestRow {
  file: string;
  title: string;
  url: string;
  retrieved: string;
  checksum: string;
}

function manifestRows(): ManifestRow[] {
  const text = readFileSync(new URL("../CORPUS.md", import.meta.url), "utf8");
  const rows: ManifestRow[] = [];
  for (const line of text.split("\n")) {
    // A data row names its file in backticks; the header and rule rows do not.
    const m = /^\|\s*`([^`]+\.md)`\s*\|(.*)\|\s*$/.exec(line.trim());
    if (!m) continue;
    const cells = m[2].split("|").map((c) => c.trim());
    expect(
      cells.length,
      `manifest row for ${m[1]} has ${cells.length} cells after the file, expected 4`,
    ).toBe(4);
    rows.push({
      file: m[1],
      title: cells[0],
      url: cells[1].replace(/^<|>$/g, ""),
      retrieved: cells[2],
      checksum: cells[3].replace(/`/g, ""),
    });
  }
  return rows;
}

const rows = manifestRows();
const documents = corpusDocumentPaths().map((p) => basename(p));

describe("the corpus manifest", () => {
  // Without this the both-directions checks pass vacuously on an empty manifest.
  it("parses to at least one row", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("has a row for every committed corpus document", () => {
    for (const file of documents) {
      expect(
        rows.map((r) => r.file),
        `${file} is committed but has no manifest row`,
      ).toContain(file);
    }
  });

  it("names no document that is not committed", () => {
    for (const row of rows) {
      expect(
        documents,
        `the manifest lists ${row.file}, which is not in the corpus`,
      ).toContain(row.file);
    }
  });

  it.each(rows)("$file records a title, a retrieval date and a checksum", (row) => {
    expect(row.title.length, `${row.file} has no title`).toBeGreaterThan(0);
    expect(row.retrieved, `${row.file} has no ISO retrieval date`).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(
      row.checksum,
      `${row.file} must record a SHA-256 as 64 lowercase hex characters`,
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(rows)("$file cites a specific document on an allowed host", (row) => {
    const url = new URL(row.url);
    expect(url.protocol).toBe("https:");
    expect(
      isAllowedSourceHost(url.hostname),
      `${row.file} cites ${url.hostname}, which is not an allowed official host`,
    ).toBe(true);
    // A bare origin or a directory root identifies a site, not the document
    // that was actually retrieved and compared.
    expect(
      url.pathname.replace(/\/+$/, "").length,
      `${row.file} cites ${row.url}, which is a site root rather than a document`,
    ).toBeGreaterThan(1);
  });
});
