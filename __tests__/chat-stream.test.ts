import { describe, expect, it } from "vitest";
import type { ChatStreamEvent } from "../src/types";
import { chatStreamEventSchema } from "../src/lib/chat/events";
import { SSE_CONTENT_TYPE, encodeEvent, toSseStream } from "../src/lib/chat/stream";

const TERMINATOR: ChatStreamEvent = {
  type: "error",
  reason: "unknown",
  notice: "Something went wrong.",
};

/** Reads a stream the way a client does: decode, split into SSE records, parse
 *  each payload. Nothing here knows what the orchestrator emits. */
async function readRecords(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  let text = "";
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  const out: unknown[] = [];
  for (const record of text.split("\n\n")) {
    if (record.trim() === "") continue;
    const lines = record.split("\n").filter((l) => l.startsWith("data: "));
    expect(lines, `record was not one data line: ${JSON.stringify(record)}`).toHaveLength(1);
    out.push(JSON.parse(lines[0].slice(6)));
  }
  return out;
}

/** Validates a record against the **declared schema**, which is the same object
 *  the server builds its own type from — so this check cannot drift from what
 *  the endpoint can emit, and User Story 4 will use this same parser rather than
 *  writing a second one. Replaces a hand-written switch (approach finding 1). */
function assertDeclaredEvent(value: unknown): asserts value is ChatStreamEvent {
  const parsed = chatStreamEventSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `record is not a declared event: ${JSON.stringify(value)}\n${parsed.error.message}`,
    );
  }
}

async function* from(events: ChatStreamEvent[]): AsyncGenerator<ChatStreamEvent> {
  for (const e of events) yield e;
}

describe("AC6 — the response is a sequence of self-describing records", () => {
  it("frames every declared event kind so a client can parse it back", async () => {
    const events: ChatStreamEvent[] = [
      { type: "safety_status", classification: "PARTISAN-TRAP", neutralisedQuestion: "q?" },
      { type: "retrieved_chunks", chunks: [] },
      { type: "streamed_tokens", text: "some words" },
      { type: "notice", kind: "provenance", text: "a notice" },
      { type: "error", reason: "generation", notice: "a failure notice" },
      { type: "audit_log_status", recorded: false },
    ];
    // "Every" is held against the schema, not this list: a kind declared there and
    // missing here fails, so the list cannot quietly fall behind the contract.
    const declared = chatStreamEventSchema.options.map((o) => o.shape.type.value).sort();
    expect([...new Set(events.map((e) => e.type))].sort()).toEqual(declared);
    const records = await readRecords(toSseStream(from(events), TERMINATOR));
    records.forEach(assertDeclaredEvent);
    expect(records).toEqual(events);
    expect((records[0] as ChatStreamEvent).type).toBe("safety_status");
    expect((records[records.length - 1] as ChatStreamEvent).type).toBe("audit_log_status");
  });

  it("keeps a multi-paragraph answer inside one record", async () => {
    // Records are separated by a blank line. Hand-built framing would let a
    // paragraph break split one record into two unparseable halves; the fakes
    // elsewhere emit single-line strings and would never show it.
    const text = "First paragraph.\n\nSecond paragraph.\nA wrapped line.\r\nAnd a return.";
    const records = await readRecords(
      toSseStream(from([{ type: "streamed_tokens", text }]), TERMINATOR),
    );
    expect(records).toHaveLength(1);
    assertDeclaredEvent(records[0]);
    expect(records[0]).toEqual({ type: "streamed_tokens", text });
  });

  it("terminates with a failure record when the source dies mid-stream", async () => {
    async function* dies(): AsyncGenerator<ChatStreamEvent> {
      yield { type: "safety_status", classification: "IN-BOUNDS" };
      throw new Error("orchestrator exploded");
    }
    const records = await readRecords(toSseStream(dies(), TERMINATOR));
    records.forEach(assertDeclaredEvent);
    expect(records).toHaveLength(2);
    expect(records[1]).toEqual(TERMINATOR);
  });
});

describe("the stream is pull-based, and a disconnect stops the work", () => {
  /** A source that records how far it was driven and whether it was unwound. */
  function countingSource(total: number) {
    const state = { produced: 0, unwound: false };
    async function* gen(): AsyncGenerator<ChatStreamEvent> {
      try {
        for (let i = 0; i < total; i += 1) {
          state.produced += 1;
          yield { type: "streamed_tokens", text: `chunk ${i}` };
        }
      } finally {
        state.unwound = true;
      }
    }
    return { state, gen: gen() };
  }

  it("unwinds the source when the reader disconnects", async () => {
    // This is what stops the answering model: cancelling returns the iterator,
    // which unwinds the orchestrator, which aborts the upstream call. Before
    // this, a closed tab left generation running and billing.
    const { state, gen } = countingSource(50);
    const reader = toSseStream(gen, TERMINATOR).getReader();
    await reader.read();
    expect(state.unwound, "not unwound yet — the reader is still connected").toBe(false);
    await reader.cancel();
    expect(state.unwound, "a disconnect must unwind the source").toBe(true);
  });

  it("still delivers every record to a reader that stays", async () => {
    // Backpressure must not cost completeness: the pull loop has to keep asking
    // until the source is done.
    const { state, gen } = countingSource(12);
    const records = await readRecords(toSseStream(gen, TERMINATOR));
    expect(records).toHaveLength(12);
    expect(state.produced).toBe(12);
    records.forEach(assertDeclaredEvent);
  });
});
