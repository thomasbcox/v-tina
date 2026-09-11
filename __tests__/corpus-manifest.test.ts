import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { corpusDocumentPaths } from "../src/lib/ingest/corpus";
import { isAllowedSourceHost } from "../src/lib/ingest/metadata";

/**
 * The provenance manifest (AC7). `CORPUS.md` records what was retrieved, when,
 * and how its text was extracted, so a later reader can fetch the same source
 * and re-do the faithfulness comparison by hand.
 *
 * The two extents are independent: the documents come from the directory, the
 * rows from the manifest's own text. Neither is read from the other. Parsing
 * never asserts — a malformed row becomes a row that fails its own test rather
 * than one that breaks collection for the whole file.
 */
interface ManifestRow {
  file: string;
  cells: string[];
  title: string;
  url: string;
  retrieved: string;
  checksum: string;
  extraction: string;
}

/** How the text of a document was obtained. `OCR` marks a scanned source whose
 *  text was recognised rather than read, which is a different error profile. */
const EXTRACTION_METHODS = ["text-layer", "OCR"];

function manifestRows(): ManifestRow[] {
  const text = readFileSync(new URL("../CORPUS.md", import.meta.url), "utf8");
  const rows: ManifestRow[] = [];
  for (const line of text.split("\n")) {
    // A data row names its file in backticks; header and rule rows do not.
    const m = /^\|\s*`([^`]+\.md)`\s*\|(.*)\|\s*$/.exec(line.trim());
    if (!m) continue;
    const cells = m[2].split("|").map((c) => c.trim());
    rows.push({
      file: m[1],
      cells,
      title: cells[0] ?? "",
      url: (cells[1] ?? "").replace(/^<|>$/g, ""),
      retrieved: cells[2] ?? "",
      checksum: (cells[3] ?? "").replace(/`/g, ""),
      extraction: cells[4] ?? "",
    });
  }
  return rows;
}

const rows = manifestRows();
const documents = corpusDocumentPaths().map((p) => basename(p));

describe("the corpus manifest", () => {
  // Without this every both-directions check below passes vacuously.
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

  it.each(rows)("$file has the full set of provenance columns", (row) => {
    expect(
      row.cells.length,
      `${row.file} has ${row.cells.length} columns after the file, expected 5`,
    ).toBe(5);
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

  it.each(rows)("$file records how its text was extracted", (row) => {
    expect(
      EXTRACTION_METHODS,
      `${row.file} records extraction "${row.extraction}"`,
    ).toContain(row.extraction);
  });

  it.each(rows)("$file cites a specific document on an allowed host", (row) => {
    const url = new URL(row.url);
    expect(url.protocol).toBe("https:");
    expect(
      isAllowedSourceHost(url.hostname),
      `${row.file} cites ${url.hostname}, which is not an allowed official host`,
    ).toBe(true);
    // A bare origin or directory root identifies a site, not the document that
    // was actually retrieved and compared.
    expect(
      url.pathname.replace(/\/+$/, "").length,
      `${row.file} cites ${row.url}, which is a site root rather than a document`,
    ).toBeGreaterThan(1);
  });

  it("agrees with each document's own frontmatter URL", () => {
    for (const path of corpusDocumentPaths()) {
      const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, "utf8"));
      const url = /^url:\s*(\S+)$/m.exec(front?.[1] ?? "")?.[1];
      const row = rows.find((r) => r.file === basename(path));
      expect(
        row?.url,
        `${basename(path)} cites ${url} but the manifest records ${row?.url}`,
      ).toBe(url);
    }
  });
});
