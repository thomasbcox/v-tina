import type { RetrievedPolicyChunk } from "../types";

/**
 * Provenance, decided offline.
 *
 * V-Tina never speaks as Governor Kotek. She speaks as an avatar **of** her: what
 * the record says is quoted with its citation, and everything else is marked as
 * the avatar's own words. That direction is what makes this module possible —
 * "does this prose sound like her" was never decidable, while "is this quoted span
 * verbatim in the document it cites" is a function.
 *
 * **Everything here derives from one grammar, `lex`.** The first version decided
 * "what is a quotation" in three separate places, and they drifted: a fabricated
 * quotation in single quotes streamed to the reader unverified, and an elided quote
 * was accepted against an approved criterion (approach review, round f8eda18,
 * finding 1). The streaming path and every offline check now call the same lexer,
 * so they cannot disagree about where a quotation starts and ends.
 *
 * Everything here is pure. No model, no network, no clock.
 */

/**
 * The frame as a reader sees it: the one wording the answer path injects and every
 * reader-facing notice opens with. `AVATAR_FRAME` derives from it, so the frame a
 * reader is shown is exactly one the screen recognises — an unrecognised one would be
 * injected, go uncounted, and be injected again. It was once typed out separately in
 * the answer path and in two notices, held together only by a containment test
 * (approach review round 8175a2d).
 */
export const DISPLAY_FRAME = "As a virtual avatar of the Governor";

const CANONICAL_FRAME = DISPLAY_FRAME.toLowerCase();

/**
 * How the avatar identifies itself. The **authority** for both the prompt (which
 * requires one of these) and the screen (which looks for one), so the two cannot
 * name different things — the pattern `SAFETY_CLASSIFICATIONS` already sets.
 * Every member names whose avatar this is; a test asserts that, because a frame
 * naming nobody would pass every derived check while telling a reader nothing.
 */
export const AVATAR_FRAME = [
  CANONICAL_FRAME,
  "as a virtual avatar of governor kotek",
  `speaking ${CANONICAL_FRAME}`,
] as const;

/**
 * First person **as the Governor**, as exact phrases. These appear in the corpus as
 * operative text — corpus executive orders open "I, TINA KOTEK, Governor of the State
 * of Oregon" — so they are matched only in the avatar's own prose, never inside a
 * quotation, and quoting them is correct.
 */
export const IMPERSONATION_FORMS = [
  "i, tina kotek",
  "i am the governor",
  "my administration",
  "vested in me",
] as const;

/**
 * Phrases that impersonate **when first person follows them** — "as your Governor
 * … I". Matched with the pronoun rather than verbatim, because `As your Governor —
 * and I say this plainly — I…` contains no listed phrase and escaped exact matching;
 * and not matched alone, because the avatar may describe her ("As Governor of
 * Oregon, Tina Kotek signed…").
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
 * When the avatar should identify itself again: after about this many of its own
 * words. The prompt asks for this, and the answer path **injects** the frame at the
 * first sentence start past it when the model has not.
 *
 * Thomas: "once at the top then repeated every few paragraphs or every roughly
 * 100-200 non-quoted words." This is the middle of that range.
 *
 * **A target, not a ceiling.** The frame is only ever placed at the start of a
 * sentence, never splitting one, so the sentence in progress when the count passes
 * this finishes first — and a single long sentence can carry a stretch well past it.
 * A second, "guaranteed" ceiling of 200 once stood beside this number; nothing
 * enforced it, and a 220-word sentence walked straight through it (approach review
 * round b6039ac). Thomas withdrew the guarantee rather than interrupt sentences.
 */
export const CADENCE_TARGET_WORDS = 150;

/** How far before a quotation to look for its citation. One constant, shared by
 *  the streaming path and every offline check; they previously used 180 and 240. */
export const CITATION_WINDOW = 240;

// ---------------------------------------------------------------------------
// The grammar
// ---------------------------------------------------------------------------

/** Opening and closing curly double marks — the ONLY quotation delimiters. */
const OPEN = "“";
const CLOSE = "”";
/** An opening curly single mark. It can only ever open, so it is never prose. */
const SINGLE_OPEN = "‘";
/** The single marks that double as apostrophes: a delimiter only where a word starts. */
const APOSTROPHES = "'’";

export type Token =
  /** The avatar's own words. */
  | { readonly kind: "prose"; readonly text: string }
  /** A quotation of the record: `text` excludes the outer marks; `raw` includes them. */
  | { readonly kind: "quotation"; readonly text: string; readonly raw: string }
  /** Something presented as quoted that the grammar does not accept. */
  | { readonly kind: "violation"; readonly raw: string; readonly reason: GrammarViolation };

export type GrammarViolation =
  /** A double mark that does not open a quotation: a straight `"`, which cannot be a
   *  delimiter (it is not directional, and passages use it internally, so nesting would
   *  be ambiguous), or a closing `”` with nothing open. */
  | "double-quote-delimiter"
  /** A single mark opening a quotation: `‘` anywhere, or `'`/`’` beginning a word.
   *  Single-quoted fabrications reached the reader three times before this was total. */
  | "single-quote-delimiter"
  /** A quotation that opened and never closed. */
  | "unterminated";

/** A token exactly as it appeared in the text, marks included. */
export function rawOf(token: Token): string {
  return token.kind === "prose" ? token.text : token.raw;
}

export interface LexResult {
  readonly tokens: readonly Token[];
  /** Length of the prefix whose tokenization cannot change with more input. The
   *  streaming path releases exactly this much and holds the rest. */
  readonly stable: number;
  /** How far the scan of the construct left undecided at `stable` had got, when one
   *  was — for the next call on the same text with more appended. */
  readonly resume?: LexResume;
}

/**
 * A scan to pick up where it stopped. A quotation stays undecided until its nesting
 * closes, so it can be long; without this the stream rescanned it from its opening
 * mark for every token, and a 4,000-word quotation still open cost 444 ms.
 */
export interface LexResume {
  /** The open quotation's opening mark. */
  readonly at: number;
  /** The first character its scan has not settled. */
  readonly scanned: number;
  /** Curly nesting depth before `scanned`. */
  readonly depth: number;
}

/**
 * Whether the apostrophe-shaped mark at `i` begins a word — after a space, bracket,
 * colon or dash, and before a letter — or `undefined` while the next character has not
 * arrived. Mid-word (`Oregon's`, `Oregon’s`) it never does, which is why lexing a
 * continuation needs the character before it.
 */
function markBeginsWord(text: string, i: number, lookBehind: string, final: boolean): boolean | undefined {
  const before = i === 0 ? lookBehind : text[i - 1];
  if (!/[\s(\[:—-]/.test(before)) return false;
  const after = text[i + 1];
  if (after === undefined) return final ? false : undefined;
  return /\p{L}/u.test(after);
}

/**
 * The one grammar.
 *
 * - A **quotation** opens with `“` and closes when curly nesting returns to depth
 *   zero. Curly marks are directional, so nesting is trackable — which matters,
 *   because the corpus uses curly marks inside its own text, mostly bills quoting
 *   their defined terms (measured in `reviews/answer-voice-screen.md`). A faithful
 *   quotation reproduces them, and a grammar that closed at the first inner `”`
 *   would refuse it.
 * - Every other mark that could pass for a delimiter is a **violation**, so the
 *   grammar is total over quotation marks rather than letting an unrecognised one
 *   through as prose: a straight `"` anywhere outside a quotation (it is not
 *   directional, so it cannot nest), a closing `”` with nothing open, `‘` anywhere
 *   (it can only open), and `'` or `’` where a word starts. Inside a quotation all of
 *   them are content.
 * - An **apostrophe inside a word** — `Oregon's`, `Oregon’s` — is prose. That is the
 *   only reading `'` and `’` keep, and the next character decides which it is.
 *
 * **Each of these was a bypass first.** Single marks went unrecognised entirely (round
 * f8eda18); a straight `'` was read as an apostrophe when no closing mark followed
 * before the sentence ended, so an unclosed single-quoted fabrication streamed as prose
 * (round 8175a2d); and `”` and `’` were still prose, so a span opened with either
 * reached the reader unverified (round d42bbb0).
 *
 * `final` says no more text is coming, which resolves anything still open.
 *
 * `lookBehind` is the character before `text` when `text` continues earlier input.
 * The streaming path lexes only what it has not yet released, and this is the one
 * piece of earlier input the grammar reads: without it, the `'s` of a word split
 * across two model tokens would look like a quotation opening.
 *
 * `resume` is the previous result's, when `text` is that call's text with more
 * appended. It changes how much is scanned, never what is decided.
 */
export function lex(text: string, final: boolean, lookBehind = " ", resume?: LexResume): LexResult {
  const tokens: Token[] = [];
  let prose = "";
  let i = 0;
  let stable = 0;
  let pending: LexResume | undefined;

  const flushProse = () => {
    if (prose !== "") tokens.push({ kind: "prose", text: prose });
    prose = "";
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === OPEN) {
      const resumed = resume?.at === i ? resume : undefined;
      let depth = resumed?.depth ?? 0;
      let j = resumed?.scanned ?? i;
      for (; j < text.length; j += 1) {
        if (text[j] === OPEN) depth += 1;
        else if (text[j] === CLOSE && --depth === 0) break;
      }
      if (j >= text.length) {
        // Still open.
        if (!final) {
          pending = { at: i, scanned: text.length, depth };
          break;
        }
        flushProse();
        tokens.push({ kind: "violation", raw: text.slice(i), reason: "unterminated" });
        i = text.length;
        stable = i;
        break;
      }
      flushProse();
      tokens.push({ kind: "quotation", text: text.slice(i + 1, j), raw: text.slice(i, j + 1) });
      i = j + 1;
      stable = i;
      continue;
    }

    // The mark table, outside an open quotation. `“` opened one above; everything else
    // that could pass for a delimiter is refused here, and only an apostrophe inside a
    // word is prose. A closing `”` and a curly `’` were read as prose until round
    // d42bbb0, and each opened an unverified quotation the reader saw.
    const beginsWord = APOSTROPHES.includes(ch) ? markBeginsWord(text, i, lookBehind, final) : false;
    if (beginsWord === undefined) break; // the next character decides
    const doubleMark = ch === '"' || ch === CLOSE;
    if (doubleMark || ch === SINGLE_OPEN || beginsWord) {
      flushProse();
      tokens.push({
        kind: "violation",
        raw: ch,
        reason: doubleMark ? "double-quote-delimiter" : "single-quote-delimiter",
      });
      i += 1;
      stable = i;
      continue;
    }

    prose += ch;
    i += 1;
    stable = i;
  }

  flushProse();
  return final ? { tokens, stable: text.length } : { tokens, stable, resume: pending };
}

/** Collapses whitespace so a line-wrapped quotation still matches its passage, and
 *  folds quote-mark glyph style (curly ↔ straight) — a model reproducing `“` as `"`
 *  inside a quotation has not altered a word. Case, digits and every other
 *  character are the record's, and normalising them would let a misquote pass. */
export function normalise(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The avatar's own words — every prose token, joined. */
export function proseOf(text: string): string {
  return lex(text, true)
    .tokens.filter((t): t is Extract<Token, { kind: "prose" }> => t.kind === "prose")
    .map((t) => t.text)
    .join(" ");
}

// ---------------------------------------------------------------------------
// The opening
// ---------------------------------------------------------------------------

export type OpeningVerdict =
  | { kind: "ok" }
  | { kind: "impersonates"; form: string }
  | { kind: "missing-frame" };

/** Judges an opening's own prose — quotations are excluded by the grammar, which
 *  is the whole reason this is safe on an answer that opens by quoting an order. */
export function screenOpening(opening: string): OpeningVerdict {
  const own = normalise(proseOf(opening)).toLowerCase();
  const form = IMPERSONATION_FORMS.find((f) => own.includes(f));
  if (form) return { kind: "impersonates", form };
  for (const anchor of IMPERSONATION_ANCHORS) {
    const at = own.indexOf(anchor);
    if (at === -1) continue;
    const after = own.slice(at + anchor.length, at + anchor.length + ANCHOR_PRONOUN_WINDOW);
    if (FIRST_PERSON.test(after)) return { kind: "impersonates", form: anchor };
  }
  if (!AVATAR_FRAME.some((f) => own.includes(f))) return { kind: "missing-frame" };
  return { kind: "ok" };
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

/**
 * How Oregon documents are cited in prose, by the kind named in their title.
 *
 * Declared rather than guessed. The first version matched a document's bare number,
 * so Ballot Measure 110's key was `110` — and EO 24-02 contains
 * "Springfield/Lane County (110%)", which made an unrelated statistic cite the
 * wrong document. A number is now never matched without its kind.
 */
export const CITATION_KINDS: Readonly<Record<string, readonly string[]>> = {
  EO: ["EO", "Executive Order", "Order"],
  HB: ["HB", "House Bill"],
  SB: ["SB", "Senate Bill"],
  "Ballot Measure": ["Ballot Measure", "Measure"],
};

/** The ways a document can be cited, derived from its own title. */
export function citationAliases(documentTitle: string): string[] {
  const short = (documentTitle.split(":")[0] ?? documentTitle).trim();
  const m = /^(.*?)\s+(\d+(?:-\d+)?)\b/.exec(short);
  if (!m) return [short];
  const [, kind, id] = m;
  const spellings = CITATION_KINDS[kind] ?? [kind];
  return [...new Set([short, ...spellings.map((s) => `${s} ${id}`)])];
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One way of citing one document, compiled. */
interface CitationPattern {
  readonly title: string;
  readonly pattern: RegExp;
}

function citationPatterns(documentTitles: readonly string[]): CitationPattern[] {
  return documentTitles.flatMap((title) =>
    citationAliases(title).map((alias) => ({
      title,
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(alias)}(?![\\p{L}\\p{N}-])`, "giu"),
    })),
  );
}

/** Every document named in the window, nearest the quotation first, each with where its
 *  name ends. */
function citationsIn(context: string, citations: readonly CitationPattern[]): Array<{ title: string; end: number }> {
  const window = context.slice(-CITATION_WINDOW);
  const nearest = new Map<string, number>();
  for (const { title, pattern } of citations) {
    for (const m of window.matchAll(pattern)) {
      const end = (m.index ?? 0) + m[0].length;
      if (end > (nearest.get(title) ?? -1)) nearest.set(title, end);
    }
  }
  return [...nearest].map(([title, end]) => ({ title, end })).sort((x, y) => y.end - x.end);
}

/** Where the avatar's current sentence begins in the window — the documents it names
 *  there are the ones this quotation can be read as attributed to. */
function sentenceStartIn(window: string): number {
  let at = 0;
  for (const m of window.matchAll(/[.!?][)\]\u201D\u2019"']*\s+/g)) at = (m.index ?? 0) + m[0].length;
  return at;
}

function nearestCitation(context: string, citations: readonly CitationPattern[]): string | undefined {
  return citationsIn(context, citations)[0]?.title;
}

/**
 * What a token contributes to the text a later quotation's citation is read from: the
 * avatar's own words, and anything quoted **blanked to spaces of the same length**.
 *
 * **A quotation's text is the record's, and a document the record names is not the
 * avatar's citation.** Found live closing round b6039ac: the model quoted EO 24-02,
 * whose text mentions "EO 23-02", then wrote "The same document states:" and quoted EO
 * 24-02 again, verbatim — and the mention inside the first quotation became the
 * citation, so a faithful answer was refused.
 *
 * **Blanked, not removed.** Removing quoted text was tried first and refused a different
 * live answer: with a long SB 1537 quotation gone from the context, "SB 1537 provides:"
 * came within `CITATION_WINDOW` of "The order also frames the approach, stating that" —
 * which meant EO 23-04 — and became its citation. Keeping quotations' length leaves the
 * window's reach exactly as it was; only what can match inside it changed.
 */
export function citationTextOf(token: Token): string {
  return token.kind === "prose" ? token.text : " ".repeat(token.raw.length);
}

/**
 * The document `context` cites **nearest to its end** — that is, nearest to the
 * quotation that follows it. Word-bounded, so `Measure 110` never matches inside
 * `110%`, and the closest citation wins rather than whichever document happened to
 * be retrieved first. `context` is built with `citationTextOf`.
 */
export function citedDocument(
  context: string,
  documentTitles: readonly string[],
): string | undefined {
  return nearestCitation(context, citationPatterns(documentTitles));
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * One answer's passages, prepared once: each document's record text normalised, and
 * every way of citing it compiled. The first version rebuilt both for every quotation
 * (approach review round b6039ac).
 */
export interface PassageIndex {
  /** Each document's record text — its passages and its title — normalised. */
  readonly byTitle: ReadonlyMap<string, readonly string[]>;
  readonly citations: readonly CitationPattern[];
}

export function indexPassages(chunks: readonly RetrievedPolicyChunk[]): PassageIndex {
  const byTitle = new Map<string, string[]>();
  for (const chunk of chunks) {
    const title = chunk.source.documentTitle;
    let texts = byTitle.get(title);
    if (!texts) {
      // A document's title is record text too: the system hands it to the model
      // alongside the passage (first live run).
      texts = [normalise(title)];
      byTitle.set(title, texts);
    }
    texts.push(normalise(chunk.content));
  }
  return { byTitle, citations: citationPatterns([...byTitle.keys()]) };
}

export interface UnverifiedQuotation {
  readonly text: string;
  readonly citedAs?: string;
  readonly reason:
    | "no-citation"
    | "not-in-cited-document"
    | "not-in-any-passage"
    | "elided"
    | GrammarViolation;
}

/**
 * Verifies **one** quotation against the citation in the text before it.
 *
 * The only verifier — both the streaming path and `verifyQuotations` call it. The
 * earlier second verifier re-derived spans from text and is what mis-extracted
 * every quotation after the first on the live runs.
 *
 * Elision is rejected outright, as AC3 and the prompt both say. The first version
 * split on the ellipsis and checked each segment separately, which accepted a
 * faithful elision against the approved criterion — and could stitch two passages
 * of one document into a single "quotation".
 */
export function verifyQuotedSpan(
  quoted: string,
  context: string,
  passages: PassageIndex,
): UnverifiedQuotation | null {
  const text = normalise(quoted);
  if (text === "") return null;
  if (/\.\.\.|…/.test(text)) return { text, reason: "elided" };

  const inSome = (pool: readonly string[]) => pool.some((p) => p.includes(text));
  const inAny = () => [...passages.byTitle.values()].some(inSome);

  const named = citationsIn(context, passages.citations);
  if (named.length === 0) {
    return inAny() ? { text, reason: "no-citation" } : { text, reason: "not-in-any-passage" };
  }
  /**
   * **When one sentence names several documents, the one that holds the words is the
   * citation.** Nearest-name-wins alone refused a verbatim SB 755 quotation live, because
   * the same sentence ended "…distributed under Ballot Measure 110" (round-4 live
   * verification). Across sentences the nearest name still wins on its own: a document
   * named in an earlier sentence is not what this quotation cites, and accepting it there
   * would let a span be attributed to a document that does not contain it — R2's harm.
   */
  const inSentence = named.filter((c) => c.end > sentenceStartIn(context.slice(-CITATION_WINDOW)));
  const candidates = inSentence.length > 0 ? inSentence : named.slice(0, 1);
  if (candidates.some((c) => inSome(passages.byTitle.get(c.title) ?? []))) return null;
  return {
    text,
    citedAs: named[0].title,
    reason: inAny() ? "not-in-cited-document" : "not-in-any-passage",
  };
}

/** Every quotation problem in a complete answer: grammar violations, and each
 *  quotation verified against the avatar's own words before it. */
export function verifyQuotations(
  answer: string,
  passages: PassageIndex | readonly RetrievedPolicyChunk[],
): UnverifiedQuotation[] {
  const index = "byTitle" in passages ? passages : indexPassages(passages);
  const bad: UnverifiedQuotation[] = [];
  let before = "";
  for (const token of lex(answer, true).tokens) {
    if (token.kind === "violation") {
      bad.push({ text: token.raw, reason: token.reason });
    } else if (token.kind === "quotation") {
      const problem = verifyQuotedSpan(token.text, before, index);
      if (problem) bad.push(problem);
    }
    before += citationTextOf(token);
  }
  return bad;
}

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

// **Every judgement here is made on the text, never on how it arrived.** The first
// streaming version asked whether the text *released so far* ended in whitespace.
// A tokeniser attaches the space to the following word — ` This`, never `This ` — so
// released text never did, and the frame was never injected: one frame, then 411
// unframed words (approach review round b6039ac). Each rule below reads characters
// by position, so any split of the same text into chunks gets the same answer.

/**
 * Words that end in a period without ending the sentence when a capitalised word
 * follows: a title before a name, a place-name prefix. A frame injected after one
 * would split a sentence — "Gov. As a virtual avatar of the Governor, Kotek signed".
 * Single letters ("U.S.", an initial) are excluded by rule rather than listed.
 * Checked against the platform first: `Intl.Segmenter` breaks after all of these.
 */
export const NON_TERMINAL_ABBREVIATIONS = [
  "gov", "sen", "rep", "st", "mt", "dr", "mr", "mrs", "ms", "jr", "sr", "vs",
] as const;

const ENDS_SENTENCE = /(\p{L}*)([.!?])[)\]”’"']*\s+$/u;
const ENDS_PARAGRAPH = /\n[^\S\n]*\n\s*$/;
/** How far back from a capital letter the sentence rule reads. */
const SENTENCE_LOOKBACK = 40;

/** Whether a sentence starts at `at`: a capital letter after a blank line, or after a
 *  sentence-ending mark, any closing marks, and whitespace. Precision over recall — a
 *  start this misses only delays a frame to the next sentence; a false one splits a
 *  sentence. */
export function isSentenceStart(text: string, at: number): boolean {
  if (!/\p{Lu}/u.test(text[at] ?? "")) return false;
  const before = text.slice(Math.max(0, at - SENTENCE_LOOKBACK), at);
  if (ENDS_PARAGRAPH.test(before)) return true;
  const end = ENDS_SENTENCE.exec(before);
  if (!end) return false;
  if (end[2] !== ".") return true;
  const word = end[1].toLowerCase();
  return word.length !== 1 && !(NON_TERMINAL_ABBREVIATIONS as readonly string[]).includes(word);
}

/** A word starts where a non-space character follows a space, read from the text,
 *  so a word split across two tokens is still one word. */
function isWordStart(text: string, at: number): boolean {
  return /\S/.test(text[at] ?? " ") && (at === 0 || /\s/.test(text[at - 1]));
}

const FRAME_SOURCE = AVATAR_FRAME.map((f) => f.split(" ").map(escapeRegex).join("\\s+")).join("|");
/** A frame beginning exactly where matching starts, as a whole phrase. */
const FRAME_OPENS = new RegExp(`(?:${FRAME_SOURCE})(?![\\p{L}\\p{N}])`, "iuy");
/** A frame followed by nothing but punctuation and space to the end of the window. */
const FRAME_ENDS = new RegExp(`(?:${FRAME_SOURCE})[^\\p{L}\\p{N}]*$`, "iu");
const LONGEST_FRAME = Math.max(...AVATAR_FRAME.map((f) => f.length));
/** How far back from a word a just-finished frame can begin, allowing extra space. */
const FRAME_LOOKBACK = LONGEST_FRAME * 2;

/**
 * The furthest any rule here reads before the position it judges: the grammar reads
 * one character, the sentence rule `SENTENCE_LOOKBACK`, the frame check
 * `FRAME_LOOKBACK`. The stream keeps this much released text in front of what it
 * holds and discards the rest, so no judgement changes and no token costs more than
 * the text still held.
 */
export const LOOK_BEHIND_CHARS = Math.max(1, SENTENCE_LOOKBACK, FRAME_LOOKBACK);

/** Whether the sentence starting at `at` opens with the avatar's frame, or — when the
 *  text runs out first and more is coming — whether it still could. */
function opensWithFrame(text: string, at: number, final: boolean): "yes" | "no" | "undecided" {
  FRAME_OPENS.lastIndex = at;
  const found = FRAME_OPENS.exec(text);
  if (found) return final || at + found[0].length < text.length ? "yes" : "undecided";
  if (final) return "no";
  const rest = text.slice(at, at + FRAME_LOOKBACK).replace(/\s+/g, " ").toLowerCase();
  return AVATAR_FRAME.some((f) => f.startsWith(rest)) ? "undecided" : "no";
}

/** The avatar's own words since it last identified itself. */
export interface CadenceState {
  words: number;
}

export type CadenceStop =
  /** The range was walked to its end. */
  | { readonly kind: "end" }
  /** A sentence starts at `at` past the target, and it does not open with the frame. */
  | { readonly kind: "due"; readonly at: number }
  /** A sentence starts at `at` past the target, and the text runs out before it shows
   *  whether it opens with the frame. Only when more text is coming. */
  | { readonly kind: "undecided"; readonly at: number };

/**
 * Walks the avatar's own words in `text[from, to)`, counting in `state`, and stops at
 * the first sentence start where the frame is due.
 *
 * **The one cadence rule.** The stream injects the frame where this stops and
 * `checkCadence` reports where it stops, so the enforcement and its check cannot
 * disagree about where a sentence starts or what a word is. A frame the text carries
 * itself resets the count at the first word after it.
 */
export function scanCadence(
  text: string,
  from: number,
  to: number,
  state: CadenceState,
  final: boolean,
): CadenceStop {
  for (let k = from; k < to; k += 1) {
    if (!isWordStart(text, k)) continue;
    if (FRAME_ENDS.test(text.slice(Math.max(0, k - FRAME_LOOKBACK), k))) state.words = 0;
    if (state.words > CADENCE_TARGET_WORDS && isSentenceStart(text, k)) {
      const opens = opensWithFrame(text, k, final);
      if (opens !== "yes") return { kind: opens === "no" ? "due" : "undecided", at: k };
    }
    state.words += 1;
  }
  return { kind: "end" };
}

/** Walks every prose token of a complete text through `scanCadence`, handing each
 *  due sentence start to `onDue`, which returns the offset to resume from. */
function walkCadence(text: string, onDue: (at: number, state: CadenceState) => number): CadenceState {
  const state: CadenceState = { words: 0 };
  let at = 0;
  for (const token of lex(text, true).tokens) {
    const end = at + rawOf(token).length;
    if (token.kind === "prose") {
      for (let from = at; ; ) {
        const stop = scanCadence(text, from, end, state, true);
        if (stop.kind === "end") break;
        from = onDue(stop.at, state);
      }
    }
    at = end;
  }
  return state;
}

export interface CadenceGap {
  /** The avatar's own words since its last frame, where the next sentence started. */
  readonly words: number;
  /** Where that sentence starts. */
  readonly at: number;
}

/**
 * Every sentence in a complete answer that starts past the target without the frame
 * having been repeated — the places the answer path would have injected it. A single
 * sentence that runs long is not reported: that is the stated limit of a frame that
 * never splits a sentence.
 */
export function checkCadence(answer: string): CadenceGap[] {
  const gaps: CadenceGap[] = [];
  walkCadence(answer, (at, state) => {
    gaps.push({ words: state.words, at });
    state.words = 0; // as if the frame had been injected here
    return at;
  });
  return gaps;
}

/** The cadence count at the end of `text`, which the answer path releases whole — the
 *  screened opening. Nothing is injected inside it, so a due start is counted through. */
export function cadenceAfter(text: string): CadenceState {
  return walkCadence(text, (at, state) => {
    state.words += 1;
    return at + 1;
  });
}
