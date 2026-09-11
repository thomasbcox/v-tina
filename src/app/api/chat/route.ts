import { FAILURE_NOTICE } from "../../../lib/prompts";
import { createChatDeps } from "../../../lib/chat/deps";
import { orchestrateChat } from "../../../lib/chat/orchestrate";
import { parseChatRequest } from "../../../lib/chat/request";
import { SSE_CONTENT_TYPE, toSseStream } from "../../../lib/chat/stream";
import { getEdgeEnv } from "../../../lib/env";

/**
 * `/api/chat` — the public entry point.
 *
 * Next.js reads this export to decide the runtime.
 *
 * **This was the Edge runtime until 2026-09-10.** The specification asks for
 * edge and the story was approved that way; the production build then reported
 * that Next.js 16 deprecates it. Thomas chose at the review consult to walk
 * through that one-way door now, while exactly one route depends on it, rather
 * than let User Stories 4 and 5 inherit a deprecated foundation and be forced
 * through the migration later.
 *
 * **What changed about the secret, stated plainly.** This route reads only
 * `getEdgeEnv()` — the request-path contract, which deliberately excludes the
 * service-role key. Under the Edge runtime that exclusion was enforced by the
 * platform, which could not see server-only variables at all. On Node it is a
 * discipline rather than a wall: the secret exists in the process environment,
 * and what keeps it out of the request path is this accessor plus the tests that
 * hold the route to it. The contract is unchanged and still correct; the
 * guarantee behind it is now ours to keep rather than the runtime's to impose.
 * (`edgeEnvSchema` keeps its name: renaming it reaches outside this story's
 * scope, and the name now describes the contract rather than the runtime.)
 */
export const runtime = "nodejs";

/**
 * A thin adapter and nothing else: validate, build dependencies, delegate,
 * frame. Every decision worth testing lives in `orchestrateChat`, which takes
 * its collaborators as parameters — a route handler receives only a `Request`,
 * so logic placed here would be reachable only with live services.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = parseChatRequest(await request.text());
  if (!parsed.ok) {
    // Refused before anything downstream runs: no classification, no embedding,
    // no search, no answer, and no client constructed.
    return Response.json({ error: parsed.problem }, { status: 400 });
  }

  const deps = createChatDeps(getEdgeEnv());
  // `request.signal` aborts when the reader disconnects. Threading it through is
  // what stops the answering model generating words nobody will read — on a
  // public endpoint that is a recurring cost, and an easy one to run up
  // deliberately by opening connections and dropping them.
  const stream = toSseStream(orchestrateChat(deps, parsed.body, request.signal), {
    type: "error",
    reason: "unknown",
    notice: FAILURE_NOTICE,
  });

  return new Response(stream, {
    headers: {
      "content-type": SSE_CONTENT_TYPE,
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
