import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { edgeEnvSchema, nodeEnvSchema, parseEnv, EnvValidationError } from "../src/lib/env";
import { CLASSIFY_DEADLINE_MS, REWRITE_DEADLINE_MS } from "../src/lib/safety";
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

describe("AC10 — the chat route runs on a supported runtime, on the request-path contract alone", () => {
  it("declares a supported runtime, which is the export Next.js itself reads", () => {
    // Was "edge" until 2026-09-10; Next.js 16 deprecates that runtime and Thomas
    // chose at the review consult to move while one route depended on it.
    expect(route.runtime).toBe("nodejs");
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

  it("never reaches the server-only environment contract, anywhere in its import graph", () => {
    // This is the part the two checks above cannot do. They pass under Vitest,
    // which runs in Node where every import resolves, so neither can see the
    // node-only contract creeping in transitively.
    //
    // The ban on Node builtins that used to live here was REMOVED with the move
    // off the Edge runtime: it enforced a platform restriction that no longer
    // exists, and a check asserting a rule nobody has is worse than no check.
    // What survives is the invariant the criterion is actually about — this route
    // must not need the service-role secret — which matters MORE now, because the
    // platform no longer withholds it and only this holds the line.
    const closure = runtimeClosure(ROUTE_FILE);
    expect(closure.size, "the walk found nothing, so it proves nothing").toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const [file] of closure) {
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

describe("the request-scoped deadlines are real, and composed with the reader's signal", () => {
  const edgeOnly = {
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    FIREWORKS_API_KEY: "fireworks-key",
  };

  /**
   * A `fetch` that hangs until its signal aborts — which is what a real `fetch`
   * does, and the whole reason a signal is worth passing.
   *
   * This is what gives these tests teeth: if the code failed to hand a signal to
   * `fetch` at all, nothing here would ever settle and the test would time out
   * rather than pass. An earlier version used a promise that never settled under
   * any circumstances, which could only ever time out — it tested the mock.
   */
  function hangUntilAborted() {
    return vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const abort = () => reject(new DOMException("aborted", "AbortError"));
          const signal = init?.signal;
          if (!signal) return; // no signal reached fetch — hang, and fail loudly
          if (signal.aborted) return abort();
          signal.addEventListener("abort", abort, { once: true });
        }) as Promise<Response>,
    );
  }

  it("declares a deadline for the rewrite, not only for classification", () => {
    // The rewrite carried NO bound at all until 2026-09-11: no deadline and no
    // signal, and the retry helper sets no fetch timeout without one. A hung
    // rewrite hung the request, on the partisan path.
    expect(REWRITE_DEADLINE_MS).toBeGreaterThan(0);
    expect(CLASSIFY_DEADLINE_MS).toBeGreaterThan(0);
  });

  it("abandons a hung classification at its deadline, failing closed", async () => {
    const deps = createChatDeps(parseEnv(edgeEnvSchema, edgeOnly));
    hangUntilAborted();
    try {
      const started = Date.now();
      const result = await deps.classify("a question");
      expect(result.ok, "an unanswerable classification must fail closed").toBe(false);
      expect(Date.now() - started).toBeLessThan(CLASSIFY_DEADLINE_MS * 3);
    } finally {
      vi.restoreAllMocks();
    }
  }, 30_000);

  it("abandons a hung rewrite at its deadline instead of hanging the request", async () => {
    const deps = createChatDeps(parseEnv(edgeEnvSchema, edgeOnly));
    hangUntilAborted();
    try {
      const started = Date.now();
      await expect(deps.rewrite("a hostile question")).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(REWRITE_DEADLINE_MS * 3);
    } finally {
      vi.restoreAllMocks();
    }
  }, 40_000);

  it("stops at once when the reader has already gone, without waiting out the deadline", async () => {
    // The composed signal must honour the request half, not only the timeout —
    // otherwise a disconnect still waits the full budget before giving up.
    const deps = createChatDeps(parseEnv(edgeEnvSchema, edgeOnly));
    hangUntilAborted();
    try {
      const started = Date.now();
      const result = await deps.classify("a question", AbortSignal.abort());
      expect(result.ok).toBe(false);
      expect(
        Date.now() - started,
        "an already-gone reader must not wait out the deadline",
      ).toBeLessThan(CLASSIFY_DEADLINE_MS);
    } finally {
      vi.restoreAllMocks();
    }
  }, 20_000);
});
