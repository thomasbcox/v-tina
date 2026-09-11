import { createFireworksEmbedder } from "../embeddings";
import type { EdgeEnv } from "../env";
import {
  ANSWER_MODEL,
  CLASSIFIER_MODEL,
  createChatCompletion,
  createChatStream,
} from "../fireworks";
import { CLASSIFIER_SYSTEM_PROMPT, REWRITE_SYSTEM_PROMPT } from "../prompts";
import {
  CLASSIFY_DEADLINE_MS,
  CLASSIFY_MAX_TOKENS,
  REWRITE_DEADLINE_MS,
  REWRITE_MAX_TOKENS,
  parseClassification,
} from "../safety";
import { DEFAULT_MATCH_THRESHOLD, createSupabaseClient, queryPolicyChunks } from "../supabase";
import type { ChatDeps } from "./orchestrate";

/**
 * The one place the chat route's real collaborators are constructed.
 *
 * Separate from the route file so a test can prove what the route cannot state
 * for itself: that the **edge** environment contract alone is sufficient. Every
 * value read here comes from `EdgeEnv`, which deliberately excludes the
 * service-role secret — retrieval runs on the public anon key, which the
 * migration's row-level security allows to read and not to write.
 */

/** How many chunks are offered to the answering model. Enough for a grounded
 *  answer, few enough that the prompt stays inside a sensible budget. */
export const ANSWER_CHUNK_COUNT = 6;

/**
 * **Every outbound call on the request path carries a wall-clock bound.** That
 * is the rule, not a list of the calls that happen to have one today.
 *
 * It is written as a rule because three rounds of review found it one instance
 * at a time: classification was bounded, then the rewrite, and retrieval and the
 * answer were still unbounded — so a reader who stayed connected through a stall
 * got the safety verdict and then a stream that never terminated, which is AC6's
 * own guarantee broken. `fetchWithRetry` bounds *attempts*, never elapsed time,
 * and Node's `fetch` has no default timeout, so nothing supplies this by accident.
 *
 * The budgets, in full: `CLASSIFY_DEADLINE_MS` and `REWRITE_DEADLINE_MS` live in
 * `../safety` with the steps they belong to; `RETRIEVAL_DEADLINE_MS` is below,
 * covering the embedding call and the database query together; and the answer
 * carries two in `../fireworks` — `ANSWER_CONNECT_MS` until the response arrives
 * and `ANSWER_IDLE_MS` for silence after it. **Five, not four**: this comment
 * listed four and omitted the connect bound, which was added to serve this same
 * rule in the same change — the enumerate-then-drift failure the rule exists to
 * prevent, committed by the comment written to prevent it. The guard test is what
 * actually holds the rule; this is the map, and a map can go stale.
 *
 * A test enumerates the collaborators this module returns and holds **each** of
 * them to a bound, so a fifth collaborator added without one fails rather than
 * waiting to be found by a fourth review round.
 */
export const RETRIEVAL_DEADLINE_MS = 10_000;

/**
 * The token budget for one answer.
 *
 * Budgets the model's REASONING as well as its prose, for the same reason the
 * classification cap does: every model the account serves thinks in a separate
 * field, and the cap covers both. Measured 2026-09-10 — a 900-token budget
 * produced an answer that stopped mid-sentence, because the reasoning had
 * consumed most of it.
 */
export const ANSWER_MAX_TOKENS = 4000;

/** A little warmth, well short of invention. The grounding rule lives in the
 *  prompt; this only stops the prose reading like a database dump. */
export const ANSWER_TEMPERATURE = 0.3;

/**
 * One signal carrying both a deadline and the reader's disconnection.
 *
 * `AbortSignal.any` + `AbortSignal.timeout` are the platform's own composition;
 * they replace a hand-built `AbortController`/`setTimeout` pair that had to be
 * cleared in a `finally` and could only ever express the deadline half.
 */
function deadline(ms: number, requestSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
}

export function createChatDeps(env: EdgeEnv): ChatDeps {
  const chat = { apiKey: env.FIREWORKS_API_KEY };
  const embed = createFireworksEmbedder({ apiKey: env.FIREWORKS_API_KEY, task: "query" });
  const supabase = createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return {
    async classify(question, signal) {
      // ONE clock for the whole step, retries and backoff included. Without it
      // the deadline and the retry loop disagree: a full RETRY_MAX_ATTEMPTS run,
      // each attempt inside its own timeout, totals far more than the budget
      // declared here.
      // The reader's disconnection rides the same clock as the deadline.
      try {
        const reply = await createChatCompletion(
          { ...chat, retry: { signal: deadline(CLASSIFY_DEADLINE_MS, signal) } },
          {
            model: CLASSIFIER_MODEL,
            maxTokens: CLASSIFY_MAX_TOKENS,
            messages: [
              { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
              { role: "user", content: question },
            ],
          },
        );
        return parseClassification(reply);
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async rewrite(question, signal) {
      // This call had NO bound at all until 2026-09-11 — no deadline and no
      // signal — so a hung rewrite hung the request. See REWRITE_DEADLINE_MS.
      return createChatCompletion(
        { ...chat, retry: { signal: deadline(REWRITE_DEADLINE_MS, signal) } },
        {
          model: CLASSIFIER_MODEL,
          maxTokens: REWRITE_MAX_TOKENS,
          messages: [
            { role: "system", content: REWRITE_SYSTEM_PROMPT },
            { role: "user", content: question },
          ],
        },
      );
    },

    async retrieve(question, signal) {
      // One budget covering both halves — the embedding request and the database
      // query — composed with the reader's signal exactly as the other stages do.
      const bounded = deadline(RETRIEVAL_DEADLINE_MS, signal);
      const [vector] = await embed([question], bounded);
      return queryPolicyChunks(
        supabase,
        vector,
        DEFAULT_MATCH_THRESHOLD,
        ANSWER_CHUNK_COUNT,
        undefined,
        bounded,
      );
    },

    answer(messages, signal) {
      return createChatStream(
        chat,
        {
          model: ANSWER_MODEL,
          maxTokens: ANSWER_MAX_TOKENS,
          temperature: ANSWER_TEMPERATURE,
          messages,
        },
        signal,
      );
    },
  };
}
