import type { Ref } from "react";
import type { Turn } from "../lib/chat/client";
import {
  ANSWER_LABEL,
  INCOMPLETE_MARK,
  QUESTION_LABEL,
  REWORDING_LABEL,
  WAITING_LABEL,
  WAITING_NOTICE,
} from "../lib/copy";
import { Notice } from "./Notice";
import { Sources } from "./Sources";

/**
 * The conversation so far, one exchange after another. Props in, markup out: the
 * screen's state lives in `ChatScreen`, and every state a test needs is reachable
 * from here with a fabricated list of turns.
 *
 * Within an exchange, in order: the question; the neutral rewording if there was
 * one; the waiting line until the answer's first words; the answer's own words, with a
 * visible mark at their end when they did not complete; any notice, as its own
 * block; the sources.
 */
export function Transcript({ turns, listRef }: { turns: readonly Turn[]; listRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={listRef} className="space-y-8">
      {turns.map((turn, i) => (
        <article key={turn.id} aria-label={`Exchange ${i + 1}`} className="space-y-3">
          <div aria-label={QUESTION_LABEL} className="rounded bg-neutral-100 px-4 py-3 dark:bg-neutral-800">
            <p className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
              {QUESTION_LABEL}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{turn.question}</p>
          </div>

          {turn.neutralisedQuestion !== undefined && (
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              <span className="font-medium">{REWORDING_LABEL}</span> {turn.neutralisedQuestion}
            </p>
          )}

          {turn.status === "waiting" && (
            <p
              role="status"
              aria-label={WAITING_LABEL}
              className="rounded border border-dashed border-neutral-400 px-4 py-2 text-sm italic text-neutral-600 dark:text-neutral-400"
            >
              <span className="font-medium not-italic">{WAITING_LABEL}.</span> {WAITING_NOTICE}
            </p>
          )}

          {turn.answer !== "" && (
            <div aria-label={ANSWER_LABEL} className="px-1">
              <p className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
                {ANSWER_LABEL}
              </p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                {turn.answer}
                {turn.status === "incomplete" && (
                  <span className="ml-1 font-medium text-amber-800 dark:text-amber-300">
                    {INCOMPLETE_MARK}
                  </span>
                )}
              </p>
            </div>
          )}

          {turn.notice && <Notice kind={turn.notice.kind} text={turn.notice.text} />}

          {/* The sources follow the answer; they are not shown before it has begun.
              They can arrive many seconds ahead of its first word. */}
          {(turn.answer !== "" || turn.ended) && <Sources sources={turn.sources} />}
        </article>
      ))}
    </div>
  );
}
