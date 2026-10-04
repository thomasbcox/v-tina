import type { Ref } from "react";
import type { Turn } from "../lib/chat/client";
import {
  ANSWER_LABEL,
  EXCHANGE_LABEL,
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
 *
 * The question and the answer are labelled regions — `section` elements named by their
 * visible label through `aria-labelledby` — not generic containers with an
 * `aria-label`, which assistive technology does not reliably announce (approach
 * review, round d2e7d11, finding 3). Who is speaking is the product's first rule, and
 * it holds for a reader who cannot see the labels.
 */
export function Transcript({ turns, listRef }: { turns: readonly Turn[]; listRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={listRef} className="space-y-8">
      {turns.map((turn, i) => {
        const questionId = `question-${turn.id}`;
        const answerId = `answer-${turn.id}`;
        // An answer stopped before its first word still gets its region and its mark:
        // the notice says why, the region says that the answer is where it stopped
        // (correctness review, round d2e7d11, finding 5).
        const showAnswer = turn.answer !== "" || turn.status === "incomplete";
        return (
          <article key={turn.id} aria-label={`${EXCHANGE_LABEL} ${i + 1}`} className="space-y-3">
            <section
              aria-labelledby={questionId}
              className="rounded bg-neutral-100 px-4 py-3 dark:bg-neutral-800"
            >
              <p id={questionId} className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
                {QUESTION_LABEL}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{turn.question}</p>
            </section>

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

            {showAnswer && (
              <section aria-labelledby={answerId} className="px-1">
                <p id={answerId} className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
                  {ANSWER_LABEL}
                </p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                  {turn.answer}
                  {turn.status === "incomplete" && (
                    <span className={`font-medium text-amber-800 dark:text-amber-300${turn.answer === "" ? "" : " ml-1"}`}>
                      {INCOMPLETE_MARK}
                    </span>
                  )}
                </p>
              </section>
            )}

            {turn.notice && <Notice kind={turn.notice.kind} text={turn.notice.text} />}

            {/* The sources follow the answer; they are not shown before it has begun.
                They can arrive many seconds ahead of its first word. */}
            {(turn.answer !== "" || turn.ended) && <Sources sources={turn.sources} />}
          </article>
        );
      })}
    </div>
  );
}
