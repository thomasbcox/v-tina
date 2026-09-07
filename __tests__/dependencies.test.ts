import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

/** A range that names a concrete version, not "*", "latest" or empty. */
const namesAVersion = (range: string) => /^[\^~]?\d+\.\d+\.\d+/.test(range);

describe("Supabase dependencies (AC8)", () => {
  it("adds @supabase/supabase-js as a runtime dependency with a pinned range", () => {
    expect(pkg.dependencies["@supabase/supabase-js"]).toBeDefined();
    expect(namesAVersion(pkg.dependencies["@supabase/supabase-js"])).toBe(true);
  });

  it("adds the supabase CLI as a dev dependency with a pinned range", () => {
    expect(pkg.devDependencies["supabase"]).toBeDefined();
    expect(namesAVersion(pkg.devDependencies["supabase"])).toBe(true);
  });

  it("does not add @supabase/ssr anywhere", () => {
    expect(pkg.dependencies["@supabase/ssr"]).toBeUndefined();
    expect(pkg.devDependencies["@supabase/ssr"]).toBeUndefined();
  });
});
