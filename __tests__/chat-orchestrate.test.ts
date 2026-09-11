import { describe, expect, it } from "vitest";
import type { ChatStreamEvent, RetrievedPolicyChunk } from "../src/types";
import type { ChatMessage } from "../src/lib/fireworks";
import { GROUNDED_DEFERRAL, OREGON_PORTAL_URL, ANSWER_SYSTEM_PROMPT } from "../src/lib/prompts";
import { SAFETY_CLASSIFICATIONS, type ClassificationResult } from "../src/lib/safety";
import { orchestrateChat, type ChatDeps } from "../src/lib/chat/orchestrate";
import type { ChatRequestBody } from "../src/lib/chat/request";

/** A chunk with everything the verification UI would need to cite it. */
function chunk(n: number, content: string): RetrievedPolicyChunk {
  return {
    id: `chunk-${n}`,
    content,
    chunkIndex: n,
    source: {
      documentTitle: `EO 2${n}-0${n}`,
      date: `202${n}-01-0${n}`,
      url: `https://www.oregon.gov/gov/eo/eo-2${n}-0${n}.pdf`,
      pillar: "housing-and-homelessness",
      documentKind: "executive",
    },
    similarity: 0.9 - n / 100,
  };
}

function ask(question: string, history: ChatRequestBody["messages"] = []): ChatRequestBody {
  return { messages: [...history, { role: "user", content: question }] };
}

interface Recorder {
  deps: ChatDeps;
  classified: string[];
  rewritten: string[];
  retrieved: string[];
  answered: ChatMessage[][];
}

function recorder(over: Partial<ChatDeps> = {}): Recorder {
  const r: Recorder = {
    classified: [],
    rewritten: [],
    retrieved: [],
    answered: [],
    deps: {} as ChatDeps,
  };
  r.deps = {
    classify: async (q) => {
      r.classified.push(q);
      return { ok: true, classification: "IN-BOUNDS" } satisfies ClassificationResult;
    },
    rewrite: async (q) => {
      r.rewritten.push(q);
      return "neutral restatement";
    },
    retrieve: async (q) => {
      r.retrieved.push(q);
      return [chunk(1, "alpha passage"), chunk(2, "beta passage")];
    },
    answer: async function* (messages) {
      r.answered.push(messages);
      yield "an answer";
    },
    // Deliberate failures are exercised below; swallow the log so the suite is
    // readable rather than noisy.
    logError: () => {},
    ...over,
  };
  return r;
}

/** Collects an exchange, optionally under a cancellation signal. */
async function collect2(
  deps: ChatDeps,
  body: ChatRequestBody,
  signal?: AbortSignal,
): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const e of orchestrateChat(deps, body, signal)) out.push(e);
  return out;
}

async function collect(deps: ChatDeps, body: ChatRequestBody): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const e of orchestrateChat(deps, body)) out.push(e);
  return out;
}

const kinds = (events: ChatStreamEvent[]) => events.map((e) => e.type);

describe("AC1 — an in-bounds question is classified, searched, and answered", () => {
  it("reports the verdict, the passages with their sources, then the answer", async () => {
    const r = recorder();
    const events = await collect(r.deps, ask("How are you responding to early literacy?"));

    expect(kinds(events)).toEqual([
      "safety_status",
      "retrieved_chunks",
      "streamed_tokens",
      "audit_log_status",
    ]);
    expect(events[0]).toEqual({ type: "safety_status", classification: "IN-BOUNDS" });

    const passages = events[1];
    if (passages.type !== "retrieved_chunks") throw new Error("expected passages");
    expect(passages.chunks).toHaveLength(2);
    for (const c of passages.chunks) {
      // Every field the verification UI needs to render a citation.
      expect(c.source.documentTitle).toBeTruthy();
      expect(c.source.date).toBeTruthy();
      expect(c.source.url).toMatch(/^https:\/\//);
      expect(c.source.pillar).toBeTruthy();
      expect(c.similarity).toBeGreaterThan(0);
    }
  });

  it("gives the answering model the retrieved passages and NO other grounding", async () => {
    const r = recorder();
    await collect(r.deps, ask("What is being done about housing supply?"));

    expect(r.retrieved, "exactly one search — a second, broader one is smuggled grounding").toHaveLength(1);
    expect(r.answered).toHaveLength(1);
    const messages = r.answered[0];

    // The system instruction is the declared constant, byte for byte. A digest of
    // the Governor's priorities appended here would travel as grounding while the
    // chunks parameter still looked correct.
    expect(messages[0]).toEqual({ role: "system", content: ANSWER_SYSTEM_PROMPT });
    expect(messages, "no message beyond the instruction and the question").toHaveLength(2);

    // Everything in the payload is accounted for by the constant, the question,
    // or a retrieved chunk. Anything else is grounding from somewhere unlogged.
    const payload = messages.map((m) => m.content).join("\n");
    let residue = payload
      .replace(ANSWER_SYSTEM_PROMPT, "")
      .replace("What is being done about housing supply?", "");
    for (const c of [chunk(1, "alpha passage"), chunk(2, "beta passage")]) {
      residue = residue
        .replace(c.content, "")
        .replace(c.source.documentTitle, "")
        .replace(c.source.url, "")
        .replace(c.source.date, "");
    }
    expect(
      residue.replace(/[\s\-[\]()—]|Source passages:|Question:/g, ""),
      "unaccounted text reached the answering model",
    ).toBe("");
  });
});

describe("AC2 — a partisan trap is neutralised before anything is searched", () => {
  const hostile = "Why are you bowing to Republican pressure and flip-flopping on Measure 110?";

  it("states the neutralised question and searches on it, not the original", async () => {
    const r = recorder({
      classify: async () => ({ ok: true, classification: "PARTISAN-TRAP" }),
      rewrite: async () => "How has Oregon's approach to Measure 110 changed?",
    });
    const events = await collect(r.deps, ask(hostile));

    expect(events[0]).toEqual({
      type: "safety_status",
      classification: "PARTISAN-TRAP",
      neutralisedQuestion: "How has Oregon's approach to Measure 110 changed?",
    });
    expect(r.retrieved).toEqual(["How has Oregon's approach to Measure 110 changed?"]);
    expect(r.retrieved, "the original attack must never reach the store").not.toContain(hostile);
    expect(kinds(events)).toContain("streamed_tokens");
  });

  it("never hands the original attack to the answering model either", async () => {
    const r = recorder({
      classify: async () => ({ ok: true, classification: "PARTISAN-TRAP" }),
      rewrite: async () => "How has Oregon's approach to Measure 110 changed?",
    });
    await collect(r.deps, ask(hostile));

    const payload = r.answered[0].map((m) => m.content).join("\n");
    // A clean search trail means nothing if the model is then asked the attack.
    expect(payload).not.toContain("bowing to Republican pressure");
    expect(payload).not.toContain("flip-flopping");
    expect(payload).toContain("How has Oregon's approach to Measure 110 changed?");
  });

  it("declines rather than falling back to the hostile original when the rewrite fails", async () => {
    for (const rewrite of [
      async () => {
        throw new Error("upstream down");
      },
      async () => "   ",
    ] as ChatDeps["rewrite"][]) {
      const r = recorder({
        classify: async () => ({ ok: true, classification: "PARTISAN-TRAP" }),
        rewrite,
      });
      const events = await collect(r.deps, ask(hostile));
      expect(kinds(events)).toEqual(["safety_status", "streamed_tokens", "audit_log_status"]);
      expect(r.retrieved).toEqual([]);
      expect(r.answered).toEqual([]);
    }
  });
});

describe("AC3 — an out-of-bounds question never reaches the store or the model", () => {
  it("returns the fixed deferral and nothing else at all", async () => {
    const r = recorder({ classify: async () => ({ ok: true, classification: "OUT-OF-BOUNDS" }) });
    const events = await collect(r.deps, ask("What is your favourite childhood memory?"));

    // Exact sequence: an extra empty token record would satisfy "no words from
    // the model" while breaking the promise that the deferral is the whole reply.
    expect(events).toEqual([
      { type: "safety_status", classification: "OUT-OF-BOUNDS" },
      { type: "streamed_tokens", text: GROUNDED_DEFERRAL },
      { type: "audit_log_status", recorded: false },
    ]);
    expect(r.retrieved, "the store must not be touched").toHaveLength(0);
    expect(r.answered, "the answering model must not be called").toHaveLength(0);
  });

  it("sends the reader to the official state portal, not to a redirect or a search", () => {
    const url = new URL(OREGON_PORTAL_URL);
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("www.oregon.gov");
    expect(url.search, "a search URL is not the portal").toBe("");
    expect(GROUNDED_DEFERRAL).toContain(OREGON_PORTAL_URL);
  });
});

describe("AC4 — an unusable classification is treated as out of bounds", () => {
  const cases: Array<[string, ChatDeps["classify"]]> = [
    ["the call threw", async () => { throw new Error("network down"); }],
    ["the deadline passed", async () => ({ ok: false, reason: "deadline reached" })],
    ["the reply was off-vocabulary", async () => ({ ok: false, reason: "said MAYBE" })],
  ];

  for (const [name, classify] of cases) {
    it(`declines when ${name}`, async () => {
      const r = recorder({ classify });
      const events = await collect(r.deps, ask("Anything at all"));
      expect(events).toEqual([
        { type: "safety_status", classification: "OUT-OF-BOUNDS" },
        { type: "streamed_tokens", text: GROUNDED_DEFERRAL },
        { type: "audit_log_status", recorded: false },
      ]);
      expect(r.retrieved).toHaveLength(0);
      expect(r.answered).toHaveLength(0);
    });
  }

  it("emits a verdict a client can match against the declared vocabulary exactly", async () => {
    for (const classification of SAFETY_CLASSIFICATIONS) {
      const r = recorder({ classify: async () => ({ ok: true, classification }) });
      const events = await collect(r.deps, ask("A question"));
      const first = events[0];
      if (first.type !== "safety_status") throw new Error("expected a verdict first");
      expect(SAFETY_CLASSIFICATIONS).toContain(first.classification);
      expect(first.classification).toBe(first.classification.trim());
    }
  });
});

describe("AC5 — an in-bounds question nothing grounds is declined, not invented", () => {
  it("reports an empty result and defers without calling the model", async () => {
    const r = recorder({ retrieve: async () => [] });
    const events = await collect(r.deps, ask("Oregon transportation funding?"));

    expect(events).toEqual([
      { type: "safety_status", classification: "IN-BOUNDS" },
      { type: "retrieved_chunks", chunks: [] },
      { type: "streamed_tokens", text: GROUNDED_DEFERRAL },
      { type: "audit_log_status", recorded: false },
    ]);
    expect(r.answered, "never write without retrieved material").toHaveLength(0);
  });

  it("does NOT present a store failure as a question nothing grounds", async () => {
    const r = recorder({
      retrieve: async () => {
        throw new Error("connection refused");
      },
    });
    const events = await collect(r.deps, ask("What does EO 23-02 do?"));

    // The deferral claims the records do not support an answer. Saying that on a
    // night the database is down is a false claim about the corpus, and it hides
    // the outage from everyone.
    expect(kinds(events)).toEqual(["safety_status", "error", "audit_log_status"]);
    const failure = events[1];
    if (failure.type !== "error") throw new Error("expected a failure record");
    expect(failure.reason).toBe("retrieval");
    const texts = events.filter((e) => e.type === "streamed_tokens");
    expect(texts, "an outage must not read as a deferral").toHaveLength(0);
  });

  it("reports a failure during the answer rather than ending silently", async () => {
    const r = recorder({
      answer: async function* () {
        yield "first words";
        throw new Error("provider closed the connection");
      },
    });
    const events = await collect(r.deps, ask("What does EO 23-02 do?"));
    expect(kinds(events)).toEqual([
      "safety_status",
      "retrieved_chunks",
      "streamed_tokens",
      "error",
      "audit_log_status",
    ]);
    const failure = events[3];
    if (failure.type !== "error") throw new Error("expected a failure record");
    expect(failure.reason).toBe("generation");
    expect(failure.notice, "no provider detail crosses the wire").not.toContain("provider closed");
  });
});

describe("a reader who disconnects stops every call made for them", () => {
  type Stage = "classify" | "rewrite" | "retrieve" | "answer";
  const ALL: Stage[] = ["classify", "rewrite", "retrieve", "answer"];

  /**
   * Records the signal each collaborator was handed and that it ran at all.
   * `abortDuring` names the stage that aborts partway through, the way a real
   * disconnect lands — declared up front rather than patched in afterwards, so
   * the deps object stays typed.
   */
  function signalRecorder(controller: AbortController, abortDuring?: Stage) {
    const seen: Partial<Record<Stage, AbortSignal | undefined>> = {};
    const enter = (stage: Stage, signal?: AbortSignal) => {
      seen[stage] = signal;
      if (stage === abortDuring) controller.abort();
    };
    const deps: ChatDeps = {
      classify: async (_q, signal) => {
        enter("classify", signal);
        return { ok: true, classification: "PARTISAN-TRAP" };
      },
      rewrite: async (_q, signal) => {
        enter("rewrite", signal);
        return "a neutral question";
      },
      retrieve: async (_q, signal) => {
        enter("retrieve", signal);
        return [chunk(1, "passage")];
      },
      answer: async function* (_m, signal) {
        enter("answer", signal);
        yield "words";
      },
      logError: () => {},
    };
    return { deps, seen };
  }

  it("hands the request signal to every collaborator, not just the answer", async () => {
    // Threading it to `answer` alone left classification, the rewrite, embedding
    // and the database query running for nobody.
    const controller = new AbortController();
    const { deps, seen } = signalRecorder(controller);
    await collect2(deps, ask("Why are you flip-flopping on Measure 110?"), controller.signal);
    for (const stage of ALL) {
      expect(seen[stage], `${stage} must receive the request signal`).toBe(controller.signal);
    }
  });

  const laterStages: Record<Exclude<Stage, "answer">, Stage[]> = {
    classify: ["rewrite", "retrieve", "answer"],
    rewrite: ["retrieve", "answer"],
    retrieve: ["answer"],
  };

  for (const stage of ["classify", "rewrite", "retrieve"] as const) {
    it(`starts no further call when the reader leaves during ${stage}`, async () => {
      const controller = new AbortController();
      const { deps, seen } = signalRecorder(controller, stage);
      await collect2(deps, ask("A question"), controller.signal);
      expect(stage in seen, `${stage} itself must have run`).toBe(true);
      for (const later of laterStages[stage]) {
        expect(later in seen, `${later} must not start for a reader who has gone`).toBe(false);
      }
    });
  }

  it("still runs every stage when the reader stays", async () => {
    // The gate must not be a blanket early return: a live request completes.
    const controller = new AbortController();
    const { deps, seen } = signalRecorder(controller);
    const events = await collect2(deps, ask("A question"), controller.signal);
    for (const stage of ALL) {
      expect(stage in seen, `${stage} must run for a connected reader`).toBe(true);
    }
    expect(kinds(events)).toContain("audit_log_status");
  });
});
