import { describe, expect, it } from "vitest";
import type { RetrievedPolicyChunk } from "../src/types";
import {
  AVATAR_FRAME,
  CADENCE_MAX_UNQUOTED_WORDS,
  CITATION_KINDS,
  IMPERSONATION_FORMS,
  checkCadence,
  citationAliases,
  citedDocument,
  lex,
  proseOf,
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

  it("tracks curly nesting, so a quoted defined term does not end the quotation", () => {
    // Bills in this corpus put curly marks around their own defined terms — 710 marks
    // in all. A grammar that closed at the first inner mark would refuse a faithful
    // quotation of exactly that text.
    const { tokens } = lex(`It says ${q(`${q("Deflection program")} means a collaborative program`)}.`, true);
    const quotes = tokens.filter((t) => t.kind === "quotation");
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ text: `${q("Deflection program")} means a collaborative program` });
  });

  it("refuses a straight double quote used as a delimiter", () => {
    const { tokens } = lex('It says "some words" here.', true);
    expect(tokens.some((t) => t.kind === "violation" && t.reason === "straight-double-delimiter")).toBe(true);
  });

  it("refuses a single-quoted span — the bypass that let a fabrication through", () => {
    for (const text of [
      "Under EO 23-02: 'a 13% rise in unsheltered homelessness'. Done.",
      "Under EO 23-02: ‘a 13% rise in unsheltered homelessness’. Done.",
    ]) {
      const { tokens } = lex(text, true);
      expect(
        tokens.some((t) => t.kind === "violation" && t.reason === "single-quote-delimiter"),
        `must refuse: ${text}`,
      ).toBe(true);
    }
  });

  it("keeps apostrophes as prose, straight or curly", () => {
    // The corpus has 286 curly apostrophes and no opening single mark at all, so a
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

  it("the cadence bound is inside the range Thomas set", () => {
    expect(CADENCE_MAX_UNQUOTED_WORDS).toBeGreaterThanOrEqual(100);
    expect(CADENCE_MAX_UNQUOTED_WORDS).toBeLessThanOrEqual(200);
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

  it("never lets a bare number cite a document", () => {
    // EO 24-02 contains "Springfield/Lane County (110%)". Matching Ballot Measure
    // 110's bare number made that statistic cite the wrong document.
    expect(citedDocument("Springfield/Lane County (110%) saw growth: ", [EO, SB, BM])).toBeUndefined();
    expect(citedDocument("In 2024 the state acted: ", [EO, SB, BM])).toBeUndefined();
  });

  it("recognises a reader's spelling as well as the metadata's", () => {
    for (const ctx of ["Under EO 23-02: ", "Executive Order 23-02 states: ", "Order 23-02 says: "]) {
      expect(citedDocument(ctx, [EO, SB, BM]), ctx).toBe(EO);
    }
  });

  it("picks the citation nearest the quotation, not the first retrieved", () => {
    expect(citedDocument("Unlike EO 23-02, Senate Bill 1537 provides: ", [EO, SB, BM])).toBe(SB);
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
      .toBe("straight-double-delimiter");
    expect(verifyQuotations(`Under ${EO}: 'a 13% rise in unsheltered homelessness'. Done.`, PASSAGES)[0].reason)
      .toBe("single-quote-delimiter");
  });

  it("treats the document's own title as record text", () => {
    expect(verifyQuotations(`Under ${EO}, it is titled ${q("Declaring State of Emergency")}.`, PASSAGES)).toEqual([]);
  });

  it("normalises line wrapping and quote-mark glyphs, but never case", () => {
    expect(verifyQuotations(`Under ${EO}: ${q("do hereby order\n   that the State address")}.`, PASSAGES)).toEqual([]);
    expect(verifyQuotations(`Under ${EO}: ${q("DO HEREBY ORDER THAT THE STATE ADDRESS")}.`, PASSAGES)).toHaveLength(1);
  });
});

describe("AC6 — the cadence check (the runtime enforcement is in answer-screen.test.ts)", () => {
  const frame = AVATAR_FRAME[0];
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

  it("accepts prose inside the bound", () => {
    expect(checkCadence(`${frame}, ${words(CADENCE_MAX_UNQUOTED_WORDS - 10)}`)).toEqual([]);
  });

  it("reports own prose that passes the bound", () => {
    expect(checkCadence(`${frame}, ${words(CADENCE_MAX_UNQUOTED_WORDS + 50)}`)).toHaveLength(1);
  });

  it("does not count quoted text toward the bound", () => {
    expect(checkCadence(`${frame}, the record: ${q(words(CADENCE_MAX_UNQUOTED_WORDS * 2))} ends.`)).toEqual([]);
  });
});
