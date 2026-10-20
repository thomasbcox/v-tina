import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RetrievedPolicyChunk } from "../src/types";
import {
  APOSTROPHES,
  AVATAR_FRAME,
  IMPERSONATION_FORMS,
  NAMED_QUOTE_MARKS,
  isSentenceStart,
  lex,
  screenOpening,
  verifyQuotations,
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

  it("keeps an apostrophe inside a word as prose, and refuses one that starts a word, either glyph", () => {
    for (const text of ["It runs ’til the plan is done.", "It runs 'til the plan is done."]) {
      expect(lex(text, true).tokens.some((t) => t.kind === "violation" && t.reason === "quote-mark-delimiter"), text).toBe(true);
    }
    for (const text of ["Oregon’s order and the agencies’ work.", "Oregon's order and the agencies' work.", "It is the ’90s policy."]) {
      expect(lex(text, true).tokens.every((t) => t.kind === "prose"), text).toBe(true);
    }
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
    expect(bad[0]).toMatchObject({ reason: "not-in-cited-document", citedAs: [SB] });
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

  it("treats the document's own title as record text", () => {
    expect(verifyQuotations(`Under ${EO}, it is titled ${q("Declaring State of Emergency")}.`, PASSAGES)).toEqual([]);
  });

  it("normalises line wrapping and quote-mark glyphs, but never case", () => {
    expect(verifyQuotations(`Under ${EO}: ${q("do hereby order\n   that the State address")}.`, PASSAGES)).toEqual([]);
    expect(verifyQuotations(`Under ${EO}: ${q("DO HEREBY ORDER THAT THE STATE ADDRESS")}.`, PASSAGES)).toHaveLength(1);
  });
});

describe("AC6 — the cadence rule (the runtime enforcement is in answer-screen.test.ts)", () => {
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
