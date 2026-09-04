import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SAFETY_CLASSIFICATIONS } from "../src/lib/safety";

/**
 * The expected vocabulary is derived from the specification itself, not retyped
 * here. The specification's Gherkin criteria assert the flags literally
 * ('the output must be flagged as "IN-BOUNDS"'), so those assertions are the
 * authority — this test fails if the contract and the spec ever disagree, in
 * either direction.
 */
function classificationsAssertedBySpec(): string[] {
  const spec = readFileSync(
    new URL("../v-tina-user-stories.md", import.meta.url),
    "utf8",
  );
  const found = [...spec.matchAll(/flagged as "([A-Z][A-Z-]*)"/g)].map(
    (m) => m[1],
  );
  return [...new Set(found)].sort();
}

describe("safety classification vocabulary", () => {
  const asserted = classificationsAssertedBySpec();

  // Without this the whole test passes vacuously if the spec's wording changes
  // and the pattern stops matching anything.
  it("finds classification flags in the specification at all", () => {
    expect(asserted.length).toBeGreaterThan(0);
  });

  it("declares every flag the specification asserts", () => {
    for (const flag of asserted) {
      expect(
        SAFETY_CLASSIFICATIONS as readonly string[],
        `specification asserts "${flag}" but the contract does not declare it`,
      ).toContain(flag);
    }
  });

  it("declares nothing the specification does not assert", () => {
    for (const declared of SAFETY_CLASSIFICATIONS) {
      expect(
        asserted,
        `contract declares "${declared}" but no specification criterion asserts it`,
      ).toContain(declared);
    }
  });
});

describe("the shared type barrel", () => {
  // Finding 3 of the round-3 approach review: a runtime value in the barrel turns
  // a module every workstream imports for types into one that carries executable
  // code. The fix was to move the value out; this keeps it out.
  it("exports no runtime values", () => {
    const source = readFileSync(
      new URL("../src/types/index.ts", import.meta.url),
      "utf8",
    );
    const runtimeExports = source
      .split("\n")
      .filter((line) => /^export\s+(const|let|var|function|class)\s/.test(line));
    expect(
      runtimeExports,
      "src/types/index.ts must stay declaration-only; move runtime values to a lib module",
    ).toEqual([]);
  });
});
