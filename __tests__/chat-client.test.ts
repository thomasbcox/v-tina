import { describe, expect, it } from "vitest";
import type { ChatStreamEvent, RetrievedPolicyChunk } from "../src/types";
import {
  buildRequest,
  canSend,
  endTurn,
  newTurn,
  readChatStream,
  reduceTurn,
  sourcesOf,
  type Turn,
} from "../src/lib/chat/client";
import { chatStreamEventSchema } from "../src/lib/chat/events";
import { MAX_HISTORY_MESSAGES, chatRequestSchema } from "../src/lib/chat/request";
import { encodeEvent } from "../src/lib/chat/stream";
import { CONNECTION_NOTICE } from "../src/lib/copy";
import { GROUNDED_DEFERRAL, PROVENANCE_NOTICE } from "../src/lib/prompts";

/** Story `chat-screen`: the screen's logic, with no DOM. The components are in
 *  chat-screen.test.tsx. */

function chunk(n: number, over: Partial<RetrievedPolicyChunk["source"]> = {}, content = `passage ${n}`): RetrievedPolicyChunk {
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
      ...over,
    },
    similarity: 0.8,
  };
}

/** One record of every declared kind, so a kind added to the contract fails the
 *  typecheck here until a sample is written for it. */
const SAMPLE: Record<ChatStreamEvent["type"], ChatStreamEvent> = {
  safety_status: { type: "safety_status", classification: "IN-BOUNDS" },
  retrieved_chunks: { type: "retrieved_chunks", chunks: [chunk(1)] },
  streamed_tokens: { type: "streamed_tokens", text: "some words" },
  notice: { type: "notice", kind: "provenance", text: PROVENANCE_NOTICE },
  error: { type: "error", reason: "generation", notice: "a failure notice" },
  audit_log_status: { type: "audit_log_status", recorded: false },
};

function fold(events: ChatStreamEvent[], question = "A question?"): Turn {
  return events.reduce(reduceTurn, newTurn(1, question));
}

/** The bytes of a record sequence, delivered in pieces of `size` bytes. */
function streamOf(events: ChatStreamEvent[], size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(events.map(encodeEvent).join(""));
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const e of readChatStream(stream)) out.push(e);
  return out;
}

describe("AC4 — the reader yields exactly the records sent, however the bytes arrive", () => {
  // Multi-byte characters on purpose: an em dash, curly quotation marks, and a
  // four-byte emoji. A one-byte chunk size splits inside every one of them, and
  // inside the blank line between records.
  const events: ChatStreamEvent[] = [
    { type: "safety_status", classification: "PARTISAN-TRAP", neutralisedQuestion: "Why — “really”?" },
    { type: "retrieved_chunks", chunks: [chunk(1, {}, "a passage with “quotes” — and more")] },
    { type: "streamed_tokens", text: "first part — " },
    { type: "streamed_tokens", text: "second part 🙂\n\nwith a paragraph break" },
    { type: "notice", kind: "provenance", text: PROVENANCE_NOTICE },
    { type: "audit_log_status", recorded: false },
  ];

  for (const size of [1, 2, 3, 5, 7, 64, 100_000]) {
    it(`in pieces of ${size} byte(s)`, async () => {
      const got = await collect(streamOf(events, size));
      got.forEach((e) => expect(chatStreamEventSchema.safeParse(e).success).toBe(true));
      expect(got).toEqual(events);
    });
  }

  it("holds the answer as the concatenation of its tokens after every record, still in progress", () => {
    const pieces = ["As a virtual avatar", " of the Governor,", " here is", " the record."];
    let turn = fold([SAMPLE.safety_status, SAMPLE.retrieved_chunks]);
    for (let i = 0; i < pieces.length; i += 1) {
      turn = reduceTurn(turn, { type: "streamed_tokens", text: pieces[i] });
      expect(turn.answer).toBe(pieces.slice(0, i + 1).join(""));
      expect(turn.status).toBe("answering");
      expect(turn.ended).toBe(false);
    }
    turn = reduceTurn(turn, SAMPLE.audit_log_status);
    expect(turn.status).toBe("done");
    expect(turn.ended).toBe(true);
  });
});

describe("AC10 — a stream that breaks before its final record is incomplete, and says so", () => {
  it("a stream that simply ends after tokens is not a finished answer", () => {
    const cut = fold([SAMPLE.safety_status, SAMPLE.retrieved_chunks, SAMPLE.streamed_tokens]);
    expect(cut.ended).toBe(false);
    const ended = endTurn(cut);
    expect(ended.status).toBe("incomplete");
    expect(ended.notice).toEqual({ kind: "connection", text: CONNECTION_NOTICE });
    expect(ended.answer, "what arrived is kept").toBe("some words");
  });

  it("a turn whose final record arrived is left exactly as it is", () => {
    const done = fold([SAMPLE.safety_status, SAMPLE.retrieved_chunks, SAMPLE.streamed_tokens, SAMPLE.audit_log_status]);
    expect(endTurn(done)).toBe(done);
    const failed = fold([SAMPLE.safety_status, SAMPLE.error]);
    expect(endTurn(failed)).toBe(failed);
    expect(failed.status).toBe("incomplete");
  });

  it("a server notice already explaining the stop is not replaced by the connection notice", () => {
    const stopped = endTurn(fold([SAMPLE.safety_status, SAMPLE.streamed_tokens, SAMPLE.notice]));
    expect(stopped.status).toBe("incomplete");
    expect(stopped.notice?.kind).toBe("provenance");
  });

  it("a record that is not a declared record is refused, not skipped", async () => {
    const bogus = new TextEncoder().encode(
      `${encodeEvent(SAMPLE.safety_status)}data: {"type":"bogus","text":"x"}\n\n${encodeEvent(SAMPLE.audit_log_status)}`,
    );
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bogus);
        c.close();
      },
    });
    const got: ChatStreamEvent[] = [];
    await expect(async () => {
      for await (const e of readChatStream(stream)) got.push(e);
    }).rejects.toThrow(/not a declared record/);
    expect(got, "the records before it still arrive").toEqual([SAMPLE.safety_status]);
  });

  it("a record that is not JSON is refused too", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode("data: {not json\n\n"));
        c.close();
      },
    });
    await expect(collect(stream)).rejects.toThrow(/not readable/);
  });
});

describe("the reducer handles every declared record kind", () => {
  it("each sample moves the turn, and none is answer text except the token record", () => {
    for (const event of Object.values(SAMPLE)) {
      const turn = reduceTurn(newTurn(1, "q"), event);
      if (event.type === "streamed_tokens") expect(turn.answer).toBe(event.text);
      else expect(turn.answer, `${event.type} must never become answer text`).toBe("");
    }
  });

  it("a notice ends the answer as incomplete and keeps the notice apart from the answer", () => {
    const turn = fold([SAMPLE.safety_status, SAMPLE.streamed_tokens, SAMPLE.notice, SAMPLE.audit_log_status]);
    expect(turn.status).toBe("incomplete");
    expect(turn.answer).toBe("some words");
    expect(turn.notice).toEqual({ kind: "provenance", text: PROVENANCE_NOTICE });
  });

  it("a failure record is a terminator in its own right", () => {
    const turn = fold([SAMPLE.safety_status, SAMPLE.streamed_tokens, SAMPLE.error]);
    expect(turn.ended).toBe(true);
    expect(turn.status).toBe("incomplete");
    expect(turn.notice).toEqual({ kind: "failure", text: "a failure notice" });
  });

  it("the rewording and the verdict come from the first record", () => {
    const turn = reduceTurn(newTurn(1, "q"), {
      type: "safety_status",
      classification: "PARTISAN-TRAP",
      neutralisedQuestion: "a neutral question",
    });
    expect(turn.neutralisedQuestion).toBe("a neutral question");
    expect(turn.classification).toBe("PARTISAN-TRAP");
    expect(turn.status, "the verdict is not something the reader can see").toBe("waiting");
    const withPassages = reduceTurn(turn, SAMPLE.retrieved_chunks);
    expect(withPassages.status, "nor are the passages, yet").toBe("waiting");
    expect(reduceTurn(withPassages, SAMPLE.streamed_tokens).status, "the first words end the wait").toBe("answering");
  });
});

describe("AC5 — sources are grouped by document, never by title", () => {
  it("two documents sharing a title stay two entries; two passages from one document stay together", () => {
    const chunks = [
      chunk(1, { documentTitle: "EO 23-02", url: "https://www.oregon.gov/gov/eo/eo-23-02.pdf" }, "first of two"),
      chunk(2, { documentTitle: "HB 2001", url: "https://olis.oregonlegislature.gov/hb2001", documentKind: "legislative" }),
      chunk(3, { documentTitle: "EO 23-02", url: "https://www.oregon.gov/gov/eo/eo-23-02.pdf" }, "second of two"),
      // The same short title as the first, at a different address: a different document.
      chunk(4, { documentTitle: "EO 23-02", url: "https://www.oregon.gov/gov/eo/eo-23-02-amended.pdf" }, "the amendment"),
    ];
    const sources = sourcesOf(chunks);
    expect(sources.map((s) => s.url)).toEqual([
      "https://www.oregon.gov/gov/eo/eo-23-02.pdf",
      "https://olis.oregonlegislature.gov/hb2001",
      "https://www.oregon.gov/gov/eo/eo-23-02-amended.pdf",
    ]);
    expect(sources[0].passages).toEqual(["first of two", "second of two"]);
    expect(sources[2].passages).toEqual(["the amendment"]);
    expect(sources[1].documentKind).toBe("legislative");
  });
});

describe("AC7 — a declined question carries the deferral and no sources", () => {
  it("out of bounds", () => {
    const turn = fold([
      { type: "safety_status", classification: "OUT-OF-BOUNDS" },
      { type: "streamed_tokens", text: GROUNDED_DEFERRAL },
      SAMPLE.audit_log_status,
    ]);
    expect(turn.answer).toBe(GROUNDED_DEFERRAL);
    expect(turn.sources).toEqual([]);
    expect(turn.status).toBe("done");
  });

  it("nothing above the threshold", () => {
    const turn = fold([
      SAMPLE.safety_status,
      { type: "retrieved_chunks", chunks: [] },
      { type: "streamed_tokens", text: GROUNDED_DEFERRAL },
      SAMPLE.audit_log_status,
    ]);
    expect(turn.sources).toEqual([]);
  });
});

describe("AC11 — one question at a time", () => {
  it("nothing may be sent while a turn is waiting or answering", () => {
    expect(canSend([])).toBe(true);
    expect(canSend([newTurn(1, "q")])).toBe(false);
    expect(canSend([fold([SAMPLE.safety_status])])).toBe(false);
    expect(canSend([fold([SAMPLE.safety_status, SAMPLE.audit_log_status])])).toBe(true);
    expect(canSend([endTurn(fold([SAMPLE.safety_status, SAMPLE.streamed_tokens]))])).toBe(true);
  });
});

describe("AC12 — a long conversation is trimmed by whole turns and the service accepts it", () => {
  const answered = (id: number, question: string, answer: string): Turn => ({
    ...fold([SAMPLE.safety_status, { type: "streamed_tokens", text: answer }, SAMPLE.audit_log_status], question),
    id,
  });

  it("drops the oldest turns first, keeps the roles alternating, and ends with the new question", () => {
    const turns = Array.from({ length: 25 }, (_, i) => answered(i + 1, `question ${i + 1}`, `answer ${i + 1}`));
    const body = buildRequest(turns, "the new question");

    expect(chatRequestSchema.safeParse(body).success, "the service must accept it").toBe(true);
    expect(body.messages.length).toBeLessThanOrEqual(MAX_HISTORY_MESSAGES);
    expect(body.messages[body.messages.length - 1]).toEqual({ role: "user", content: "the new question" });
    expect(body.messages[0].role, "never an orphaned reply at the head").toBe("user");
    for (let i = 1; i < body.messages.length; i += 1) {
      expect(body.messages[i].role, "two of one role in a row severs a pair").not.toBe(body.messages[i - 1].role);
    }
    const kept = body.messages.filter((m) => m.role === "user").map((m) => m.content);
    expect(kept, "the most recent turn is kept").toContain("question 25");
    expect(kept, "the oldest turn goes first").not.toContain("question 1");
    // Everything kept is a contiguous run ending at the newest turn.
    const indices = kept.slice(0, -1).map((q) => Number(q.replace("question ", "")));
    expect(indices).toEqual(Array.from({ length: indices.length }, (_, i) => 25 - indices.length + 1 + i));
  });

  it("a prior turn contributes its answer text and never its notice", () => {
    const stopped: Turn = {
      ...fold([SAMPLE.safety_status, { type: "streamed_tokens", text: "the words that arrived" }, SAMPLE.notice, SAMPLE.audit_log_status], "q1"),
      id: 1,
    };
    const cut: Turn = { ...endTurn(fold([SAMPLE.safety_status, { type: "streamed_tokens", text: "cut short" }], "q2")), id: 2 };
    const body = buildRequest([stopped, cut], "q3");
    const text = JSON.stringify(body);
    expect(text).toContain("the words that arrived");
    expect(text).toContain("cut short");
    expect(text).not.toContain(PROVENANCE_NOTICE);
    expect(text).not.toContain(CONNECTION_NOTICE);
  });

  it("a prior turn with no answer text is left out whole, so the roles still alternate", () => {
    const failedBeforeWords: Turn = { ...fold([SAMPLE.safety_status, SAMPLE.error], "q1"), id: 1 };
    const fine = answered(2, "q2", "a2");
    const body = buildRequest([failedBeforeWords, fine], "q3");
    expect(body.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(body)).not.toContain("q1");
  });
});
