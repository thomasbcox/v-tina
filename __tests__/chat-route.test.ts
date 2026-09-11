import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { edgeEnvSchema, nodeEnvSchema, parseEnv, EnvValidationError } from "../src/lib/env";
import { createChatDeps } from "../src/lib/chat/deps";
import * as route from "../src/app/api/chat/route";

const ROUTE_FILE = resolve(__dirname, "../src/app/api/chat/route.ts");
const ENV_MODULE = resolve(__dirname, "../src/lib/env.ts");

/** Import specifiers a module names, split by whether they survive compilation.
 *  `import type` is erased, so it can never reach the bundle and must not be
 *  walked; a runtime import can and must. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  // Whole-module imports and side-effect imports. `import type X from` and
  // `import type { … } from` are skipped; inline `type` markers inside a runtime
  // import list still leave a runtime import, which is the conservative reading.
  const pattern = /^\s*import\s+(type\s+)?([^;]*?)from\s+["']([^"']+)["']/gm;
  for (const m of source.matchAll(pattern)) {
    if (m[1]) continue;
    specifiers.push(m[3]);
  }
  for (const m of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
    specifiers.push(m[1]);
  }
  return specifiers;
}

/** Every project module reachable from `entry` through runtime imports. */
function runtimeClosure(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    const specifiers = importsOf(file);
    seen.set(file, specifiers);
    for (const spec of specifiers) {
      if (!spec.startsWith(".")) continue;
      const resolved = join(dirname(file), spec);
      for (const candidate of [`${resolved}.ts`, `${resolved}.tsx`, join(resolved, "index.ts")]) {
        try {
          readFileSync(candidate, "utf8");
          queue.push(candidate);
          break;
        } catch {
          // Not this extension; try the next.
        }
      }
    }
  }
  return seen;
}

describe("AC10 — the chat route runs on the edge, on the edge contract alone", () => {
  it("declares the edge runtime, which is the export Next.js itself reads", () => {
    expect(route.runtime).toBe("edge");
    expect(typeof route.POST).toBe("function");
  });

  it("builds every dependency from the edge contract, with no server-only secret", () => {
    const edgeOnly = {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      FIREWORKS_API_KEY: "fireworks-key",
    };
    const env = parseEnv(edgeEnvSchema, edgeOnly);
    const deps = createChatDeps(env);
    for (const name of ["classify", "rewrite", "retrieve", "answer"] as const) {
      expect(typeof deps[name], `${name} must be constructible`).toBe("function");
    }
    // And the same map is genuinely insufficient for the node contract, so this
    // is a real demonstration that the service-role secret is not needed here.
    expect(() => parseEnv(nodeEnvSchema, edgeOnly)).toThrow(EnvValidationError);
  });

  it("reaches no server-only module through its whole runtime import graph", () => {
    // The two checks above both pass under Vitest, which runs in Node where every
    // import resolves — so neither can see a server-only module creeping into the
    // edge bundle. This can. A dynamic import would still slip past a static
    // walk, which is why the story also records a real production build.
    const closure = runtimeClosure(ROUTE_FILE);
    expect(closure.size, "the walk found nothing, so it proves nothing").toBeGreaterThan(5);

    const forbiddenModules = /^(node:|fs$|path$|child_process$|worker_threads$|os$|net$)/;
    const offenders: string[] = [];
    for (const [file, specifiers] of closure) {
      for (const spec of specifiers) {
        if (forbiddenModules.test(spec)) offenders.push(`${file} imports ${spec}`);
      }
      // The node environment accessor demands the service-role secret; CALLING it
      // from here would make the route need a key the edge must not carry.
      //
      // `env.ts` itself is exempt and only `env.ts`: it declares both contracts,
      // and the route legitimately imports the edge one from it. The declaration
      // sitting unused in the bundle costs nothing — it reads the environment
      // only when called, and a call would appear in the CALLER's source, which
      // is what every other file in the closure is checked for here.
      if (file === ENV_MODULE) continue;
      const source = readFileSync(file, "utf8");
      if (/\b(getNodeEnv|nodeEnvSchema)\b/.test(source)) {
        offenders.push(`${file} references the node-only environment contract`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("refuses a malformed body before constructing anything or reading the environment", async () => {
    // No environment is set in the suite, so `getEdgeEnv()` would throw. A 400
    // proves validation ran first and that garbage input costs nothing: no
    // client built, no key read, no network touched.
    const response = await route.POST(
      new Request("https://example.test/api/chat", { method: "POST", body: "not json" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "request body must be JSON" });
  });
});
