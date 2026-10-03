import type { DocumentKind } from "./ingest/metadata";
import type { TurnNoticeKind } from "./chat/client";

/**
 * The screen's words: every piece of prose the chat screen shows a reader that the
 * server does not send.
 *
 * One declared home, for the same reason `prompts.ts` is one: the avatar notice is
 * the product's first safety rule, and a wording nothing watches is a wording that
 * drifts. `SCREEN_COPY` lists every constant here by name, the README's *Screen
 * copy* section lists the same names, and a test holds the two equal in both
 * directions and requires every export of this module to be in the list — the
 * partition `prompts.ts` already keeps.
 *
 * Kept apart from `prompts.ts` on purpose (design review of `reviews/chat-screen.md`,
 * finding 2, option b): that module imports the quotation grammar, and the screen is
 * the one module the browser bundle carries. Nothing here is a model instruction.
 *
 * Every value is a single-line string, or a record of them keyed by a declared
 * vocabulary, so the suite's "no reader-facing prompt outside prompts.ts" check — which
 * looks for multi-line template literals — reads these as what they are: labels.
 */

/** The notice at the top and the bottom of every page. Wording approved by Thomas,
 *  2026-10-03 (`reviews/chat-screen.md`, Open question 8). */
export const AVATAR_NOTICE =
  "V-Tina is a virtual AI avatar. It is not Governor Kotek, not a person, and not an " +
  "official State of Oregon service. It quotes Oregon's official record; check every " +
  "claim against the sources it links.";

/** Shown from the moment a question is sent until the first record arrives.
 *  Classification alone may take up to 10 seconds (`CLASSIFY_DEADLINE_MS`). */
export const WAITING_NOTICE =
  "Working on it. An answer can take several seconds to begin: the question is " +
  "checked before anything is written.";

/** The label on the waiting line, so it reads as the screen's status and not as the
 *  avatar's first sentence. */
export const WAITING_LABEL = "Please wait";

/** The screen's own notice: the stream ended before its final record, or a record
 *  could not be read. The server's notices arrive with their own text. */
export const CONNECTION_NOTICE =
  "The connection to the service ended before this answer was complete. What is " +
  "shown above may be incomplete.";

/** The heading over each kind of notice. Keyed by the screen's notice vocabulary, so
 *  a new kind without a heading fails the typecheck. */
export const NOTICE_HEADINGS = {
  provenance: "Answer stopped",
  failure: "Answer failed",
  connection: "Connection lost",
} as const satisfies Record<TurnNoticeKind, string>;

/** Visible at the end of the answer text itself when the answer did not complete, so
 *  a dangling half-sentence cannot read as a finished thought. */
export const INCOMPLETE_MARK = "[the answer stopped here]";

/** Introduces the neutral rewording on the partisan path. */
export const REWORDING_LABEL = "Answered as this neutral rewording of the question:";

export const SOURCES_HEADING = "Sources";

/** The toggle that opens one retrieved passage under its document. */
export const PASSAGE_TOGGLE = "Show the passage";

/** How a document's kind reads to a person. Keyed by the ingestion vocabulary. */
export const KIND_LABELS = {
  executive: "Executive order",
  legislative: "Legislation",
} as const satisfies Record<DocumentKind, string>;

export const PAGE_HEADING = "Ask about Oregon's executive record";

export const QUESTION_LABEL = "Your question";

export const ANSWER_LABEL = "V-Tina's answer";

export const QUESTION_PLACEHOLDER = "Ask about housing, homelessness, behavioral health or education in Oregon";

export const SEND_LABEL = "Ask";

/** Every constant above, by name. The README's *Screen copy* section lists the same
 *  names; `__tests__/readme-copy.test.ts` holds the two equal. */
export const SCREEN_COPY = [
  "AVATAR_NOTICE",
  "WAITING_NOTICE",
  "WAITING_LABEL",
  "CONNECTION_NOTICE",
  "NOTICE_HEADINGS",
  "INCOMPLETE_MARK",
  "REWORDING_LABEL",
  "SOURCES_HEADING",
  "PASSAGE_TOGGLE",
  "KIND_LABELS",
  "PAGE_HEADING",
  "QUESTION_LABEL",
  "ANSWER_LABEL",
  "QUESTION_PLACEHOLDER",
  "SEND_LABEL",
] as const;

export type ScreenCopy = (typeof SCREEN_COPY)[number];
