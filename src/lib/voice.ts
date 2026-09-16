import type { RetrievedPolicyChunk } from "../types";

/**
 * Provenance, decided offline.
 *
 * V-Tina never speaks as Governor Kotek. She speaks as an avatar **of** her: what
 * the record says is quoted with its citation, and everything else is marked as
 * the avatar's own words. That direction is what makes this module possible —
 * "does this prose sound like her" was never decidable, while "is this quoted
 * span verbatim in the document it cites" is a function.
 *
 * Everything here is pure. No model, no network, no clock.
 */

/**
 * How the avatar identifies itself. The **authority** for both the prompt (which
 * requires one of these) and the screen (which looks for one), so the two cannot
 * name different things — the pattern `SAFETY_CLASSIFICATIONS` already sets.
 *
 * Matched case-insensitively on a normalised copy, so ordinary capitalisation
 * and spacing differences do not read as a missing frame.
 */
export const AVATAR_FRAME = [
  "as a virtual avatar of the governor",
  "as a virtual avatar of governor kotek",
  "speaking as a virtual avatar of the governor",
] as const;

/**
 * First person **as the Governor** — the forms the avatar must never write.
 *
 * These appear in the corpus as operative text: two executive orders open
 * "I, TINA KOTEK, Governor of the State of Oregon …". Quoting that is exactly
 * what this story asks for, which is why every check here skips quoted spans
 * before matching. A quotation-blind screen would fire on the answer shape the
 * prompt is written to produce.
 */
export const IMPERSONATION_FORMS = [
  "i, tina kotek",
  "i am the governor",
  "my administration",
  "vested in me",
] as const;

/**
 * Phrases that impersonate **when first person follows them** — "as your
 * Governor … I", "as Governor of Oregon … my".
 *
 * Split from the exact forms because matching the whole phrase verbatim missed
 * the obvious dodge: `As your Governor — and I say this plainly — I…` contains no
 * listed form, normalises away from every one of them, and reaches the reader.
 * Matching the anchor **alone** would be worse the other way, flagging the avatar
 * legitimately describing her ("As Governor of Oregon, Tina Kotek signed…"), so
 * the pronoun is what distinguishes description from impersonation.
 */
export const IMPERSONATION_ANCHORS = [
  "as your governor",
  "as governor of oregon",
  "as the governor of oregon",
  "as oregon's governor",
] as const;

/** How far past an anchor a first-person pronoun still reads as impersonation. */
export const ANCHOR_PRONOUN_WINDOW = 80;

const FIRST_PERSON = /\b(i|i'm|i've|my|me|mine)\b/;

/**
 * The longest run of the avatar's own prose, in words, that may pass without the
 * avatar identifying itself again.
 *
 * Thomas at the step-7 consult: "once at the top then repeated every few
 * paragraphs or every roughly 100-200 non-quoted words." The middle of that range.
 * **Quoted text does not count toward it** — while the reader is being shown the
 * record they are not being shown the avatar's assertions, so the frame is not
 * what is at stake.
 */
export const CADENCE_MAX_UNQUOTED_WORDS = 150;

/** Straight and typographic pairs, in open/close order. */
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["“", "”"],
];

/** Collapses runs of whitespace so a line-wrapped quotation still matches the
 *  passage it came from. Nothing else is altered — case and punctuation are the
 *  record's, and normalising them would let a misquote pass. */
export function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface QuotedSpan {
  /** The quoted text, without its marks. */
  readonly text: string;
  /** Index of the opening mark in the source string. */
  readonly start: number;
  /** Index just past the closing mark. */
  readonly end: number;
}

/**
 * The quoted spans in `text`, outermost first.
 *
 * Marks are paired by scanning, which a **nested** quotation would break: corpus
 * passages contain their own quoted terms (`"unsheltered homelessness"`), so a
 * faithful quotation of one reproduces them. `verifyQuotations` handles that by
 * trying merged spans; extraction stays simple on purpose.
 */
export function quotedSpans(text: string): QuotedSpan[] {
  const spans: QuotedSpan[] = [];
  for (const [open, close] of QUOTE_PAIRS) {
    let i = 0;
    for (;;) {
      const a = text.indexOf(open, i);
      if (a === -1) break;
      const b = text.indexOf(close, a + 1);
      if (b === -1) break;
      spans.push({ text: text.slice(a + 1, b), start: a, end: b + 1 });
      i = b + 1;
    }
  }
  return spans.sort((x, y) => x.start - y.start);
}

/** `text` with every quoted span removed, so the avatar's own prose is what is
 *  left. This is what every check below matches against. */
export function unquoted(text: string): string {
  const spans = quotedSpans(text);
  if (spans.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue; // overlapping (nested) — already removed
    out += text.slice(cursor, s.start) + " ";
    cursor = s.end;
  }
  return out + text.slice(cursor);
}

export type OpeningVerdict =
  | { kind: "ok" }
  | { kind: "impersonates"; form: string }
  | { kind: "missing-frame" };

/**
 * Judges an answer's opening: does it identify the avatar, and does it speak as
 * the Governor?
 *
 * **Quoted text is skipped before matching**, which is the whole reason this is
 * safe to run on an answer that opens by quoting an order.
 */
export function screenOpening(opening: string): OpeningVerdict {
  const own = normalise(unquoted(opening)).toLowerCase();
  const form = IMPERSONATION_FORMS.find((f) => own.includes(f));
  if (form) return { kind: "impersonates", form };
  for (const anchor of IMPERSONATION_ANCHORS) {
    const at = own.indexOf(anchor);
    if (at === -1) continue;
    // The pronoun is what makes it impersonation rather than description, and it
    // may sit past an interposed clause.
    const after = own.slice(at + anchor.length, at + anchor.length + ANCHOR_PRONOUN_WINDOW);
    if (FIRST_PERSON.test(after)) return { kind: "impersonates", form: anchor };
  }
  if (!AVATAR_FRAME.some((f) => own.includes(f))) return { kind: "missing-frame" };
  return { kind: "ok" };
}

export interface UnverifiedQuotation {
  readonly text: string;
  /** The document the answer attributes it to, or undefined if none was found. */
  readonly citedAs?: string;
  readonly reason: "no-citation" | "not-in-cited-document" | "not-in-any-passage";
}

/** The short form of a document title, as an answer would cite it: everything
 *  before the first colon. Derived from the passage's own title rather than a
 *  list, so a new document needs no edit here. */
function shortTitle(documentTitle: string): string {
  return (documentTitle.split(":")[0] ?? documentTitle).trim();
}

/** How far before a quotation to look for its citation. */
const CITATION_WINDOW = 180;

/**
 * Every verifiable text belonging to `documentTitle` — its passages **and its
 * own title**.
 *
 * The title counts because the system hands it to the model alongside the
 * passage, so quoting it is quoting the record. Leaving it out made the verifier
 * refuse a faithful answer on the first live run: the model quoted the document's
 * title, the title is in no passage body, and a correct answer was stopped as a
 * fabrication. That is the false-positive class the design review warned would
 * train its reader to discount findings.
 */
function verifiableTextsOf(
  chunks: readonly RetrievedPolicyChunk[],
  documentTitle: string,
): string[] {
  const own = chunks.filter((c) => c.source.documentTitle === documentTitle);
  return [...own.map((c) => normalise(c.content)), normalise(documentTitle)];
}

/**
 * Reports every quoted span that is not verbatim in a passage **of the document
 * it is attributed to**.
 *
 * Membership over all passages is not enough, and the corpus is why: executive
 * orders quote statutes and bills share boilerplate, so a span can be genuine and
 * still be cited to a document that does not contain it. The reader then follows
 * a citation to a document without those words, and the citation has made the
 * error *more* credible — which is the failure this whole design exists to
 * prevent.
 *
 * Elision is treated as a violation of the quoting contract the prompt states,
 * but each segment is still checked, so the report says which part is wrong
 * rather than condemning the whole span.
 */
export function verifyQuotations(
  answer: string,
  chunks: readonly RetrievedPolicyChunk[],
): UnverifiedQuotation[] {
  const titles = [...new Set(chunks.map((c) => c.source.documentTitle))];
  const allPassages = [
    ...chunks.map((c) => normalise(c.content)),
    ...titles.map((t) => normalise(t)),
  ];
  const bad: UnverifiedQuotation[] = [];
  const spans = quotedSpans(answer);

  for (const [index, span] of spans.entries()) {
    const quoted = normalise(span.text);
    if (quoted === "") continue;

    // Which document does the answer attribute this to? Look backwards from the
    // opening mark for any retrieved document's short title.
    const before = answer.slice(Math.max(0, span.start - CITATION_WINDOW), span.start);
    const citedTitle = titles.find((t) => before.includes(shortTitle(t)));

    // Segments: the quoting contract forbids elision, but a span that elides is
    // reported by the segment that fails rather than in full.
    const segments = quoted
      .split(/\s*(?:\.\.\.|…)\s*/)
      .map((x) => x.trim())
      .filter((x) => x !== "");

    const inSome = (pool: string[]) =>
      segments.every((seg) => pool.some((p) => p.includes(seg)));

    // A nested quotation breaks naive pairing, so try this span merged with the
    // ones that follow before declaring it unverified.
    const merged = (): boolean => {
      for (let j = index + 1; j < Math.min(spans.length, index + 4); j += 1) {
        const wide = normalise(answer.slice(span.start + 1, spans[j].end - 1));
        if (allPassages.some((p) => p.includes(wide))) return true;
      }
      return false;
    };

    if (citedTitle === undefined) {
      if (!inSome(allPassages) && !merged()) {
        bad.push({ text: quoted, reason: "not-in-any-passage" });
      } else {
        bad.push({ text: quoted, reason: "no-citation" });
      }
      continue;
    }
    if (inSome(verifiableTextsOf(chunks, citedTitle))) continue;
    if (merged()) continue;
    bad.push({
      text: quoted,
      citedAs: citedTitle,
      reason: inSome(allPassages) ? "not-in-cited-document" : "not-in-any-passage",
    });
  }
  return bad;
}

export interface CadenceGap {
  /** How many of the avatar's own words ran without a re-identification. */
  readonly words: number;
}

/**
 * Reports runs of the avatar's own prose that pass the declared bound without the
 * avatar identifying itself again.
 *
 * Quoted text is removed first: a reader being shown the record is not being
 * shown the avatar's assertions, so a long quotation is not a long silence about
 * who is speaking.
 */
export function checkCadence(
  answer: string,
  bound: number = CADENCE_MAX_UNQUOTED_WORDS,
): CadenceGap[] {
  const own = normalise(unquoted(answer));
  const lower = own.toLowerCase();
  const gaps: CadenceGap[] = [];

  // Where does the avatar identify itself, in word positions?
  const words = own.split(" ").filter((w) => w !== "");
  const marks: number[] = [];
  for (const frame of AVATAR_FRAME) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(frame, from);
      if (at === -1) break;
      marks.push(lower.slice(0, at).split(/\s+/).filter((w) => w !== "").length);
      from = at + frame.length;
    }
  }
  marks.sort((a, b) => a - b);

  let cursor = 0;
  for (const mark of marks) {
    if (mark - cursor > bound) gaps.push({ words: mark - cursor });
    cursor = mark;
  }
  if (words.length - cursor > bound) gaps.push({ words: words.length - cursor });
  return gaps;
}
