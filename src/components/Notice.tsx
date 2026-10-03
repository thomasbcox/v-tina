import type { TurnNoticeKind } from "../lib/chat/client";
import { NOTICE_HEADINGS } from "../lib/copy";

/**
 * A notice about the answer — the service's voice, never the avatar's — shown as its
 * own block with its own heading, outside the answer's element, so it cannot read as
 * the answer's last paragraph (R2 in `reviews/chat-screen.md`).
 */
export function Notice({ kind, text }: { kind: TurnNoticeKind; text: string }) {
  const heading = NOTICE_HEADINGS[kind];
  return (
    <section
      role="status"
      aria-label={heading}
      className="mt-4 rounded border-l-4 border-amber-600 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-50"
    >
      <h3 className="font-semibold">{heading}</h3>
      <p className="mt-1">{text}</p>
    </section>
  );
}
