/**
 * Application startup hook.
 *
 * Next.js calls `register()` once, before the app serves anything. Validating
 * configuration here means a missing or malformed key stops the app at boot and
 * names every offender, instead of surfacing later inside a request.
 *
 * Guarded to the Node runtime deliberately: the Edge runtime does not carry the
 * server-only keys, so running this there would fail on variables that are not
 * supposed to exist in that environment.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv } = await import("./lib/env");
  getEnv();
}
