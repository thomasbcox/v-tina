import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_SOURCE_HOSTS,
} from "../src/lib/ingest/metadata";
import {
  DocumentValidationError,
  FRONTMATTER_KEYS,
  parseDocument,
} from "../src/lib/ingest/parse";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** A valid document built from parts, so each test can break exactly one. */
function doc(
  overrides: Partial<Record<(typeof FRONTMATTER_KEYS)[number], string>> = {},
  body = "A body long enough to be a document.",
): string {
  const fields: Record<string, string> = {
    title: "Fixture order",
    date: "2024-01-15",
    url: "https://www.oregon.gov/gov/fixture",
    pillar: "housing-and-homelessness",
    kind: "executive",
    ...overrides,
  };
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

/** The sorted set of fields a refusal names, or fails the test if it did not refuse. */
function refusedFields(markdown: string): string[] {
  try {
    parseDocument(markdown);
  } catch (e) {
    expect(e).toBeInstanceOf(DocumentValidationError);
    return (e as DocumentValidationError).invalidFields;
  }
  throw new Error("expected the document to be refused");
}

describe("parseDocument — a well-formed document (AC1)", () => {
  it("returns the frontmatter as complete source metadata and the trimmed body", () => {
    const { source, body } = parseDocument(fixture("housing-order.md"));
    expect(source).toEqual({
      documentTitle: "Fixture EO 00-01 (synthetic)",
      date: "2023-01-10",
      url: "https://www.oregon.gov/gov/eo/fixture-eo-00-01.pdf",
      pillar: "housing-and-homelessness",
      documentKind: "executive",
    });
    expect(body.startsWith("# Synthetic fixture")).toBe(true);
    expect(body).toBe(body.trim());
  });

  it("accepts a legislative document on the legislature's domain", () => {
    const { source } = parseDocument(fixture("literacy-bill.md"));
    expect(source.documentKind).toBe("legislative");
    expect(new URL(source.url).hostname).toBe("olis.oregonlegislature.gov");
  });

  it("accepts the bare allowed domains and their subdomains", () => {
    for (const host of ALLOWED_SOURCE_HOSTS) {
      expect(parseDocument(doc({ url: `https://${host}/x` })).source.url).toBe(
        `https://${host}/x`,
      );
      expect(
        parseDocument(doc({ url: `https://sub.${host}/x` })).source.url,
      ).toBe(`https://sub.${host}/x`);
    }
  });
});

describe("parseDocument — refusals name exactly the fields at fault (AC2)", () => {
  it.each([
    ["a well-formed URL on a host outside the allowlist", { url: "https://example.com/fixture" }, ["url"]],
    ["a lookalike host that merely contains an allowed domain", { url: "https://oregon.gov.example.com/x" }, ["url"]],
    ["a lookalike host that merely ends with an allowed name", { url: "https://notoregon.gov/x" }, ["url"]],
  ] as const)("refuses %s naming only the faulty field", (_label, overrides, expected) => {
    expect(refusedFields(doc(overrides))).toEqual([...expected]);
  });
});
