import type { Source } from "../lib/chat/client";
import { KIND_LABELS, PASSAGE_TOGGLE, SOURCES_HEADING } from "../lib/copy";

/**
 * The documents an answer drew on: one entry per document, its title linked to the
 * official original, its as-of date and kind, and every passage retrieved from it,
 * each readable in place behind a toggle. Renders nothing at all — no heading — when
 * there are no sources, so a deferral never suggests that sources failed to load.
 *
 * This list is the response's footer (`reviews/chat-screen.md`, Open question 4).
 */
export function Sources({ sources }: { sources: readonly Source[] }) {
  if (sources.length === 0) return null;
  return (
    <section
      aria-label={SOURCES_HEADING}
      className="mt-4 border-t border-neutral-300 pt-3 text-sm dark:border-neutral-700"
    >
      <h3 className="font-semibold">{SOURCES_HEADING}</h3>
      <ol className="mt-2 space-y-3">
        {sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2"
            >
              {source.documentTitle}
            </a>
            <span className="ml-2 text-neutral-600 dark:text-neutral-400">
              {source.date} · {KIND_LABELS[source.documentKind]}
            </span>
            {source.passages.map((passage, i) => (
              <details key={i} className="mt-1">
                <summary className="cursor-pointer text-neutral-700 dark:text-neutral-300">
                  {PASSAGE_TOGGLE}
                  {source.passages.length > 1 ? ` (${i + 1} of ${source.passages.length})` : ""}
                </summary>
                <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-neutral-300 pl-3 text-neutral-800 dark:border-neutral-600 dark:text-neutral-200">
                  {passage}
                </blockquote>
              </details>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
