import { describe, expect, it, vi } from "vitest";
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

describe("a stream that goes silent is abandoned, not waited on forever", () => {
  /** Sends `pieces`, then holds the connection open sending nothing. */
  function sseThenSilence(pieces: string[]) {
    return (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            for (const p of pieces) controller.enqueue(encoder.encode(p));
            // Deliberately never closed and never written to again.
          },
        }),
        { status: 200 },
      )) as unknown as typeof globalThis.fetch;
  }

  it("gives up when no data arrives within the idle budget", async () => {
    // An idle bound, not a total one: the first chunk arrives and is yielded,
    // and only the SILENCE afterwards ends the stream. A total timeout would cut
    // off a legitimately long answer instead.
    const doFetch = sseThenSilence(['data: {"choices":[{"delta":{"content":"first"}}]}\n\n']);
    const out: string[] = [];
    const started = Date.now();
    const run = async () => {
      for await (const t of createChatStream(
        { apiKey: "k", fetch: doFetch },
        { model: ANSWER_MODEL, maxTokens: 50, messages: [] },
        undefined,
        150, // idle budget, injected so the suite does not wait 30 seconds
      )) {
        out.push(t);
      }
    };
    await expect(run()).rejects.toThrow(/stalled/i);
    expect(out, "what did arrive before the silence is still delivered").toEqual(["first"]);
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 20_000);

  it("does not cut off a long answer that keeps arriving", async () => {
    // The clock resets on every chunk, so a slow-but-alive provider is fine.
    const encoder = new TextEncoder();
    const doFetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            for (let i = 0; i < 6; i += 1) {
              await new Promise((r) => setTimeout(r, 60));
              controller.enqueue(
                encoder.encode(`data: {"choices":[{"delta":{"content":"${i}"}}]}\n\n`),
              );
            }
            controller.close();
          },
        }),
        { status: 200 },
      )) as unknown as typeof globalThis.fetch;

    const out: string[] = [];
    for await (const t of createChatStream(
      { apiKey: "k", fetch: doFetch },
      { model: ANSWER_MODEL, maxTokens: 50, messages: [] },
      undefined,
      150, // each gap is well inside the budget, but the total far exceeds it
    )) {
      out.push(t);
    }
    expect(out.join("")).toBe("012345");
  }, 20_000);
});

describe("a failing stream says WHICH failure it was", () => {
  /** Hangs until aborted, like a real fetch. */
  const hangs = (async (_u: unknown, init?: RequestInit) =>
    new Promise<Response>((_r, reject) => {
      const abort = () => reject(new DOMException("aborted", "AbortError"));
      const s = init?.signal;
      if (!s) return;
      if (s.aborted) return abort();
      s.addEventListener("abort", abort, { once: true });
    })) as unknown as typeof globalThis.fetch;

  const run = (signal?: AbortSignal, connectMs = 120) => async () => {
    for await (const _ of createChatStream(
      { apiKey: "k", fetch: hangs },
      { model: ANSWER_MODEL, maxTokens: 50, messages: [] },
      signal,
      30_000,
      connectMs,
    )) {
      void _;
    }
  };

  it("names the connect timeout when the provider never answers", async () => {
    // Both the timeout and a reader disconnect trip the SAME controller, so
    // without this distinction a dead provider — the failure this bound exists
    // to catch — was logged identically to someone closing a tab.
    await expect(run()()).rejects.toThrow(/did not respond within 120ms/);
  }, 20_000);

  it("names the reader instead when the reader is the one who left", async () => {
    // Same controller, same AbortError, different cause — and the message must
    // say so, or the operational signal is absorbed.
    await expect(run(AbortSignal.abort(), 30_000)()).rejects.toThrow(/reader disconnected/i);
  }, 20_000);

  it("does not blame the reader for a provider timeout, or vice versa", async () => {
    await expect(run()()).rejects.not.toThrow(/reader disconnected/i);
    await expect(run(AbortSignal.abort(), 30_000)()).rejects.not.toThrow(/did not respond within/);
  }, 20_000);
});

describe("a connection that fails to close is reported, not discarded", () => {
  it("hands the cleanup failure to the caller instead of swallowing it blindly", async () => {
    // Swallowing is right — rethrowing from the finally would mask the stall that
    // actually matters — but discarding it left a real resource leak with no
    // trace anywhere.
    const reported: unknown[] = [];
    const encoder = new TextEncoder();
    const doFetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"x"}}]}\n\n'),
            );
            // then silence, so the idle bound fires and cleanup runs
          },
          cancel() {
            throw new Error("connection refused to close");
          },
        }),
        { status: 200 },
      )) as unknown as typeof globalThis.fetch;

    const run = async () => {
      for await (const _ of createChatStream(
        { apiKey: "k", fetch: doFetch, onCleanupError: (e) => reported.push(e) },
        { model: ANSWER_MODEL, maxTokens: 50, messages: [] },
        undefined,
        120,
      )) {
        void _;
      }
    };

    // The PRIMARY error still surfaces — the cleanup failure must not mask it.
    await expect(run()).rejects.toThrow(/stalled/i);
    expect(reported, "the cleanup failure must reach the caller").toHaveLength(1);
    expect(String(reported[0])).toMatch(/refused to close/);
  }, 20_000);
});

describe("no exit path leaves a listener on the reader's signal", () => {
  /** Counts listeners the stream attaches to the signal and removes again. */
  function countingSignal() {
    const controller = new AbortController();
    const signal = controller.signal;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    const state = { attached: 0 };
    vi.spyOn(signal, "addEventListener").mockImplementation(((...a: unknown[]) => {
      state.attached += 1;
      return (add as (...x: unknown[]) => void)(...a);
    }) as typeof signal.addEventListener);
    vi.spyOn(signal, "removeEventListener").mockImplementation(((...a: unknown[]) => {
      state.attached -= 1;
      return (remove as (...x: unknown[]) => void)(...a);
    }) as typeof signal.removeEventListener);
    return { signal, state };
  }

  const cases: Array<[string, () => Response]> = [
    ["a refused response", () => new Response("nope", { status: 401 })],
    ["a response with no body", () => new Response(null, { status: 200 })],
    [
      "a stream that completes normally",
      () =>
        new Response(new TextEncoder().encode("data: [DONE]\n\n").buffer as ArrayBuffer, {
          status: 200,
        }),
    ],
  ];

  for (const [name, makeResponse] of cases) {
    it(`releases the listener after ${name}`, async () => {
      // The two failure paths here used to throw BETWEEN the removal sites, so
      // the listener stayed attached to the reader's signal. One cleanup site now
      // covers every exit; this counts them rather than trusting the structure.
      const { signal, state } = countingSignal();
      const doFetch = (async () => makeResponse()) as unknown as typeof globalThis.fetch;
      const run = async () => {
        for await (const _ of createChatStream(
          { apiKey: "k", fetch: doFetch },
          { model: ANSWER_MODEL, maxTokens: 50, messages: [] },
          signal,
        )) {
          void _;
        }
      };
      await run().catch(() => {});
      expect(state.attached, "every attached listener must be released").toBe(0);
      vi.restoreAllMocks();
    }, 20_000);
  }
});
