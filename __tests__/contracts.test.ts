import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
