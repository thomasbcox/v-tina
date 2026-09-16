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
 * How the avatar identifies itself. The **authority** for both the prompt (which
 * requires one of these) and the screen (which looks for one), so the two cannot
 * name different things — the pattern `SAFETY_CLASSIFICATIONS` already sets.
 * Every member names whose avatar this is; a test asserts that, because a frame
 * naming nobody would pass every derived check while telling a reader nothing.
 */
export const AVATAR_FRAME = [
  "as a virtual avatar of the governor",
  "as a virtual avatar of governor kotek",
  "speaking as a virtual avatar of the governor",
] as const;

/**
 * First person **as the Governor**, as exact phrases. These appear in the corpus as
 * operative text — two executive orders open "I, TINA KOTEK, Governor of the State
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
 */
export const CADENCE_TARGET_WORDS = 150;

/**
 * The ceiling a reader is guaranteed: no run of the avatar's own words longer than
 * this without a re-identification. The top of Thomas's range.
 *
 * **Why two numbers, not one.** The frame is only ever placed at the start of a
 * sentence — never splitting one in half — so enforcement triggers at the target
 * and lands at the next sentence boundary. A single bound made that impossible to
 * satisfy: the first streaming test showed stretches of 151 and 157 words against a
 * bound of 150, because the sentence in progress when the count crossed had to
 * finish first. The gap between target and ceiling is the allowance for that
 * sentence. **Stated limit:** one sentence longer than that gap can still overshoot.
 */
export const CADENCE_MAX_UNQUOTED_WORDS = 200;

/** How far before a quotation to look for its citation. One constant, shared by
 *  the streaming path and every offline check; they previously used 180 and 240. */
export const CITATION_WINDOW = 240;

// ---------------------------------------------------------------------------
// The grammar
// ---------------------------------------------------------------------------

/** Opening and closing curly double marks — the ONLY quotation delimiters. */
const OPEN = "“";
const CLOSE = "”";
/** An opening curly single mark. The corpus contains none, so it is never prose. */
const SINGLE_OPEN = "‘";

export type Token =
  /** The avatar's own words. */
  | { readonly kind: "prose"; readonly text: string }
  /** A quotation of the record: `text` excludes the outer marks; `raw` includes them. */
  | { readonly kind: "quotation"; readonly text: string; readonly raw: string }
  /** Something presented as quoted that the grammar does not accept. */
  | { readonly kind: "violation"; readonly raw: string; readonly reason: GrammarViolation };

export type GrammarViolation =
  /** A straight double quote used as a delimiter. It cannot be one: it is not
   *  directional, and passages use it internally, so nesting would be ambiguous. */
  | "straight-double-delimiter"
  /** A single-quoted span. This is the bypass that let a fabrication through. */
  | "single-quote-delimiter"
  /** A quotation that opened and never closed. */
  | "unterminated";

export interface LexResult {
  readonly tokens: readonly Token[];
  /** Length of the prefix whose tokenization cannot change with more input. The
   *  streaming path releases exactly this much and holds the rest. */
  readonly stable: number;
}

/** A straight apostrophe that could be opening a single-quoted span: at a word
 *  start, followed by a letter. Mid-word (`Oregon's`) it is never a delimiter. */
function singleOpensAt(text: string, i: number): boolean {
  if (text[i] !== "'") return false;
  const before = i === 0 ? " " : text[i - 1];
  const after = text[i + 1];
  return /[\s(\[:—-]/.test(before) && after !== undefined && /\p{L}/u.test(after);
}

/** Does a straight single mark close a span that `open` began, before the sentence
 *  ends? `undefined` means the text ran out before either happened. */
function singleClosesAfter(text: string, open: number): number | null | undefined {
  for (let j = open + 1; j < text.length; j += 1) {
    if (text[j] === "'" && /\p{L}|[.,;:!?]/u.test(text[j - 1] ?? "") && !/\p{L}/u.test(text[j + 1] ?? " ")) {
      return j;
    }
    if (/[.!?]/.test(text[j]) && /\s/.test(text[j + 1] ?? "")) return null;
  }
  return undefined;
}

/**
 * The one grammar.
 *
 * - A **quotation** opens with `“` and closes when curly nesting returns to depth
 *   zero. Curly marks are directional, so nesting is trackable — which matters,
 *   because the corpus uses curly marks inside its own text (710 of them, mostly
 *   bills quoting defined terms). A faithful quotation reproduces them, and a
 *   grammar that closed at the first inner `”` would refuse it.
 * - A **straight double quote** outside a quotation is a violation. Inside one it
 *   is content.
 * - A **single-quoted span** — `‘` anywhere, or a straight `'` at a word start that
 *   closes before the sentence ends — is a violation. `’` alone is always an
 *   apostrophe: the corpus has 286 of them and no opening `‘` at all.
 *
 * `final` says no more text is coming, which resolves anything still open.
 */
export function lex(text: string, final: boolean): LexResult {
  const tokens: Token[] = [];
  let prose = "";
  let i = 0;
  let stable = 0;

  const flushProse = () => {
    if (prose !== "") tokens.push({ kind: "prose", text: prose });
    prose = "";
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === OPEN) {
      let depth = 0;
      let j = i;
      for (; j < text.length; j += 1) {
        if (text[j] === OPEN) depth += 1;
        else if (text[j] === CLOSE && --depth === 0) break;
      }
      if (j >= text.length) {
        // Still open.
        if (!final) break;
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

    if (ch === '"' || ch === SINGLE_OPEN) {
      flushProse();
      tokens.push({
        kind: "violation",
        raw: ch,
        reason: ch === '"' ? "straight-double-delimiter" : "single-quote-delimiter",
      });
      i += 1;
      stable = i;
      continue;
    }

    if (ch === "'" && (i === text.length - 1 ? !final : singleOpensAt(text, i))) {
      if (i === text.length - 1) break; // cannot yet tell what this is
      const close = singleClosesAfter(text, i);
      if (close === undefined && !final) break; // sentence not finished yet
      if (typeof close === "number") {
        flushProse();
        tokens.push({ kind: "violation", raw: text.slice(i, close + 1), reason: "single-quote-delimiter" });
        i = close + 1;
        stable = i;
        continue;
      }
      // It was an apostrophe after all.
    }

    prose += ch;
    i += 1;
    stable = i;
  }

  flushProse();
  return { tokens, stable: final ? text.length : stable };
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

/**
 * The document `context` cites **nearest to its end** — that is, nearest to the
 * quotation that follows it. Word-bounded, so `Measure 110` never matches inside
 * `110%`, and the closest citation wins rather than whichever document happened to
 * be retrieved first.
 */
export function citedDocument(
  context: string,
  documentTitles: readonly string[],
): string | undefined {
  const window = context.slice(-CITATION_WINDOW);
  let best: { title: string; end: number } | undefined;
  for (const title of documentTitles) {
    for (const alias of citationAliases(title)) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(alias)}(?![\\p{L}\\p{N}-])`, "giu");
      for (const m of window.matchAll(re)) {
        const end = (m.index ?? 0) + m[0].length;
        if (!best || end > best.end) best = { title, end };
      }
    }
  }
  return best?.title;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

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
  chunks: readonly RetrievedPolicyChunk[],
): UnverifiedQuotation | null {
  const text = normalise(quoted);
  if (text === "") return null;
  if (/\.\.\.|…/.test(text)) return { text, reason: "elided" };

  const titles = [...new Set(chunks.map((c) => c.source.documentTitle))];
  // A document's title is record text too: the system hands it to the model
  // alongside the passage (first live run).
  const textsOf = (title: string) => [
    ...chunks.filter((c) => c.source.documentTitle === title).map((c) => normalise(c.content)),
    normalise(title),
  ];
  const everywhere = titles.flatMap(textsOf);
  const inSome = (pool: string[]) => pool.some((p) => p.includes(text));

  const cited = citedDocument(context, titles);
  if (cited === undefined) {
    return inSome(everywhere) ? { text, reason: "no-citation" } : { text, reason: "not-in-any-passage" };
  }
  if (inSome(textsOf(cited))) return null;
  return {
    text,
    citedAs: cited,
    reason: inSome(everywhere) ? "not-in-cited-document" : "not-in-any-passage",
  };
}

/** Every quotation problem in a complete answer: grammar violations, and each
 *  quotation verified against the prose that precedes it. */
export function verifyQuotations(
  answer: string,
  chunks: readonly RetrievedPolicyChunk[],
): UnverifiedQuotation[] {
  const bad: UnverifiedQuotation[] = [];
  let before = "";
  for (const token of lex(answer, true).tokens) {
    if (token.kind === "prose") {
      before += token.text;
    } else if (token.kind === "violation") {
      bad.push({ text: token.raw, reason: token.reason });
      before += token.raw;
    } else {
      const problem = verifyQuotedSpan(token.text, before, chunks);
      if (problem) bad.push(problem);
      before += token.raw;
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

export interface CadenceGap {
  readonly words: number;
}

/** Word positions, in the avatar's own prose, at which it identifies itself. */
function framePositions(ownProse: string): number[] {
  const lower = ownProse.toLowerCase();
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
  return marks.sort((a, b) => a - b);
}

/** Reports runs of the avatar's own prose past the bound with no re-identification.
 *  Used by the suite and the stress story; the answer path enforces the same bound
 *  as it streams. */
export function checkCadence(answer: string, bound: number = CADENCE_MAX_UNQUOTED_WORDS): CadenceGap[] {
  const own = normalise(proseOf(answer));
  const total = own.split(" ").filter((w) => w !== "").length;
  const gaps: CadenceGap[] = [];
  let cursor = 0;
  for (const mark of framePositions(own)) {
    if (mark - cursor > bound) gaps.push({ words: mark - cursor });
    cursor = mark;
  }
  if (total - cursor > bound) gaps.push({ words: total - cursor });
  return gaps;
}

/** How many of the avatar's own words `prose` contains after its last frame, or
 *  `undefined` when it contains no frame. The streaming path's cadence counter. */
export function wordsAfterLastFrame(prose: string): number | undefined {
  const own = normalise(prose);
  const marks = framePositions(own);
  if (marks.length === 0) return undefined;
  const total = own.split(" ").filter((w) => w !== "").length;
  return total - marks[marks.length - 1];
}
