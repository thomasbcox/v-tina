/**
 * Application startup hook.
 *
 * Next.js calls `register()` once per runtime, before anything is served.
 * Validating here means a missing or malformed key stops startup and names every
 * offender, instead of surfacing later inside a request.
 *
 * Each runtime validates its OWN contract: the Edge runtime does not carry
 * server-only secrets, so demanding them there would fail on variables that are
 * not supposed to exist. Both runtimes are checked — neither is skipped.
 */
export async function register(): Promise<void> {
  const runtime = process.env.NEXT_RUNTIME;
  if (runtime !== "nodejs" && runtime !== "edge") return;

  const { getNodeEnv, getEdgeEnv } = await import("./lib/env");
  if (runtime === "nodejs") {
    getNodeEnv();
  } else {
    getEdgeEnv();
  }
}
