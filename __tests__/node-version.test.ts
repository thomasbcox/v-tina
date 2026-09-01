import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import semver from "semver";

const read = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8").trim();

describe("Node version pin", () => {
  it("keeps .nvmrc consistent with package.json engines.node", () => {
    const pinned = read("../.nvmrc");
    const range = JSON.parse(read("../package.json")).engines.node as string;
    const concrete = semver.valid(semver.coerce(pinned));
    expect(concrete, `.nvmrc "${pinned}" is not a usable version`).not.toBeNull();
    expect(
      semver.satisfies(concrete as string, range),
      `.nvmrc pins ${pinned}, which does not satisfy engines.node "${range}"`,
    ).toBe(true);
  });
});
