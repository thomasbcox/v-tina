import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_SOURCE_HOSTS } from "../src/lib/ingest/metadata";

/**
 * The README is the public-facing statement of which domains V-Tina will cite.
 * The code's allowlist is the source; the README's own text is what is under
 * test here, parsed from its "Allowed source domains" section — never read
 * from the constant it is being compared to.
 */
function domainsDocumentedInReadme(): string[] {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const section = /^### Allowed source domains\s*\n([\s\S]*?)(?=^#{1,6} |\Z)/m.exec(readme);
  expect(section, 'README has no "### Allowed source domains" section').not.toBeNull();
  const items = [...section![1].matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]);
  return items.sort();
}

describe("README documents the source-domain allowlist (AC11)", () => {
  const documented = domainsDocumentedInReadme();

  it("lists at least one domain", () => {
    expect(documented.length).toBeGreaterThan(0);
  });

  it("lists every domain the code allows", () => {
    for (const host of ALLOWED_SOURCE_HOSTS) {
      expect(documented, `${host} is allowed by the code but not documented`).toContain(host);
    }
  });

  it("lists nothing the code does not allow", () => {
    for (const host of documented) {
      expect(
        ALLOWED_SOURCE_HOSTS as readonly string[],
        `${host} is documented but not allowed by the code`,
      ).toContain(host);
    }
  });
});
