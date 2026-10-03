"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  buildRequest,
  canSend,
  endTurn,
  newTurn,
  readChatStream,
  reduceTurn,
  type Turn,
} from "../lib/chat/client";
import { MAX_QUESTION_LENGTH } from "../lib/chat/request";
import {
  PAGE_HEADING,
  QUESTION_LABEL,
  QUESTION_PLACEHOLDER,
  SEND_LABEL,
} from "../lib/copy";
import { Transcript } from "./Transcript";

/**
 * The chat screen: the state of the conversation, and the one path a question
 * takes to the service.
 *
 * All markup is `Transcript`'s; this component owns the turns and the form. The form's
 * `onSubmit` is the single submit path — the button and the Enter key both arrive
 * here — and `canSend` gates it, so no path can send a second question while one is
 * being answered. Each exchange gets one `AbortController`, aborted when the screen
 * unmounts, which is what makes the server stop work for a reader who has left.
 *
 * State is set once per record, with no buffering: the answer reaches the reader as
 * it is generated. `initialTurns` exists for the tests, which render the screen in
 * mid-answer and ended states without a network.
 */
export function ChatScreen({ initialTurns = [] }: { initialTurns?: Turn[] }) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [draft, setDraft] = useState("");
  const nextId = useRef(initialTurns.reduce((max, t) => Math.max(max, t.id), 0) + 1);
  const inFlight = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const ready = canSend(turns);
  const question = draft.trim();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The gate. `turns` here is the rendered state, which is what the button's
    // disabled state is computed from, so the two cannot disagree.
    if (!canSend(turns) || question === "") return;

    const id = nextId.current++;
    const body = buildRequest(turns, question);
    setTurns((all) => [...all, newTurn(id, question)]);
    setDraft("");

    const controller = new AbortController();
    inFlight.current = controller;
    const update = (change: (turn: Turn) => Turn) =>
      setTurns((all) => all.map((turn) => (turn.id === id ? change(turn) : turn)));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok || response.body === null) {
        throw new Error(`the service answered ${response.status}`);
      }
      for await (const record of readChatStream(response.body)) {
        update((turn) => reduceTurn(turn, record));
      }
    } catch {
      // A refused request, a dropped connection, a record that could not be read:
      // `endTurn` below marks the turn incomplete with the screen's own notice.
      // Nothing from the error reaches the reader; it carries no detail they can act on.
    } finally {
      // Not after an abort: the screen is gone and there is no reader to tell.
      if (!controller.signal.aborted) update(endTurn);
      if (inFlight.current === controller) inFlight.current = null;
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter keeps the line break. Routed through the form so the
    // gate in `onSubmit` is the only gate.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-prose flex-col px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold">{PAGE_HEADING}</h1>
      <div className="flex-1">
        <Transcript turns={turns} />
      </div>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="sticky bottom-0 mt-8 flex gap-2 border-t border-neutral-300 bg-background pt-4 dark:border-neutral-700"
      >
        <label htmlFor="question" className="sr-only">
          {QUESTION_LABEL}
        </label>
        <textarea
          id="question"
          name="question"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder={QUESTION_PLACEHOLDER}
          className="min-w-0 flex-1 resize-y rounded border border-neutral-400 bg-background px-3 py-2 dark:border-neutral-600"
        />
        <button
          type="submit"
          disabled={!ready || question === ""}
          className="self-end rounded bg-black px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {SEND_LABEL}
        </button>
      </form>
    </div>
  );
}
