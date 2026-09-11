import { FAILURE_NOTICE } from "../../../lib/prompts";
import { createChatDeps } from "../../../lib/chat/deps";
import { orchestrateChat } from "../../../lib/chat/orchestrate";
import { parseChatRequest } from "../../../lib/chat/request";
import { SSE_CONTENT_TYPE, toSseStream } from "../../../lib/chat/stream";
import { getEdgeEnv } from "../../../lib/env";

/**
 * `/api/chat` — the public entry point.
 *
 * Next.js reads this export to decide the runtime; the edge environment contract
 * exists for exactly this route and deliberately excludes the service-role
 * secret, so nothing server-only may be reachable from here.
 */
export const runtime = "edge";

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
  const stream = toSseStream(orchestrateChat(deps, parsed.body), {
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
