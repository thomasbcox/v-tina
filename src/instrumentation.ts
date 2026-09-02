/**
 * Application startup hook.
 *
 * Next.js calls `register()` once per runtime, before anything is served.
 * Validating here means a missing or malformed key stops startup and names every
 * offender, instead of surfacing later inside a request.
 *
 * Each runtime validates its OWN contract: the Edge runtime does not carry
 * server-only secrets, so demanding them there would fail on variables that are
 * not supposed to exist.
 *
 * Fails CLOSED. An unrecognised or absent runtime identifier refuses to start
 * rather than skipping validation — a silent unvalidated boot is the exact failure
 * this hook exists to remove.
 */
export async function register(): Promise<void> {
  const runtime = process.env.NEXT_RUNTIME;
  const { getNodeEnv, getEdgeEnv } = await import("./lib/env");

  switch (runtime) {
    case "nodejs":
      getNodeEnv();
      return;
    case "edge":
      getEdgeEnv();
      return;
    default:
      throw new Error(
        `Refusing to start: startup validation covers the "nodejs" and "edge" runtimes, ` +
          `but NEXT_RUNTIME is ${runtime ? `"${runtime}"` : "unset"}. ` +
          `Starting without validating configuration is not a supported path.`,
      );
  }
}
