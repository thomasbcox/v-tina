import { describe, expect, it } from "vitest";
import {
  ANSWER_MODEL,
  CLASSIFIER_MODEL,
  ChatError,
  FIREWORKS_CHAT_URL,
  createChatCompletion,
  createChatStream,
} from "../src/lib/fireworks";
import {
  CLASSIFY_MAX_TOKENS,
  SAFETY_CLASSIFICATIONS,
  parseClassification,
} from "../src/lib/safety";

function jsonFetch(reply: unknown, status = 200) {
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof globalThis.fetch;
  return { doFetch, sent };
}

/** A stream of SSE records, deliberately chopped at awkward byte boundaries so
 *  the decoder's buffering is exercised rather than assumed. */
function sseFetch(pieces: string[], status = 200) {
  const doFetch = (async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const p of pieces) controller.enqueue(encoder.encode(p));
        controller.close();
      },
    });
    return new Response(status === 200 ? body : null, { status });
  }) as unknown as typeof globalThis.fetch;
  return doFetch;
}

describe("the Fireworks chat client", () => {
  it("posts the model, the messages and the token cap the caller asked for", async () => {
    const { doFetch, sent } = jsonFetch({ choices: [{ message: { content: "IN-BOUNDS" } }] });
    const reply = await createChatCompletion(
      { apiKey: "k", fetch: doFetch },
      {
        model: CLASSIFIER_MODEL,
        maxTokens: CLASSIFY_MAX_TOKENS,
        messages: [{ role: "user", content: "a question" }],
      },
    );
    expect(reply).toBe("IN-BOUNDS");
    expect(sent[0].url).toBe(FIREWORKS_CHAT_URL);
    expect(sent[0].body.model).toBe(CLASSIFIER_MODEL);
    expect(sent[0].body.max_tokens).toBe(CLASSIFY_MAX_TOKENS);
    expect(sent[0].body.stream).toBe(false);
  });

  it("names two distinct, well-formed Fireworks models", () => {
    // NOT the models the specification names. It names the Llama 3.1 family;
    // on 2026-09-10 the account serves no Llama model at all and the request
    // returns HTTP 404, so the named models are not choices that exist. The
    // substitutes were picked by measurement — see the story file. What is
    // asserted here is what remains true regardless of which models are served:
    // the identifiers are well formed, and classifying and answering are two
    // different jobs done by two different models.
    for (const m of [CLASSIFIER_MODEL, ANSWER_MODEL]) {
      expect(m).toMatch(/^accounts\/[a-z0-9-]+\/models\/[a-z0-9.-]+$/);
    }
    expect(CLASSIFIER_MODEL).not.toBe(ANSWER_MODEL);
  });

  it("rejects a response of the wrong shape rather than trusting it", async () => {
    const { doFetch } = jsonFetch({ choices: [] });
    await expect(
      createChatCompletion(
        { apiKey: "k", fetch: doFetch },
        { model: "m", maxTokens: 5, messages: [] },
      ),
    ).rejects.toBeInstanceOf(ChatError);
  });

  it("reassembles streamed text across arbitrary read boundaries", async () => {
    const doFetch = sseFetch([
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hello"',
      '}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const out: string[] = [];
    for await (const t of createChatStream({ apiKey: "k", fetch: doFetch }, {
      model: ANSWER_MODEL,
      maxTokens: 50,
      messages: [],
    })) {
      out.push(t);
    }
    expect(out.join("")).toBe("Hello world");
  });

  it("reports a refused stream instead of yielding nothing", async () => {
    const doFetch = sseFetch([], 401);
    const run = async () => {
      for await (const _ of createChatStream({ apiKey: "k", fetch: doFetch }, {
        model: ANSWER_MODEL,
        maxTokens: 50,
        messages: [],
      })) {
        void _;
      }
    };
    await expect(run()).rejects.toBeInstanceOf(ChatError);
  });
});

describe("AC4 (the parse) — a verdict is matched exactly or it is not a verdict", () => {
  it("accepts each declared value, trimmed", () => {
    for (const c of SAFETY_CLASSIFICATIONS) {
      for (const raw of [c, ` ${c} `, `${c}\n`]) {
        const result = parseClassification(raw);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // The EMITTED value, not just the comparison, is the canonical one — a
        // client matching the vocabulary exactly must never see a stray space.
        expect(result.classification).toBe(c);
        expect(SAFETY_CLASSIFICATIONS).toContain(result.classification);
      }
    }
  });

  it("refuses anything else, including a hedged or decorated reply", () => {
    const rejected = [
      "MAYBE",
      "in-bounds",
      "",
      "   ",
      '"IN-BOUNDS"',
      "IN-BOUNDS, though it could be read as a partisan trap",
      "The label is OUT-OF-BOUNDS",
      "IN-BOUNDS\nPARTISAN-TRAP",
    ];
    for (const reply of rejected) {
      expect(parseClassification(reply).ok, `must refuse ${JSON.stringify(reply)}`).toBe(false);
    }
  });
});

describe("the stream decoder survives what the service actually sends", () => {
  it("ignores records that carry no choice at all", async () => {
    // Usage accounting and keepalives arrive interleaved with content. Rejecting
    // them killed every real answer on 2026-09-10 while this suite stayed green,
    // because a fake only emits the records its author thought of.
    const doFetch = sseFetch([
      'data: {"choices":[]}\n\n',
      'data: {"choices":[{"delta":{"content":"real"}}]}\n\n',
      'data: {"choices":[],"usage":{"total_tokens":9}}\n\n',
      'data: {"choices":[{"delta":{"content":" text"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const out: string[] = [];
    for await (const t of createChatStream({ apiKey: "k", fetch: doFetch }, {
      model: ANSWER_MODEL,
      maxTokens: 50,
      messages: [],
    })) {
      out.push(t);
    }
    expect(out.join("")).toBe("real text");
  });

  it("still refuses a record of a genuinely wrong shape", async () => {
    const doFetch = sseFetch(['data: {"choices":[{"delta":{"content":42}}]}\n\n']);
    const run = async () => {
      for await (const _ of createChatStream({ apiKey: "k", fetch: doFetch }, {
        model: ANSWER_MODEL,
        maxTokens: 50,
        messages: [],
      })) {
        void _;
      }
    };
    await expect(run()).rejects.toBeInstanceOf(ChatError);
  });
});
