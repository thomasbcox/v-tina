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
 * Serves a sequence of events as an SSE byte stream.
 *
 * **Pull-based on purpose.** The earlier shape ran the whole loop inside
 * `start`, which meant production was never coupled to consumption: a fast model
 * could run to completion while a slow reader was still on the first paragraph,
 * with the remainder piling up in the stream's queue. Here `pull` asks the
 * orchestrator for exactly one event each time the consumer has room, which is
 * what the Web Streams API exists to do (approach review finding 1).
 *
 * **`cancel` is the half that matters most.** A reader who closes the tab now
 * returns the iterator, which unwinds the orchestrator and — because the request
 * signal is threaded through to the answering call — stops the model mid-answer.
 * Before this, a disconnected reader left generation running and billing.
 *
 * The terminator is still guaranteed: a failure anywhere, including in the
 * encoder itself, ends the stream with a failure record rather than silence. A
 * response that simply stops is indistinguishable from a complete one, which is
 * the whole reason the failure event exists.
 */
export function toSseStream(
  events: AsyncIterable<ChatStreamEvent>,
  onTerminationFailure: ChatStreamEvent,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  let finished = false;

  const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    finished = true;
    try {
      controller.close();
    } catch {
      // Already closed by a disconnect. Closing twice is not an error worth
      // propagating out of a finished response.
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      try {
        const next = await iterator.next();
        if (next.done) {
          close(controller);
          return;
        }
        controller.enqueue(encoder.encode(encodeEvent(next.value)));
      } catch {
        // Covers both a source that died and an event the encoder cannot frame.
        try {
          controller.enqueue(encoder.encode(encodeEvent(onTerminationFailure)));
        } catch {
          // The client is gone, or the terminator itself cannot be framed.
          // Nothing left to say.
        }
        close(controller);
      }
    },

    async cancel(reason) {
      finished = true;
      // Unwinds the orchestrator's generators, which is what stops the upstream
      // model call rather than orphaning it.
      await iterator.return?.(reason);
    },
  });
}
