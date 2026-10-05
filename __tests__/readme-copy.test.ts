import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as copy from "../src/lib/copy";
import { AVATAR_NOTICE, SCREEN_COPY } from "../src/lib/copy";

/**
 * Story `chat-screen`, AC14 (the registry half) and AC1 (the notice's substance).
 * The same shape as `readme-prompts.test.ts`: the README's list is parsed from its own
 * prose, independent of the constant it is compared against.
 */

const README = readFileSync(resolve(__dirname, "../README.md"), "utf8");

function documented(heading: string): string[] {
  const section = README.split(heading)[1] ?? "";
  const body = section.split(/\n#{2,3} /)[0];
  return [...body.matchAll(/^- `([A-Z0-9_]+)`$/gm)].map((m) => m[1]);
}

/** Every ALL-CAPS export of the module, except the list itself. */
const exported = Object.keys(copy)
  .filter((name) => /^[A-Z][A-Z0-9_]+$/.test(name))
  .filter((name) => name !== "SCREEN_COPY");

describe("the screen copy registry is complete and documented", () => {
  it("SCREEN_COPY names every constant the module exports, and nothing else", () => {
    // Exhaustive in both directions: a new label not listed fails here, and so
    // does a listed name that no longer exists.
    expect(exported.length).toBeGreaterThan(0);
    expect([...exported].sort()).toEqual([...SCREEN_COPY].sort());
  });

  it("the README's Screen copy section lists the same names, equal in both directions", () => {
    const listed = documented("### Screen copy");
    expect(listed.length, "the README section parsed to nothing").toBeGreaterThan(0);
    expect([...listed].sort()).toEqual([...SCREEN_COPY].sort());
  });

  it("every entry is prose a reader can see: a non-empty string, or a record of them", () => {
    for (const name of SCREEN_COPY) {
      const value = (copy as Record<string, unknown>)[name];
      const strings = typeof value === "string" ? [value] : Object.values(value as Record<string, unknown>);
      expect(strings.length, name).toBeGreaterThan(0);
      for (const s of strings) {
        expect(typeof s, name).toBe("string");
        expect((s as string).trim().length, `${name} is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("AC1 — the avatar notice says what it must", () => {
  it("names the three facts: an AI avatar, not the Governor, not an official state service", () => {
    // The wording is Thomas's (reviews/chat-screen.md, Open question 8). A rewording
    // that drops one of the three facts is what this catches; the exact sentence is
    // not pinned.
    expect(AVATAR_NOTICE).toMatch(/virtual AI avatar/);
    expect(AVATAR_NOTICE).toMatch(/not Governor Kotek/);
    expect(AVATAR_NOTICE).toMatch(/not an official State of Oregon service/);
  });
});
