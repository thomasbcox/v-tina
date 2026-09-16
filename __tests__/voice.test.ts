import { describe, expect, it } from "vitest";
import type { RetrievedPolicyChunk } from "../src/types";
import {
  AVATAR_FRAME,
  CADENCE_MAX_UNQUOTED_WORDS,
  IMPERSONATION_FORMS,
  checkCadence,
  quotedSpans,
  screenOpening,
  unquoted,
  verifyQuotations,
} from "../src/lib/voice";

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

// Shaped on the real corpus: an order's operative clause is in the Governor's
// first person, and passages carry their own quoted terms.
const EO = "EO 23-02: Declaring State of Emergency";
const SB = "SB 1537 (2024): An Act relating to housing";
const EO_TEXT =
  'NOW, THEREFORE, I, TINA KOTEK, Governor of the State of Oregon, by virtue of the power and ' +
  'authority vested in me, do hereby order that the State address "unsheltered homelessness" as an ' +
  "emergency.";
const SB_TEXT =
  "The Oregon Business Development Department shall provide capacity and support for infrastructure " +
  "planning to municipalities.";
const PASSAGES = [chunk(EO, EO_TEXT), chunk(SB, SB_TEXT, 1)];

describe("AC1 — the avatar identifies itself", () => {
  it("accepts an opening carrying any declared frame", () => {
    // The extent comes from the constant, so a frame added there is covered here
    // without editing this test.
    for (const frame of AVATAR_FRAME) {
      expect(screenOpening(`${frame}, the order requires a target.`)).toEqual({ kind: "ok" });
    }
  });

  it("reports an opening with no frame at all", () => {
    expect(screenOpening("The order requires an annual target of 36,000 homes.")).toEqual({
      kind: "missing-frame",
    });
  });
});

describe("the declared constants must mean something, not merely exist", () => {
  it("every avatar frame actually names the Governor", () => {
    // Ratified regression against AC1: a test whose cases are generated FROM the
    // constant can never catch a bad constant. Weakening AVATAR_FRAME to "as a
    // virtual avatar" — naming nobody — would leave every derived case green
    // while the frame stopped telling a reader who is being represented.
    for (const frame of AVATAR_FRAME) {
      expect(frame, `${frame} must identify whose avatar this is`).toMatch(/governor|kotek/);
      expect(frame).toMatch(/avatar/);
    }
  });

  it("every impersonation form is actually first person", () => {
    for (const form of IMPERSONATION_FORMS) {
      expect(form, `${form} must be first person to be impersonation`).toMatch(
        /\b(i|my|me)\b/,
      );
    }
  });

  it("the cadence bound is inside the range Thomas set", () => {
    // "every roughly 100-200 non-quoted words" — a bound of 100000 would pass
    // every cadence test while meaning nothing.
    expect(CADENCE_MAX_UNQUOTED_WORDS).toBeGreaterThanOrEqual(100);
    expect(CADENCE_MAX_UNQUOTED_WORDS).toBeLessThanOrEqual(200);
  });
});

describe("AC7 — impersonation is caught, but quoting the record is not", () => {
  it("catches an anchor with a clause interposed before the first person", () => {
    // Ratified regression against AC5/AC7: `As your Governor — and I say this
    // plainly — I…` contains no listed form verbatim and normalises away from
    // every one of them, so exact matching let it reach the reader.
    for (const shape of [
      "As your Governor — and I say this plainly — I want to be clear.",
      "As Governor of Oregon, having considered the record, my view is this.",
      "As your Governor (speaking plainly), I think so.",
    ]) {
      expect(screenOpening(shape).kind, `must catch: ${shape}`).toBe("impersonates");
    }
  });

  it("does NOT flag the avatar describing her in the third person", () => {
    // The pronoun is what separates impersonation from description; matching the
    // anchor alone would flag correct prose.
    const ok = `${AVATAR_FRAME[0]}, as Governor of Oregon, Tina Kotek signed the order.`;
    expect(screenOpening(ok)).toEqual({ kind: "ok" });
  });

  it("catches every declared form, in real shapes", () => {
    for (const form of IMPERSONATION_FORMS) {
      for (const shape of [
        `${form} think this matters.`,
        `   ${form} think this matters.`,
        `**${form}** think this matters.`,
        `${form.toUpperCase()} think this matters.`,
        `Housing matters. ${form} have said so.`,
      ]) {
        const v = screenOpening(shape);
        expect(v.kind, `must catch: ${shape.slice(0, 50)}`).toBe("impersonates");
      }
    }
  });

  it("does NOT flag the record's own first person inside a quotation", () => {
    // Two corpus documents open exactly this way, and quoting them is the answer
    // shape the prompt asks for. A quotation-blind screen would fight the prompt.
    const opening =
      `${AVATAR_FRAME[0]}, EO 23-02 states: "NOW, THEREFORE, I, TINA KOTEK, Governor of the ` +
      `State of Oregon, by virtue of the power and authority vested in me, do hereby order".`;
    expect(screenOpening(opening)).toEqual({ kind: "ok" });
  });

  it("still flags impersonation that sits outside the quotation", () => {
    const opening = `"a quoted passage", and as your governor, I want to be clear.`;
    expect(screenOpening(opening).kind).toBe("impersonates");
  });
});

describe("quoted-span extraction", () => {
  it("finds straight and typographic quotations", () => {
    expect(quotedSpans('He said "one" then “two”.').map((s) => s.text)).toEqual([
      "one",
      "two",
    ]);
  });

  it("removes quoted text so only the avatar's own prose is judged", () => {
    expect(unquoted('Frame here "quoted bit" and more.').replace(/\s+/g, " ").trim()).toBe(
      "Frame here and more.",
    );
  });
});

describe("AC3 — a quotation must be verbatim in the document it cites", () => {
  it("accepts a faithful quotation attributed to the right document", () => {
    const answer = `Under ${EO}, the order states: "do hereby order that the State address".`;
    expect(verifyQuotations(answer, PASSAGES)).toEqual([]);
  });

  it("rejects a span altered by one word", () => {
    const answer = `Under ${EO}, the order states: "do hereby demand that the State address".`;
    expect(verifyQuotations(answer, PASSAGES)).toHaveLength(1);
  });

  it("rejects a span that is real but cited to the wrong document", () => {
    // Orders quote statutes and bills share boilerplate, so set membership over
    // all passages would pass this — and the reader would follow a citation to a
    // document that does not contain the words, making the error more credible.
    const answer = `Under ${SB}: "do hereby order that the State address".`;
    const bad = verifyQuotations(answer, PASSAGES);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBe("not-in-cited-document");
    expect(bad[0].citedAs).toBe(SB);
  });

  it("rejects a span in no passage at all", () => {
    const answer = `Under ${EO}: "a 13% rise in unsheltered homelessness".`;
    const bad = verifyQuotations(answer, PASSAGES);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBe("not-in-any-passage");
  });

  it("rejects a quotation with no citation near it", () => {
    const answer = `Something happened. "do hereby order that the State address".`;
    expect(verifyQuotations(answer, PASSAGES)[0].reason).toBe("no-citation");
  });

  it("rejects a span stitched across two passages", () => {
    const answer = `Under ${EO}: "as an emergency. The Oregon Business Development Department".`;
    expect(verifyQuotations(answer, PASSAGES)).toHaveLength(1);
  });

  it("reports the failing segment when a quotation elides", () => {
    // The prompt forbids elision; the verifier still splits on it so a slip is
    // diagnosed rather than the whole span condemned or waved through.
    const ok = `Under ${EO}: "NOW, THEREFORE ... do hereby order that the State address".`;
    expect(verifyQuotations(ok, PASSAGES)).toEqual([]);
    const bad = `Under ${EO}: "NOW, THEREFORE ... do hereby demand something else".`;
    expect(verifyQuotations(bad, PASSAGES)).toHaveLength(1);
  });

  it("tolerates a passage's own nested quotation", () => {
    // Naive mark-pairing splits this wrongly; a faithful quotation must not be
    // reported as a fabrication, or whoever reads the findings learns to ignore them.
    const answer = `Under ${EO}: "the State address "unsheltered homelessness" as an emergency".`;
    expect(verifyQuotations(answer, PASSAGES)).toEqual([]);
  });

  it("normalises line wrapping but nothing else", () => {
    const answer = `Under ${EO}: "do hereby order\n   that the State address".`;
    expect(verifyQuotations(answer, PASSAGES)).toEqual([]);
    const cased = `Under ${EO}: "DO HEREBY ORDER THAT THE STATE ADDRESS".`;
    expect(verifyQuotations(cased, PASSAGES), "case is the record's").toHaveLength(1);
  });
});

describe("AC6 — the avatar re-identifies itself before the reader loses track", () => {
  const frame = AVATAR_FRAME[0];
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

  it("accepts prose that stays inside the bound", () => {
    expect(checkCadence(`${frame}, ${words(CADENCE_MAX_UNQUOTED_WORDS - 10)}`)).toEqual([]);
  });

  it("reports a run of its own prose that passes the bound", () => {
    const gaps = checkCadence(`${frame}, ${words(CADENCE_MAX_UNQUOTED_WORDS + 50)}`);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].words).toBeGreaterThan(CADENCE_MAX_UNQUOTED_WORDS);
  });

  it("accepts the same prose once the frame is repeated", () => {
    const half = words(Math.floor(CADENCE_MAX_UNQUOTED_WORDS * 0.8));
    expect(checkCadence(`${frame}, ${half} ${frame}, ${half}`)).toEqual([]);
  });

  it("does not count quoted text toward the bound", () => {
    // A reader being shown the record is not being shown the avatar's assertions,
    // so a long quotation is not a long silence about who is speaking.
    const long = words(CADENCE_MAX_UNQUOTED_WORDS * 2);
    expect(checkCadence(`${frame}, here is the record: "${long}" and that is it.`)).toEqual([]);
  });

  it("reports the opening run when the frame never appears at all", () => {
    expect(checkCadence(words(CADENCE_MAX_UNQUOTED_WORDS + 5))).toHaveLength(1);
  });
});

describe("a document's own title is record text, not a fabrication", () => {
  it("verifies a quotation of the title the system itself supplied", () => {
    // Found by the FIRST live run, not by this suite: the model quoted the
    // document's title — which the system hands it alongside the passage — and
    // the verifier, knowing only passage bodies, stopped a correct answer as a
    // fabrication. A false positive of exactly the class that teaches its reader
    // to ignore findings.
    const answer = `Under ${EO}, the document is titled "Declaring State of Emergency".`;
    expect(verifyQuotations(answer, PASSAGES)).toEqual([]);
  });

  it("still rejects a title that belongs to a different document", () => {
    const answer = `Under ${SB}: "Declaring State of Emergency".`;
    expect(verifyQuotations(answer, PASSAGES)[0].reason).toBe("not-in-cited-document");
  });
});
