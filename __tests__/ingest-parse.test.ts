import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_SOURCE_HOSTS,
  DOCUMENT_KINDS,
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
    pillar: "housing",
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
      pillar: "housing",
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

  it("accepts every declared document kind", () => {
    for (const kind of DOCUMENT_KINDS) {
      expect(parseDocument(doc({ kind })).source.documentKind).toBe(kind);
    }
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
  it("names every required field when the frontmatter is absent", () => {
    const named = refusedFields("# No frontmatter\n\nJust a body.\n");
    for (const key of FRONTMATTER_KEYS) expect(named).toContain(key);
    expect(named).toContain("frontmatter");
  });

  // The extent is the module's own key list, so a new required field is
  // covered here without editing the test.
  it.each(FRONTMATTER_KEYS)("names only %s when it is missing", (key) => {
    const fields = Object.fromEntries(
      FRONTMATTER_KEYS.filter((k) => k !== key).map((k) => [k, undefined]),
    );
    const markdown = doc().replace(new RegExp(`^${key}: .*\\n`, "m"), "");
    void fields;
    expect(refusedFields(markdown)).toEqual([key]);
  });

  it.each([
    ["a date that is not a date", { date: "yesterday" }, ["date"]],
    ["a date in a non-ISO format", { date: "01/15/2024" }, ["date"]],
    ["a URL without its scheme", { url: "www.oregon.gov/gov/fixture" }, ["url"]],
    ["a URL that is not https", { url: "http://www.oregon.gov/gov/fixture" }, ["url"]],
    ["a well-formed URL on a host outside the allowlist", { url: "https://example.com/fixture" }, ["url"]],
    ["a lookalike host that merely contains an allowed domain", { url: "https://oregon.gov.example.com/x" }, ["url"]],
    ["a lookalike host that merely ends with an allowed name", { url: "https://notoregon.gov/x" }, ["url"]],
    ["a document kind outside the declared set", { kind: "memo" }, ["kind"]],
    ["an empty title", { title: '""' }, ["title"]],
  ] as const)("refuses %s naming only the faulty field", (_label, overrides, expected) => {
    expect(refusedFields(doc(overrides))).toEqual([...expected]);
  });

  it("names every faulty field at once, and no valid one", () => {
    const named = refusedFields(
      doc({ date: "soon", url: "ftp://oregon.gov/x", kind: "podcast" }),
    );
    expect(named).toEqual(["date", "kind", "url"]);
  });

  it("refuses an empty body, naming the body", () => {
    expect(refusedFields(doc({}, "   \n"))).toEqual(["body"]);
  });

  it("refuses unreadable YAML, naming the frontmatter and the fields it could not read", () => {
    const named = refusedFields("---\ntitle: [unclosed\n---\n\nBody.\n");
    expect(named).toContain("frontmatter");
  });

  it("carries the diagnosis in the error message, one line per fault", () => {
    try {
      parseDocument(doc({ date: "soon" }));
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("date");
      expect(message).not.toContain("title");
      return;
    }
    throw new Error("expected refusal");
  });
});
