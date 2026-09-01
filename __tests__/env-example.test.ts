import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_ENV_KEYS } from "../src/lib/env";

function readExample(): Map<string, string> {
  const text = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const entries = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) entries.set(m[1], m[2]);
  }
  return entries;
}

describe(".env.example", () => {
  const documented = readExample();

  // The expected list comes from the schema itself, so a variable added to
  // env.ts without documenting it fails here with no edit to this test.
  it("documents every variable the schema requires", () => {
    for (const key of REQUIRED_ENV_KEYS) {
      expect(documented.has(key), `${key} is required but not documented`).toBe(
        true,
      );
    }
  });

  it("documents nothing the schema does not require", () => {
    for (const key of documented.keys()) {
      expect(
        (REQUIRED_ENV_KEYS as string[]).includes(key),
        `${key} is documented but no longer required`,
      ).toBe(true);
    }
  });

  it("carries placeholders only, never real-looking credentials", () => {
    for (const [key, value] of documented) {
      expect(value, `${key} must be a REPLACE_ME placeholder`).toContain(
        "REPLACE_ME",
      );
    }
  });
});
