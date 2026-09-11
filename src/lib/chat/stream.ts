import type { ChatStreamEvent } from "../../types";

/**
 * Server-Sent Events framing for the chat stream.
 *
 * Pure framing, no policy: it turns events into bytes and knows nothing about
 * classification, retrieval or answers.
 *
 * **Why SSE and not a bespoke line format.** It is the standard streaming wire
 * format, understood by browser devtools and by intermediaries, and it is the
 * transport the mainstream AI client libraries use — so if User Story 4 later
 * adopts one, the payload shape changes and the transport does not. Chosen at
 * this story's approval stop over newline-delimited JSON and over taking the
 * library as a dependency; the reasoning is in `reviews/chat-safety-routing.md`,
 * Open question 5.
 *
 * Note that reading this from a browser does NOT require `EventSource`: the
 * request is a POST, so a client reads it with `fetch` and a stream reader.
 * `EventSource` being GET-only is a limit of that one client API, not of the
 * wire format.
 */

export const SSE_CONTENT_TYPE = "text/event-stream; charset=utf-8";

/**
 * One event as an SSE record.
 *
 * The payload goes through `JSON.stringify`, never string concatenation. That is
 * not a style preference: a generated answer contains real newlines, and SSE
 * separates records with a blank line — hand-built framing would let a paragraph
 * break split one record into two unparseable ones. `JSON.stringify` escapes
 * them, so the payload is always exactly one line.
 */
export function encodeEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Drains a sequence of events into an SSE byte stream.
 *
 * The terminator is guaranteed: `emit` is wrapped so that a failure anywhere —
 * in the orchestrator, or in the encoder itself — still ends the stream with a
 * failure event before closing. A response that simply stops is indistinguishable
 * from a complete one, which is the whole reason the failure event exists.
 */
export function toSseStream(
  events: AsyncIterable<ChatStreamEvent>,
  onTerminationFailure: ChatStreamEvent,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(encodeEvent(event)));
      try {
        for await (const event of events) send(event);
      } catch {
        // The orchestrator already converts what it can into failure events; this
        // catches what it could not, including a failure raised by `send` itself.
        try {
          send(onTerminationFailure);
        } catch {
          // The client is gone, or the controller is closed. Nothing left to say.
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect. Closing twice is not an error worth
          // propagating out of a finished response.
        }
      }
    },
  });
}
