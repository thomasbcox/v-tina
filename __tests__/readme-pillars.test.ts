import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POLICY_PILLARS } from "../src/lib/ingest/pillars";

/**
 * The README is where an operator learns which pillar to put on a document.
 * The constant is the source; the README's own text is what is under test here,
 * parsed from its section rather than read from the constant it is compared to.
 */
function pillarsDocumentedInReadme(): string[] {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const section = /^### Policy pillars\s*\n([\s\S]*?)(?=^#{1,6} |\Z)/m.exec(readme);
  expect(section, 'README has no "### Policy pillars" section').not.toBeNull();
  return [...section![1].matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]).sort();
}

describe("README documents the pillar taxonomy (AC6)", () => {
  const documented = pillarsDocumentedInReadme();

  it("lists at least one pillar", () => {
    expect(documented.length).toBeGreaterThan(0);
  });

  it("lists every pillar the code declares", () => {
    for (const pillar of POLICY_PILLARS) {
      expect(documented, `${pillar} is declared but not documented`).toContain(pillar);
    }
  });

  it("lists nothing the code does not declare", () => {
    for (const pillar of documented) {
      expect(
        POLICY_PILLARS as readonly string[],
        `${pillar} is documented but not declared`,
      ).toContain(pillar);
    }
  });
});
