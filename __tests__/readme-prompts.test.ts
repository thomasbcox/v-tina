import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as prompts from "../src/lib/prompts";
import { PROVISIONAL_PROMPTS, ROUTING_PROMPTS } from "../src/lib/prompts";

const README = readFileSync(resolve(__dirname, "../README.md"), "utf8");

/** The provisional names the README itself lists, parsed from its own prose.
 *  Deliberately independent of the constant it is compared against: reading the
 *  constant to build the expectation would let the two drift together. */
function documentedProvisional(): string[] {
  const section = README.split("### Provisional prompts")[1] ?? "";
  const body = section.split(/\n## /)[0];
  return [...body.matchAll(/^- `([A-Z0-9_]+)`$/gm)].map((m) => m[1]);
}

describe("AC11 — the provisional prompts are declared once and documented the same", () => {
  it("the README lists exactly what the code declares, both directions", () => {
    const documented = documentedProvisional();
    expect(documented.length, "the README section parsed to nothing").toBeGreaterThan(0);
    expect([...documented].sort()).toEqual([...PROVISIONAL_PROMPTS].sort());
  });

  it("every prompt this module ships is classified as provisional or routing", () => {
    // An exhaustive partition, so a NEW voice-bearing prompt cannot ship unlisted:
    // adding one to neither list fails here, which makes classifying it mandatory
    // rather than a habit.
    const exported = Object.entries(prompts)
      .filter(([name, value]) => typeof value === "string" && /^[A-Z0-9_]+$/.test(name))
      .map(([name]) => name)
      // The portal URL is a link, not a prompt.
      .filter((name) => name !== "OREGON_PORTAL_URL");

    expect(exported.length).toBeGreaterThan(0);
    expect([...exported].sort()).toEqual(
      [...PROVISIONAL_PROMPTS, ...ROUTING_PROMPTS].sort(),
    );
  });

  it("the two lists do not overlap", () => {
    const overlap = PROVISIONAL_PROMPTS.filter((n) =>
      (ROUTING_PROMPTS as readonly string[]).includes(n),
    );
    expect(overlap).toEqual([]);
  });

  it("the README says the next story replaces them", () => {
    const section = README.split("### Provisional prompts")[1] ?? "";
    expect(section.split(/\n## /)[0]).toMatch(/next story replaces them/i);
  });
});
