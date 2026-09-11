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
  it("serves the standard streaming content type", () => {
    expect(SSE_CONTENT_TYPE).toMatch(/^text\/event-stream/);
  });

  it("frames every declared event kind so a client can parse it back", async () => {
    const events: ChatStreamEvent[] = [
      { type: "safety_status", classification: "PARTISAN-TRAP", neutralisedQuestion: "q?" },
      { type: "retrieved_chunks", chunks: [] },
      { type: "streamed_tokens", text: "some words" },
      { type: "audit_log_status", recorded: false },
    ];
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

  it("terminates even when framing an event is what fails", async () => {
    // A value JSON cannot serialise: the failure is raised by the encoder, not by
    // the source. The 'always terminates' promise must hold on exactly the path
    // it was written for.
    const circular: Record<string, unknown> = { type: "streamed_tokens", text: "x" };
    circular.self = circular;
    const records = await readRecords(
      toSseStream(from([circular as unknown as ChatStreamEvent]), TERMINATOR),
    );
    expect(records).toEqual([TERMINATOR]);
  });

  it("escapes newlines in the payload rather than relying on the caller", () => {
    const encoded = encodeEvent({ type: "streamed_tokens", text: "a\nb" });
    expect(encoded.endsWith("\n\n")).toBe(true);
    expect(encoded.slice(0, -2)).not.toContain("\n");
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

  it("does not run the source to completion ahead of the reader", async () => {
    // The earlier shape looped inside `start`, so a fast model could finish while
    // a slow reader was still on the first paragraph, with the rest piling up in
    // the queue. Reading one record must not drain the whole source.
    const { state, gen } = countingSource(50);
    const reader = toSseStream(gen, TERMINATOR).getReader();
    await reader.read();
    expect(state.produced).toBeLessThan(50);
    await reader.cancel();
  });

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
