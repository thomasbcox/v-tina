import { describe, expect, it } from "vitest";
import type { ChatStreamEvent } from "../src/types";
import { FAILURE_REASONS } from "../src/lib/chat/failure";
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

/** The declared event union, validated from the outside — an unrecognised kind
 *  or a missing field fails, so a record that merely *looks* like JSON is not
 *  enough. */
function assertDeclaredEvent(value: unknown): asserts value is ChatStreamEvent {
  const e = value as Record<string, unknown>;
  switch (e.type) {
    case "safety_status":
      expect(typeof e.classification).toBe("string");
      return;
    case "retrieved_chunks":
      expect(Array.isArray(e.chunks)).toBe(true);
      return;
    case "streamed_tokens":
      expect(typeof e.text).toBe("string");
      return;
    case "audit_log_status":
      expect(typeof e.recorded).toBe("boolean");
      return;
    case "error":
      expect(FAILURE_REASONS).toContain(e.reason);
      expect(typeof e.notice).toBe("string");
      return;
    default:
      throw new Error(`unrecognised event kind: ${JSON.stringify(e.type)}`);
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
