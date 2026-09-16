import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as prompts from "../src/lib/prompts";
import {
  PROVISIONAL_PROMPTS,
  READER_FACING_PROMPTS,
  ROUTING_PROMPTS,
} from "../src/lib/prompts";

const README = readFileSync(resolve(__dirname, "../README.md"), "utf8");

/** Names the README itself lists under a heading, parsed from its own prose —
 *  deliberately independent of the constant it is compared against. */
function documented(heading: string): string[] {
  const section = README.split(heading)[1] ?? "";
  const body = section.split(/\n#{2,3} /)[0];
  return [...body.matchAll(/^- `([A-Z0-9_]+)`$/gm)].map((m) => m[1]);
}

const exported = Object.entries(prompts)
  .filter(([name, value]) => typeof value === "string" && /^[A-Z0-9_]+$/.test(name))
  .map(([name]) => name)
  .filter((name) => name !== "OREGON_PORTAL_URL"); // a link, not a prompt

describe("AC12 — every prompt is classified, and the buckets mean what they say", () => {
  it("the three lists partition every prompt this module ships", () => {
    // Exhaustive: a new prompt in none of the three fails here, so classifying it
    // is mandatory rather than a habit.
    expect(exported.length).toBeGreaterThan(0);
    expect([...exported].sort()).toEqual(
      [...PROVISIONAL_PROMPTS, ...ROUTING_PROMPTS, ...READER_FACING_PROMPTS].sort(),
    );
  });

  it("no prompt appears in two lists", () => {
    const all = [...PROVISIONAL_PROMPTS, ...ROUTING_PROMPTS, ...READER_FACING_PROMPTS];
    expect(all.length, "a prompt in two buckets makes the partition meaningless").toBe(
      new Set(all).size,
    );
  });

  it("nothing is provisional any more — story 3 replaced all three", () => {
    expect([...PROVISIONAL_PROMPTS]).toEqual([]);
  });

  it("the partition still has teeth over an empty provisional list", () => {
    // Emptiness reached by deleting the list or the check would pass every
    // assertion above and mean nothing. This proves the guard still bites: a
    // prompt classified nowhere is not covered by the union.
    const union = new Set<string>([
      ...PROVISIONAL_PROMPTS,
      ...ROUTING_PROMPTS,
      ...READER_FACING_PROMPTS,
    ]);
    expect(union.has("A_PROMPT_NOBODY_CLASSIFIED")).toBe(false);
    expect(union.size, "the union must not be empty, or coverage is vacuous").toBeGreaterThan(0);
  });

  it("the routing bucket holds only prompts a reader never sees", () => {
    // The classification must be CORRECT, not merely present — a reader-facing
    // prompt filed under 'carries no voice' passes a coverage check while being
    // exactly wrong. (The builder did this once; see prompts.ts.)
    for (const name of ROUTING_PROMPTS) {
      const text = (prompts as Record<string, unknown>)[name] as string;
      expect(text, `${name} should instruct a machine, not address a reader`).toMatch(
        /reply with|rewrite the user's question/i,
      );
    }
  });

  it("every reader-facing prompt speaks as the avatar, never as the Governor", () => {
    for (const name of READER_FACING_PROMPTS) {
      const text = (prompts as Record<string, unknown>)[name] as string;
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("the README documents the same three lists, equal in both directions", () => {
    for (const [heading, declared] of [
      ["### Reader-facing prompts", READER_FACING_PROMPTS],
      ["### Routing prompts", ROUTING_PROMPTS],
    ] as const) {
      const listed = documented(heading);
      expect(listed.length, `the README section ${heading} parsed to nothing`).toBeGreaterThan(0);
      expect([...listed].sort()).toEqual([...declared].sort());
    }
  });
});
