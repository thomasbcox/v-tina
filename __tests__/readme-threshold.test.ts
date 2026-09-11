import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_THRESHOLD } from "../src/lib/supabase";

/**
 * The retrieval threshold decides when V-Tina refuses for lack of grounding, so
 * the number a reader finds in the README must be the number the code uses. The
 * constant is the source; the README's own text is what is under test, parsed
 * from its section rather than read from the constant it is compared to.
 */
function thresholdDocumentedInReadme(): number[] {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const section = /^## Retrieval threshold\s*\n([\s\S]*?)(?=^#{1,6} |\Z)/m.exec(readme);
  expect(section, 'README has no "## Retrieval threshold" section').not.toBeNull();
  return [...section![1].matchAll(/\*\*(0\.\d+)\*\*/g)].map((m) => Number(m[1]));
}

describe("README documents the retrieval threshold", () => {
  const documented = thresholdDocumentedInReadme();

  // Without this the comparison below passes vacuously if the bolded figure goes.
  it("states a threshold at all", () => {
    expect(documented.length).toBeGreaterThan(0);
  });

  it("states exactly the threshold the code uses", () => {
    expect(documented).toContain(DEFAULT_MATCH_THRESHOLD);
  });

  it("uses a threshold above the measured out-of-scope noise ceiling", () => {
    // 0.718 was the best out-of-scope hit measured against the seed corpus.
    // A threshold at or below it cannot refuse an ungrounded question.
    expect(DEFAULT_MATCH_THRESHOLD).toBeGreaterThan(0.718);
  });
});
