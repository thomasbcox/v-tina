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

export function createChatDeps(env: EdgeEnv): ChatDeps {
  const chat = { apiKey: env.FIREWORKS_API_KEY };
  const embed = createFireworksEmbedder({ apiKey: env.FIREWORKS_API_KEY, task: "query" });
  const supabase = createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return {
    async classify(question) {
      // ONE clock for the whole step, retries and backoff included. Without it
      // the deadline and the retry loop disagree: a full RETRY_MAX_ATTEMPTS run,
      // each attempt inside its own timeout, totals far more than the budget
      // declared here.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CLASSIFY_DEADLINE_MS);
      try {
        const reply = await createChatCompletion(
          { ...chat, retry: { signal: controller.signal } },
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
      } finally {
        clearTimeout(timer);
      }
    },

    async rewrite(question) {
      return createChatCompletion(chat, {
        model: CLASSIFIER_MODEL,
        maxTokens: REWRITE_MAX_TOKENS,
        messages: [
          { role: "system", content: REWRITE_SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
      });
    },

    async retrieve(question) {
      const [vector] = await embed([question]);
      return queryPolicyChunks(
        supabase,
        vector,
        DEFAULT_MATCH_THRESHOLD,
        ANSWER_CHUNK_COUNT,
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
