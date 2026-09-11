import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLASSIFY_DEADLINE_MS } from "../src/lib/safety";

const README = readFileSync(resolve(__dirname, "../README.md"), "utf8");
const SECTION = (README.split("### Classification latency")[1] ?? "").split(/\n### /)[0];

describe("AC12 — the documented latency is held below the declared deadline", () => {
  it("documents a slowest-observed figure", () => {
    expect(SECTION, "the README section parsed to nothing").not.toBe("");
    expect(SECTION).toMatch(/slowest/i);
  });

  it("the slowest measured figure is at or below the deadline the code declares", () => {
    // The comparison is stated rather than left as 'consistent with'. A test that
    // merely parsed a number and asserted it was a number would pass forever,
    // whatever the README said — which is a check that cannot fail.
    const slowest = /slowest\s*\*\*(\d+)\s*ms\*\*/i.exec(SECTION);
    expect(slowest, "no slowest-observed figure found in the README").not.toBeNull();
    const measured = Number((slowest as RegExpExecArray)[1]);
    expect(measured).toBeGreaterThan(0);
    expect(measured).toBeLessThanOrEqual(CLASSIFY_DEADLINE_MS);
  });

  it("documents the deadline the code actually declares", () => {
    const declared = new RegExp(`\\*\\*${CLASSIFY_DEADLINE_MS}\\s*ms\\*\\*`);
    expect(SECTION).toMatch(declared);
  });

  it("says plainly that the specification's 100ms budget is not met", () => {
    // The honest half of this criterion: a number the specification states is
    // not achievable, and the README must say so rather than quietly omit it.
    expect(SECTION).toMatch(/100\s*ms/);
    expect(SECTION).toMatch(/not met/i);
  });

  it("dates the measurement, so a stale figure is visible", () => {
    expect(SECTION).toMatch(/\b20\d\d-\d\d-\d\d\b/);
  });
});
