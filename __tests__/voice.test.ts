import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RetrievedPolicyChunk } from "../src/types";
import {
  APOSTROPHES,
  AVATAR_FRAME,
  CADENCE_TARGET_WORDS,
  CITATION_KINDS,
  IMPERSONATION_FORMS,
  LOOK_BEHIND_CHARS,
  NAMED_QUOTE_MARKS,
  checkCadence,
  citationAliases,
  isSentenceStart,
  lex,
  proseOf,
  rawOf,
  screenOpening,
  verifyQuotations,
  type LexResume,
  type Token,
} from "../src/lib/voice";

const O = "“"; // “
const C = "”"; // ”
const q = (s: string) => `${O}${s}${C}`;

function chunk(title: string, content: string, n = 0): RetrievedPolicyChunk {
  return {
    id: `${title}-${n}`,
    content,
    chunkIndex: n,
    source: {
      documentTitle: title,
      date: "2023-01-10",
      url: "https://www.oregon.gov/gov/eo/x.pdf",
      pillar: "housing-and-homelessness",
      documentKind: "executive",
    },
    similarity: 0.8,
  };
}

// Shaped on the real corpus: an order speaks in the Governor's first person; a bill
// uses curly marks around its own defined terms; a nearby order carries "(110%)".
const EO = "EO 23-02: Declaring State of Emergency";
const SB = "SB 1537 (2024): An Act relating to housing";
const BM = "Ballot Measure 110 (2020): Drug Addiction Treatment and Recovery Act";
const EO_TEXT =
  "NOW, THEREFORE, I, TINA KOTEK, Governor of the State of Oregon, do hereby order that the State " +
  "address unsheltered homelessness as an emergency.";
const SB_TEXT =
  `As used in this section, ${q("Deflection program")} means a collaborative program that ` +
  "diverts a person from prosecution.";
const SB_TEXT_2 = "The Department shall provide capacity and support for infrastructure planning.";
const BM_TEXT = "The purpose of this Act is to make treatment available to all those who need it.";
const PASSAGES = [chunk(EO, EO_TEXT), chunk(SB, SB_TEXT, 1), chunk(SB, SB_TEXT_2, 2), chunk(BM, BM_TEXT, 3)];

describe("the one grammar", () => {
  it("reads a curly-marked quotation as a quotation and everything else as prose", () => {
    const { tokens } = lex(`Before ${q("inside words")} after.`, true);
    expect(tokens.map((t) => t.kind)).toEqual(["prose", "quotation", "prose"]);
    expect(tokens[1]).toMatchObject({ kind: "quotation", text: "inside words" });
  });

  it("tracks curly nesting, so a quoted defined term does not end the quotation", () => {
    // Bills in this corpus put curly marks around their own defined terms. A grammar
    // that closed at the first inner mark would refuse a faithful quotation of exactly
    // that text.
    const { tokens } = lex(`It says ${q(`${q("Deflection program")} means a collaborative program`)}.`, true);
    const quotes = tokens.filter((t) => t.kind === "quotation");
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ text: `${q("Deflection program")} means a collaborative program` });
  });

  // Every character Unicode itself classes as a quotation mark — the initial and final
  // quotation categories and its Quotation_Mark property — computed rather than typed. The
  // requirement is all of them, so the test states the Unicode sources itself instead of
  // reading them from the screen, where dropping one would shrink the test along with it.
  const UNICODE_QUOTATION_MARKS: string[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // surrogates are not characters
    const ch = String.fromCodePoint(cp);
    if (/[\p{Pi}\p{Pf}\p{Quotation_Mark}]/u.test(ch)) UNICODE_QUOTATION_MARKS.push(ch);
  }
  // What the screen must refuse outside a quotation: its own declared list, iterated rather than
  // copied, and every Unicode quotation mark — except `“`, which opens the one quotation accepted.
  const REFUSED_MARKS = [...new Set([...NAMED_QUOTE_MARKS, ...UNICODE_QUOTATION_MARKS])].filter((m) => m !== O);

  it("refuses every mark that could pass for a delimiter but does not open a quotation", () => {
    // The grammar is total over quotation marks: an unrecognised one is refused, never let
    // through as prose. Iterating the declared list itself means a mark added to it is
    // covered with no new case written — the copy this replaced covered only the marks
    // someone had remembered to type (approach review round 3b101a0).
    expect(UNICODE_QUOTATION_MARKS.length, "the Unicode scan found nothing, so it checks nothing").toBeGreaterThan(0);
    for (const mark of REFUSED_MARKS) {
      const text = `Under EO 23-02: ${mark}a 13% rise in unsheltered homelessness.`;
      const { tokens } = lex(text, true);
      expect(
        tokens.some((t) => t.kind === "violation" && t.reason === "quote-mark-delimiter"),
        `must refuse a span opened with ${mark}`,
      ).toBe(true);
    }
    // Standing alone, where no word starts: refused all the same, except an apostrophe,
    // which is refused only where a word begins.
    for (const mark of REFUSED_MARKS.filter((m) => !APOSTROPHES.includes(m))) {
      expect(
        lex(`It ends ${mark} here.`, true).tokens.some((t) => t.kind === "violation"),
        `must refuse a stray ${mark}`,
      ).toBe(true);
    }
    // Inside a quotation every one of them is the record's own content — all but `”`,
    // which is what closes it.
    for (const mark of REFUSED_MARKS.filter((m) => m !== C)) {
      expect(
        lex(`It says ${O}the ${mark}term${mark} here${C}.`, true).tokens.map((t) => t.kind),
        `${mark} inside a quotation is content`,
      ).toEqual(["prose", "quotation", "prose"]);
    }
  });

  it("still refuses every mark this story closed by name before the list existed", () => {
    // Iterating the list covers a mark ADDED to it; this covers one REMOVED from it. Each of
    // these was closed by a round of its own — `”` and `’` were prose until round d42bbb0,
    // and `«…»`, backticks, `‹…›` and `❝…❞` each streamed a fabricated figure until round
    // 0e685ed. A closed, dated set: it does not grow when the list does.
    for (const mark of [`"`, "'", "‘", "’", "”", "«", "»", "`", "‹", "›", "❝", "❞"]) {
      expect(
        lex(`Under EO 23-02: ${mark}a 13% rise in unsheltered homelessness.`, true).tokens.some(
          (t) => t.kind === "violation" && t.reason === "quote-mark-delimiter",
        ),
        `must still refuse ${mark}`,
      ).toBe(true);
    }
  });

  it("refuses a single-quoted span, closed or not — the bypasses that let a fabrication through", () => {
    for (const text of [
      "Under EO 23-02: 'a 13% rise in unsheltered homelessness'. Done.",
      "Under EO 23-02: ‘a 13% rise in unsheltered homelessness’. Done.",
      // Never closed: once read as an apostrophe after all, and released as prose
      // (approach review round 8175a2d).
      "Under EO 23-02: 'a 13% rise in unsheltered homelessness",
      "Under EO 23-02: 'a 13% rise in unsheltered homelessness. That is the position.",
    ]) {
      const { tokens } = lex(text, true);
      expect(
        tokens.some((t) => t.kind === "violation" && t.reason === "quote-mark-delimiter"),
        `must refuse: ${text}`,
      ).toBe(true);
    }
  });

  it("keeps an apostrophe inside a word as prose, and refuses one that starts a word, either glyph", () => {
    for (const text of ["It runs ’til the plan is done.", "It runs 'til the plan is done."]) {
      expect(lex(text, true).tokens.some((t) => t.kind === "violation" && t.reason === "quote-mark-delimiter"), text).toBe(true);
    }
    for (const text of ["Oregon’s order and the agencies’ work.", "Oregon's order and the agencies' work.", "It is the ’90s policy."]) {
      expect(lex(text, true).tokens.every((t) => t.kind === "prose"), text).toBe(true);
    }
  });

  it("keeps apostrophes as prose, straight or curly", () => {
    // The corpus uses ’ as an apostrophe and never opens a quotation with ‘, so a
    // single-quote delimiter is detected by its opener, never inferred from ’.
    for (const text of [
      "Oregon's order and the parents' rights.",
      "Oregon’s order and the parents’ rights.",
      "It's the '90s policy, isn't it.",
    ]) {
      const { tokens } = lex(text, true);
      expect(tokens.every((t) => t.kind === "prose"), `apostrophes misread: ${text}`).toBe(true);
    }
  });

  it("holds an unfinished quotation rather than releasing it, and refuses it at the end", () => {
    const text = `Before ${O}still going`;
    expect(lex(text, false).stable, "nothing past the opening mark is stable").toBe("Before ".length);
    const final = lex(text, true).tokens;
    expect(final.some((t) => t.kind === "violation" && t.reason === "unterminated")).toBe(true);
  });

  it("lexing only the unreleased rest, with one character of look-behind, agrees with lexing the whole", () => {
    // The stream relies on this: it lexes only what it has not released. Every place
    // the whole-text lexer could have stopped releasing is tried as a restart point.
    const text =
      `The Governor's staff and the agencies' work: ${q(`the ${q("Deflection program")} means it`)}. ` +
      "Oregon's plan isn't 'new'. Under the order, local teams act.";
    const merged = (tokens: readonly Token[]) =>
      tokens.reduce<Array<[string, string]>>((out, t) => {
        const last = out[out.length - 1];
        if (t.kind === "prose" && last?.[0] === "prose") last[1] += t.text;
        else out.push([t.kind, rawOf(t)]);
        return out;
      }, []);
    const whole = lex(text, true).tokens;
    let at = 0;
    const restarts: number[] = [];
    for (const t of whole) {
      const end = at + rawOf(t).length;
      if (t.kind === "prose") for (let k = at; k < end; k += 1) restarts.push(k);
      restarts.push(end);
      at = end;
    }
    for (const k of restarts) {
      const tail: Token[] = [];
      let offset = 0;
      for (const t of whole) {
        const end = offset + rawOf(t).length;
        if (end > k) tail.push(t.kind === "prose" ? { kind: "prose", text: t.text.slice(Math.max(0, k - offset)) } : t);
        offset = end;
      }
      expect(merged(lex(text.slice(k), true, text[k - 1] ?? " ").tokens), `restart at ${k}`).toEqual(merged(tail));
    }
  });

  it("resuming a scan decides exactly what scanning afresh decides, at every length", () => {
    // The stream hands each result's `resume` to the next call on the same text plus
    // more, so a held quotation is not rescanned for every token. Resuming may change
    // how much is read, never what is decided.
    const texts = [
      `Before ${q(`a long ${q("nested")} quotation that runs on`)} after.`,
      "It runs 'til the plan is done. Then more follows.",
      "It runs 'til the Governor's plan is done. Then more follows.",
      "It is 'quoted' here. And 'til the end",
      `Open ${O}never closed at all`,
    ];
    for (const text of texts) {
      let resume: LexResume | undefined;
      for (let n = 0; n <= text.length; n += 1) {
        const resumed = lex(text.slice(0, n), false, " ", resume);
        expect(resumed, `${JSON.stringify(text)} at length ${n}`).toEqual(lex(text.slice(0, n), false));
        resume = resumed.resume;
      }
    }
  });

  it("a straight mark at a word start is decided by the character after it, and nothing later", () => {
    // No sentence-long wait for a closing mark: the next character settles it.
    expect(lex("It runs '", false).stable, "held only until one more character arrives").toBe("It runs ".length);
    expect(lex("It runs 't", false).tokens).toContainEqual({ kind: "violation", raw: "'", reason: "quote-mark-delimiter" });
    expect(lex("It runs '", true).tokens.every((t) => t.kind === "prose"), "nothing follows it, so nothing is quoted").toBe(true);
    const midWord = lex("the Governor'", false);
    expect(midWord.stable, "mid-word it is never held").toBe("the Governor'".length);
    expect(midWord.tokens.every((t) => t.kind === "prose")).toBe(true);
  });

  it("without the look-behind, a word split across tokens would read as a quotation", () => {
    // The case the look-behind exists for: "Governor" released, "'s staff … agencies' work" held.
    const rest = "'s staff and the agencies' work.";
    expect(lex(rest, true, "r").tokens.every((t) => t.kind === "prose")).toBe(true);
    expect(lex(rest, true).tokens.some((t) => t.kind === "violation"), "the default look-behind is a space").toBe(true);
    expect(LOOK_BEHIND_CHARS).toBeGreaterThanOrEqual(1);
  });

  it("the avatar's own prose excludes every quotation", () => {
    expect(proseOf(`Frame here ${q("quoted bit")} and more.`).replace(/\s+/g, " ").trim()).toBe(
      "Frame here and more.",
    );
  });
});

describe("the declared constants must mean something, not merely exist", () => {
  it("every avatar frame names whose avatar this is", () => {
    for (const frame of AVATAR_FRAME) {
      expect(frame).toMatch(/governor|kotek/);
      expect(frame).toMatch(/avatar/);
    }
  });

  it("every impersonation form is first person", () => {
    for (const form of IMPERSONATION_FORMS) expect(form).toMatch(/\b(i|my|me)\b/);
  });

  it("the cadence target is inside the range Thomas set", () => {
    expect(CADENCE_TARGET_WORDS).toBeGreaterThanOrEqual(100);
    expect(CADENCE_TARGET_WORDS).toBeLessThanOrEqual(200);
  });

  it("the README states the target the code uses, and promises no ceiling", () => {
    // It once promised "no reader meets more than 200" words unframed, which nothing
    // enforced; Thomas withdrew that guarantee (approach review round b6039ac).
    const row = readFileSync("README.md", "utf8").split("\n").find((line) => line.startsWith("| **Say who is speaking**"));
    expect(row, "the README's cadence rule").toBeDefined();
    expect(row).toContain(`**${CADENCE_TARGET_WORDS}**`);
    expect(row).toMatch(/no hard ceiling/);
    expect(row).not.toMatch(/no reader meets more than/i);
  });
});

describe("AC1 — the avatar identifies itself", () => {
  it("accepts an opening carrying any declared frame", () => {
    for (const frame of AVATAR_FRAME) {
      expect(screenOpening(`${frame}, the order requires a target.`)).toEqual({ kind: "ok" });
    }
  });

  it("reports an opening with no frame", () => {
    expect(screenOpening("The order requires a target.")).toEqual({ kind: "missing-frame" });
  });
});

describe("AC7 — impersonation is caught, but quoting the record is not", () => {
  it("catches every declared form in real shapes", () => {
    for (const form of IMPERSONATION_FORMS) {
      for (const shape of [`${form} think so.`, `   ${form} think so.`, `**${form}** think so.`,
        `${form.toUpperCase()} think so.`, `Housing matters. ${form} have said so.`]) {
        expect(screenOpening(shape).kind, shape).toBe("impersonates");
      }
    }
  });

  it("catches an anchor with a clause interposed before the first person", () => {
    for (const shape of ["As your Governor — and I say this plainly — I want to be clear.",
      "As Governor of Oregon, having considered the record, my view is this."]) {
      expect(screenOpening(shape).kind, shape).toBe("impersonates");
    }
  });

  it("does not flag the avatar describing her in the third person", () => {
    expect(screenOpening(`${AVATAR_FRAME[0]}, as Governor of Oregon, Tina Kotek signed it.`)).toEqual({ kind: "ok" });
  });

  it("does NOT flag the record's own first person inside a quotation", () => {
    const opening = `${AVATAR_FRAME[0]}, EO 23-02 states: ${q("I, TINA KOTEK, Governor of the State of Oregon, do hereby order")}.`;
    expect(screenOpening(opening)).toEqual({ kind: "ok" });
  });
});

describe("citations are declared per kind, word-bounded, nearest wins", () => {
  it("derives every spelling of a citation from the document's own title", () => {
    expect(citationAliases(EO)).toEqual(expect.arrayContaining(["EO 23-02", "Executive Order 23-02"]));
    expect(citationAliases(SB)).toEqual(expect.arrayContaining(["SB 1537", "Senate Bill 1537"]));
    expect(citationAliases(BM)).toEqual(expect.arrayContaining(["Ballot Measure 110", "Measure 110"]));
    for (const kind of Object.keys(CITATION_KINDS)) expect(CITATION_KINDS[kind].length).toBeGreaterThan(0);
  });

  // These read the live verifier rather than a helper of their own: the nearest-name
  // helper they used to call had no production caller left after the same-sentence rule,
  // so it could have drifted from what a reader actually gets (approach round 0e685ed).
  const EO_SPAN = "do hereby order that the State address";

  it("never lets a bare number cite a document", () => {
    // EO 24-02 contains "Springfield/Lane County (110%)". Matching Ballot Measure
    // 110's bare number made that statistic cite the wrong document.
    expect(verifyQuotations(`Springfield/Lane County (110%) saw growth: ${q(EO_SPAN)}.`, PASSAGES).map((b) => b.reason))
      .toEqual(["no-citation"]);
    expect(verifyQuotations(`In 2024 the state acted: ${q(EO_SPAN)}.`, PASSAGES).map((b) => b.reason))
      .toEqual(["no-citation"]);
  });

  it("recognises a reader's spelling as well as the metadata's", () => {
    for (const ctx of ["Under EO 23-02: ", "Executive Order 23-02 states: ", "Order 23-02 says: "]) {
      expect(verifyQuotations(`${ctx}${q(EO_SPAN)}.`, PASSAGES), ctx).toEqual([]);
    }
  });

  it("reads the citation from the quotation's own sentence, not from whichever document was retrieved first", () => {
    // Both named in one sentence: the one holding the words is the citation.
    expect(verifyQuotations(`Unlike EO 23-02, Senate Bill 1537 provides: ${q(EO_SPAN)}.`, PASSAGES)).toEqual([]);
    // Named in an earlier sentence instead: this sentence cites SB 1537, which does not
    // hold the words, so it is a misattribution rather than an uncited quotation.
    expect(verifyQuotations(`EO 23-02 declared it. Senate Bill 1537 provides: ${q(EO_SPAN)}.`, PASSAGES).map((b) => b.reason))
      .toEqual(["not-in-cited-document"]);
  });
});

describe("AC3 — a quotation must be verbatim in the document it cites", () => {
  it("accepts a faithful quotation attributed to the right document", () => {
    expect(verifyQuotations(`Under ${EO}: ${q("do hereby order that the State address")}.`, PASSAGES)).toEqual([]);
  });

  it("accepts a faithful quotation of a bill's own defined term, curly marks and all", () => {
    const answer = `SB 1537 provides: ${q(`${q("Deflection program")} means a collaborative program`)}.`;
    expect(verifyQuotations(answer, PASSAGES)).toEqual([]);
  });

  it("rejects a span altered by one word", () => {
    expect(verifyQuotations(`Under ${EO}: ${q("do hereby demand that the State address")}.`, PASSAGES)).toHaveLength(1);
  });

  it("rejects a span that is real but cited to the wrong document", () => {
    const bad = verifyQuotations(`Under ${SB}: ${q("do hereby order that the State address")}.`, PASSAGES);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ reason: "not-in-cited-document", citedAs: SB });
  });

  it("rejects a span in no passage at all", () => {
    expect(verifyQuotations(`Under ${EO}: ${q("a 13% rise in unsheltered homelessness")}.`, PASSAGES)[0].reason)
      .toBe("not-in-any-passage");
  });

  it("rejects an elided quotation, as the approved criterion says", () => {
    // The first version split on the ellipsis and passed each segment, accepting a
    // faithful elision against AC3 — and letting two passages of one document be
    // stitched into a single "quotation".
    const faithful = `Under ${EO}: ${q("NOW, THEREFORE … do hereby order")}.`;
    expect(verifyQuotations(faithful, PASSAGES)[0].reason).toBe("elided");
    const stitched = `SB 1537 provides: ${q("diverts a person from prosecution. … The Department shall provide capacity")}.`;
    expect(verifyQuotations(stitched, PASSAGES)[0].reason).toBe("elided");
  });

  it("rejects a span stitched across two passages even without an ellipsis", () => {
    const stitched = `SB 1537 provides: ${q("diverts a person from prosecution. The Department shall provide")}.`;
    expect(verifyQuotations(stitched, PASSAGES)).toHaveLength(1);
  });

  it("refuses any quotation not in curly marks", () => {
    expect(verifyQuotations(`Under ${EO}: "do hereby order that the State address".`, PASSAGES)[0].reason)
      .toBe("quote-mark-delimiter");
    expect(verifyQuotations(`Under ${EO}: 'a 13% rise in unsheltered homelessness'. Done.`, PASSAGES)[0].reason)
      .toBe("quote-mark-delimiter");
  });

  it("reads the citation from the avatar's own words, never from inside a quotation", () => {
    // The live refusal, on the real corpus text: EO 24-02 mentions EO 23-02, and that
    // mention inside the first quotation became the citation for the second.
    const eo2402 = "EO 24-02: Merge and Extend Executive Order 23-02 and Executive Order 23-09";
    const eo2302 = "EO 23-02: Declaring State of Emergency Due to Homelessness";
    const passages = [
      chunk(eo2402, readFileSync("corpus/eo-24-02.md", "utf8")),
      chunk(eo2302, readFileSync("corpus/eo-23-02.md", "utf8"), 1),
    ];
    const answer =
      `Executive Order 24-02 continues that response. It states: ${q(
        "before the emergency response by way of EO 23-02 was implemented.",
      )} The same document states: ${q("About 62% of those experiencing homelessness were unsheltered;")}`;
    expect(verifyQuotations(answer, passages)).toEqual([]);
  });

  it("when one sentence names two documents, the one holding the words is the citation", () => {
    // The live refusal: a verbatim SB 755 quotation, in a sentence that ended
    // "…distributed under Ballot Measure 110" (round-4 live verification).
    const sb755 = "SB 755 (2021): An Act relating to substance use (Oregon Laws 2021, chapter 591)";
    const m110 = "Ballot Measure 110 (2020): Drug Addiction Treatment and Recovery Act (Oregon Laws 2021, chapter 2)";
    const passages = [
      chunk(sb755, readFileSync("corpus/sb-755.md", "utf8")),
      chunk(m110, readFileSync("corpus/measure-110.md", "utf8"), 1),
    ];
    // Verbatim in SB 755 and in no other corpus document.
    const quoted = "to the maximum extent consistent with law";
    const sameSentence =
      `SB 755 (2021) addresses funding for these services, stating that moneys distributed under Ballot Measure 110 ` +
      `shall be spent ${q(quoted)}`;
    expect(verifyQuotations(sameSentence, passages), "the sentence names the document that holds the words").toEqual([]);

    // Across sentences the nearest name still wins on its own: a document named in an
    // earlier sentence is not what this quotation cites.
    const earlierSentence = `SB 755 (2021) governs the fund. Ballot Measure 110 (2020) states: ${q(quoted)}`;
    expect(verifyQuotations(earlierSentence, passages).map((b) => b.reason)).toEqual(["not-in-cited-document"]);
  });

  it("a long quotation still keeps an earlier citation out of reach, as it always did", () => {
    // Removing quoted text from the context, the first attempt at the fix above, let
    // "SB 1537 provides:" reach past a 355-character quotation and cite the next one —
    // which the avatar attributed to "the order", EO 23-04 — and a verbatim answer was
    // refused live. That quotation is uncited, not misattributed.
    const sb = "SB 1537 (2024): An Act relating to housing (Oregon Laws 2024, chapter 110)";
    const eo = "EO 23-04: Establishing a Statewide Housing Production Goal and Housing Production Advisory Council";
    const passages = [
      chunk(sb, readFileSync("corpus/sb-1537.md", "utf8")),
      chunk(eo, readFileSync("corpus/eo-23-04.md", "utf8"), 1),
    ];
    const answer =
      `On the legislative side, SB 1537 provides: ${q(
        "The Oregon Business Development Department shall provide capacity and support for infrastructure " +
          "planning to municipalities to enable them to plan and finance infrastructure for water, sewers and " +
          "sanitation, stormwater and transportation consistent with opportunities to produce housing units at " +
          "densities defined in section 55 (3)(a)(C) of this 2024 Act.",
      )} The order also frames the approach, stating that ${q(
        "expanding housing opportunities and solving the affordable housing crisis will require a new level of " +
          "innovation and cooperation between the public, private, and non-profit sectors;",
      )}`;
    expect(verifyQuotations(answer, passages).map((b) => b.reason)).toEqual(["no-citation"]);
  });

  it("treats the document's own title as record text", () => {
    expect(verifyQuotations(`Under ${EO}, it is titled ${q("Declaring State of Emergency")}.`, PASSAGES)).toEqual([]);
  });

  it("normalises line wrapping and quote-mark glyphs, but never case", () => {
    expect(verifyQuotations(`Under ${EO}: ${q("do hereby order\n   that the State address")}.`, PASSAGES)).toEqual([]);
    expect(verifyQuotations(`Under ${EO}: ${q("DO HEREBY ORDER THAT THE STATE ADDRESS")}.`, PASSAGES)).toHaveLength(1);
  });
});

describe("AC6 — the cadence rule (the runtime enforcement is in answer-screen.test.ts)", () => {
  const frame = `${AVATAR_FRAME[0][0].toUpperCase()}${AVATAR_FRAME[0].slice(1)}`;
  /** `n` sentences of exactly ten words, each starting with a capital. */
  const sentences = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => `Record ${from + i} shows the state acted on housing this year.`).join(" ");
  /** The opening: the frame, then four words of the avatar's own. */
  const opening = `${frame}, here is the record.`;

  it("accepts an answer whose own words stay within the target", () => {
    expect(checkCadence(`${opening} ${sentences(14)}`)).toEqual([]);
  });

  it("reports a sentence that starts past the target without the frame repeated", () => {
    // 4 + 150 own words, then a sentence start: the frame was due there.
    const answer = `${opening} ${sentences(15)} The order followed.`;
    const gaps = checkCadence(answer);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].words).toBe(154);
    expect(answer.slice(gaps[0].at)).toBe("The order followed.");
  });

  it("accepts the frame repeated at that sentence start, however it is spaced or cased", () => {
    for (const again of [`${frame}, the order followed.`, "AS A VIRTUAL\n  avatar of the governor, the order followed."]) {
      expect(checkCadence(`${opening} ${sentences(15)} ${again} ${sentences(14, 100)}`), again).toEqual([]);
    }
  });

  it("does not count quoted text", () => {
    const quoted = q(Array.from({ length: CADENCE_TARGET_WORDS * 2 }, (_, i) => `clause${i}`).join(" "));
    expect(checkCadence(`${opening} The order says: ${quoted}. That is the record. It stands.`)).toEqual([]);
  });

  it("the stated limit: one long sentence runs past the target, and the frame is due at the next", () => {
    const long = `It ${Array.from({ length: 220 }, (_, i) => `clause${i}`).join(" ")} ends here.`;
    const gaps = checkCadence(`${opening} ${long} The next sentence starts.`);
    expect(gaps, "not reported inside the long sentence, only where the next begins").toHaveLength(1);
    expect(gaps[0].words).toBeGreaterThan(220);
  });

  it("finds sentence starts after marks, closing quotes and paragraph breaks", () => {
    for (const [before, after] of [
      ["It ends. ", "The next"],
      [`It says ${q("build more.")} `, "Then it"],
      ["Is it done? ", "Yes"],
      ["It rose (see HB 2001). ", "The bill"],
      [`homes;${C}\n\n`, "The same order"],
    ]) {
      expect(isSentenceStart(before + after, before.length), JSON.stringify(before)).toBe(true);
    }
  });

  it("does not split a sentence at an abbreviation, an initial, a lowercase word or a semicolon", () => {
    for (const [before, after] of [
      ["signed by Gov. ", "Kotek"],
      ["the U.S. ", "Department"],
      ["near Mt. ", "Hood"],
      ["e.g. ", "the order"],
      ["see Sec. ", "3 of it"],
      ["36,000 homes; ", "The"],
      ["J. ", "Smith"],
    ]) {
      expect(isSentenceStart(before + after, before.length), JSON.stringify(before)).toBe(false);
    }
  });
});
