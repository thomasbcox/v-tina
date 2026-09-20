import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ChatStreamEvent, RetrievedPolicyChunk } from "../src/types";
import { screenedAnswer } from "../src/lib/chat/orchestrate";
import {
  ANSWER_SYSTEM_PROMPT,
  FAILURE_NOTICE,
  GROUNDED_DEFERRAL,
  OREGON_PORTAL_URL,
  PROVENANCE_NOTICE,
} from "../src/lib/prompts";
import {
  AVATAR_FRAME,
  CADENCE_TARGET_WORDS,
  DISPLAY_FRAME,
  IMPERSONATION_FORMS,
  checkCadence,
} from "../src/lib/voice";
import captured from "./fixtures/answer-stream.json";

const O = "“";
const C = "”";
const EO = "EO 23-02: Declaring State of Emergency";
const EO_TEXT =
  "NOW, THEREFORE, I, TINA KOTEK, Governor of the State of Oregon, do hereby order that the State " +
  "address unsheltered homelessness as an emergency.";
const PASSAGES: RetrievedPolicyChunk[] = [
  {
    id: "c1",
    content: EO_TEXT,
    chunkIndex: 0,
    source: {
      documentTitle: EO,
      date: "2023-01-10",
      url: "https://www.oregon.gov/gov/eo/eo-23-02.pdf",
      pillar: "housing-and-homelessness",
      documentKind: "executive",
    },
    similarity: 0.8,
  },
];

async function* from(pieces: string[]): AsyncGenerator<string> {
  for (const p of pieces) yield p;
}

async function collect(
  pieces: string[],
  chunks: RetrievedPolicyChunk[] = PASSAGES,
): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const e of screenedAnswer(from(pieces), chunks, () => {})) out.push(e);
  return out;
}

const said = (events: ChatStreamEvent[]) =>
  events
    .filter((e): e is Extract<ChatStreamEvent, { type: "streamed_tokens" }> => e.type === "streamed_tokens")
    .map((e) => e.text)
    .join("");

const frame = DISPLAY_FRAME;

describe("the displayed frame is one the screen recognises", () => {
  it("DISPLAY_FRAME is exactly a declared AVATAR_FRAME, not merely one containing it", () => {
    // A display form the screen did not recognise would inject a frame the cadence
    // counter never sees — and then inject it again, forever.
    expect(AVATAR_FRAME).toContain(DISPLAY_FRAME.toLowerCase());
  });

  it("the notices that speak as the avatar open with that same frame", () => {
    for (const notice of [GROUNDED_DEFERRAL, PROVENANCE_NOTICE]) expect(notice.startsWith(`${DISPLAY_FRAME}, `)).toBe(true);
  });
});

describe("AC4 — an unverifiable quotation never reaches the reader", () => {
  it("withholds a fabricated quotation and refuses on provenance", async () => {
    const text = said(await collect([
      `${frame}, the record is clear. `,
      `Under EO 23-02: ${O}`,
      "a 13% rise in unsheltered homelessness",
      `${C}. That is the position.`,
    ]));
    expect(text, "the fabricated quotation must never appear").not.toContain("13%");
    expect(text).toContain(PROVENANCE_NOTICE);
  });

  it("withholds a SINGLE-QUOTED fabrication — the bypass the review confirmed", async () => {
    // The first version recognised no single marks, so this streamed to the reader
    // unheld and unverified. It is the specification's own invented statistic. The
    // unclosed forms were the second bypass: read as an apostrophe after all, and
    // released as prose (approach review round 8175a2d).
    for (const tail of [
      "'a 13% rise in unsheltered homelessness'. Done.",
      "‘a 13% rise in unsheltered homelessness’. Done.",
      "'a 13% rise in unsheltered homelessness",
      "'a 13% rise in unsheltered homelessness. That is the position.",
    ]) {
      const text = await sameEveryWay(`${frame}, the record is clear. Under EO 23-02: ${tail}`);
      expect(text, `must not reach the reader: ${tail}`).not.toContain("13%");
      expect(text).toContain(PROVENANCE_NOTICE);
    }
  });

  it("refuses a quotation in straight double marks rather than trusting it", async () => {
    const text = said(await collect([`${frame}, the record is clear. `, 'Under EO 23-02: "a 13% rise". Done.']));
    expect(text).not.toContain("13%");
    expect(text).toContain(PROVENANCE_NOTICE);
  });

  it("releases a quotation that does verify", async () => {
    const text = said(await collect([
      `${frame}, the record is clear. `,
      `Under EO 23-02: ${O}`,
      "do hereby order that the State address",
      `${C}. That is the position.`,
    ]));
    expect(text).toContain("do hereby order that the State address");
    expect(text).not.toContain(PROVENANCE_NOTICE);
  });

  it("releases several faithful quotations in a row", async () => {
    const text = said(await collect([
      `${frame}, the record shows two things. `,
      `Under EO 23-02: ${O}do hereby order that the State address${C}. `,
      `And under the same order: ${O}unsheltered homelessness as an emergency${C}. That is the record.`,
    ]));
    expect(text).toContain("do hereby order that the State address");
    expect(text).toContain("unsheltered homelessness as an emergency");
    expect(text).not.toContain(PROVENANCE_NOTICE);
  });

  it("refuses rather than releasing a quotation that never closes", async () => {
    const text = said(await collect([`${frame}, the record says. `, `Under EO 23-02: ${O}something unterminated`]));
    expect(text).toContain(PROVENANCE_NOTICE);
    expect(text).not.toContain("something unterminated");
  });
});

/**
 * How a model actually streams, taken from real output: `fixtures/answer-stream.json`
 * was captured token by token from the live answer model. Whitespace leads the word
 * it precedes and never trails one (` This`, not `This `), and punctuation — an
 * opening curly mark included — arrives on its own.
 *
 * The first cadence tests fed `"sentence. "` chunks, which no tokeniser produces, and
 * the enforcement they passed never fired on real output (approach review round
 * b6039ac). Every cadence test below runs on this shape, and on several others,
 * because the answer a reader gets must not depend on where the chunks fell.
 */
const DELTAS: string[] = captured.deltas;
const CAPTURED_PASSAGES = captured.passages as unknown as RetrievedPolicyChunk[];

function asModelTokens(text: string): string[] {
  return text.match(/\s*[\p{L}\p{N}’']+|\s*[^\s\p{L}\p{N}’']+|\s+$/gu) ?? [];
}

function chunkings(text: string): Record<string, string[]> {
  return {
    whole: [text],
    "model tokens": asModelTokens(text),
    "trailing space": text.split(/(?<=\s)(?=\S)/),
    "one character": [...text],
    "seven characters": text.match(/[\s\S]{1,7}/g) ?? [],
  };
}

/** Streams `text` every way `chunkings` cuts it, asserts the reader receives the same
 *  thing each time, and returns it. */
async function sameEveryWay(text: string, chunks: RetrievedPolicyChunk[] = PASSAGES): Promise<string> {
  const results = await Promise.all(
    Object.entries(chunkings(text)).map(async ([name, pieces]) => {
      expect(pieces.join(""), `${name} must cut, not change, the text`).toBe(text);
      return [name, said(await collect(pieces, chunks))] as const;
    }),
  );
  const [, first] = results[0];
  for (const [name, got] of results) expect(got, `chunked as ${name}`).toBe(first);
  return first;
}

describe("AC6 — the cadence is enforced as the answer streams", () => {
  /** `n` sentences of exactly ten words, each starting with a capital. */
  const sentences = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => ` Record ${from + i} shows the state acted on housing this year.`).join("");
  /** The frame, then four words of the avatar's own. */
  const opening = `${frame}, here is the record.`;
  const frames = (text: string) => text.split(DISPLAY_FRAME).length - 1;

  it("the test shape is the real one: whitespace leads a token and never trails it", () => {
    const trailing = (tokens: string[]) => tokens.filter((t) => /\S\s+$/.test(t));
    expect(trailing(DELTAS), "the captured stream").toEqual([]);
    expect(DELTAS.filter((t) => /^\s+\S/.test(t)).length, "most real tokens lead with a space").toBeGreaterThan(DELTAS.length / 2);
    expect(trailing(asModelTokens(`${opening}${sentences(3)}\n\nThe order says: ${O}address${C}.`))).toEqual([]);
  });

  it("releases the captured real answer unaltered, however it is chunked", async () => {
    const answer = DELTAS.join("");
    expect(said(await collect(DELTAS, CAPTURED_PASSAGES)), "as the model sent it").toBe(answer);
    expect(await sameEveryWay(answer, CAPTURED_PASSAGES)).toBe(answer);
  });

  it("injects the frame at the first sentence start past the target, on real token shapes", async () => {
    // 4 + 150 own words: the frame is due where the next sentence starts.
    const text = await sameEveryWay(`${opening}${sentences(15)} The order followed.${sentences(20, 100)}`);
    expect(text).toContain(`this year. ${DISPLAY_FRAME}, the order followed.`);
    expect(checkCadence(text), "no sentence starts past the target unframed").toEqual([]);
    expect(frames(text), "the opening, then an injection every ~150 words").toBe(3);
  });

  it("keeps injecting through a long answer", async () => {
    const text = await sameEveryWay(`${opening}${sentences(80)}`);
    expect(checkCadence(text)).toEqual([]);
    expect(frames(text)).toBeGreaterThanOrEqual(5);
  });

  it("never splits a sentence at an abbreviation that falls where the frame is due", async () => {
    // 144 own words at "It"; "Kotek" arrives at 152, past the target, after "Gov. ".
    const text = await sameEveryWay(
      `${opening}${sentences(14)} It was completed by the legislature and Gov. Kotek together. The order followed.`,
    );
    expect(text).toContain("and Gov. Kotek together.");
    expect(text).toContain(`${DISPLAY_FRAME}, the order followed.`);
  });

  it("the stated limit: a long sentence runs past the target whole, and the frame lands after it", async () => {
    const long = ` It ${Array.from({ length: 220 }, (_, i) => `clause${i}`).join(" ")} ends here.`;
    const text = await sameEveryWay(`${opening}${sentences(14)}${long} The next sentence starts.`);
    expect(text, "the long sentence is never interrupted").toContain(long);
    expect(text).toContain(`ends here. ${DISPLAY_FRAME}, the next sentence starts.`);
    expect(checkCadence(text)).toEqual([]);
  });

  it("does not inject when the model repeats the frame itself, even split across tokens", async () => {
    const answer = `${opening}${sentences(15)} ${frame}, to continue.${sentences(15, 100)} ${frame}, and finally.${sentences(5, 200)}`;
    const text = await sameEveryWay(answer);
    expect(text, "nothing to add when the model keeps the cadence").toBe(answer);
  });

  it("does not count quoted text toward the target", async () => {
    // The quotation must be VERIFIABLE, or the answer is refused and the refusal
    // notice — which itself speaks as the avatar — is what gets counted.
    const long = Array.from({ length: CADENCE_TARGET_WORDS * 2 }, (_, i) => `clause${i}`).join(" ");
    const chunks: RetrievedPolicyChunk[] = [{ ...PASSAGES[0], content: `${EO_TEXT} ${long}` }];
    const text = await sameEveryWay(`${opening} Under EO 23-02: ${O}${long}${C}. That is the order. It stands.`, chunks);
    expect(text, "the long quotation must be released, not refused").not.toContain(PROVENANCE_NOTICE);
    expect(text).toContain("clause0");
    expect(frames(text), "a long quotation needs no re-identification").toBe(1);
  });

  it("keeps a proper noun's capital when injecting before it", async () => {
    const text = await sameEveryWay(`${opening}${sentences(15)} Oregon adopted the measure.`);
    expect(text).toContain(`${DISPLAY_FRAME}, Oregon adopted the measure.`);
  });
});

describe("the stream's work grows with the answer, not with its square", () => {
  /** The quickest of three runs, in milliseconds: a ratio of these, never a clock. */
  const fastest = async (tokens: string[], chunks: RetrievedPolicyChunk[] = PASSAGES) => {
    let best = Infinity;
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now();
      await collect(tokens, chunks);
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };

  it("an answer eight times longer costs far less than sixty-four times as much", async () => {
    // Re-lexing the whole answer on every token measured 17 ms at 500 tokens and
    // 465 ms at 4,000 (approach review round b6039ac). Linear work scales about 8x
    // here and the quadratic version about 64x.
    const answer = (n: number) =>
      asModelTokens(`${frame}, here is the record.${Array.from({ length: n }, (_, i) => ` Record ${i} shows the state acted on housing this year.`).join("")}`);
    await fastest(answer(50));
    const small = await fastest(answer(100));
    const large = await fastest(answer(800));
    expect(large / small, `100 sentences: ${small.toFixed(1)} ms; 800 sentences: ${large.toFixed(1)} ms`).toBeLessThan(24);
  });

  it("a quotation held open costs about what the same words cost flowing", async () => {
    // A quotation is held until it closes. Rescanning held text for every token
    // measured 108 ms for a 2,000-word quotation against 3 ms for the same words
    // flowing.
    const words = Array.from({ length: 2000 }, (_, i) => `clause${i}`).join(" ");
    const chunks: RetrievedPolicyChunk[] = [{ ...PASSAGES[0], content: `${EO_TEXT} ${words}` }];
    const opening = `${frame}, here is the record.`;
    const flowing = asModelTokens(`${opening} It runs ${words}.`);
    await fastest(flowing, chunks);
    const base = await fastest(flowing, chunks);
    for (const [name, text] of [["an open quotation", `${opening} Under EO 23-02: ${O}${words}${C}.`]]) {
      const tokens = asModelTokens(text);
      expect(said(await collect(tokens, chunks)), name).not.toContain(PROVENANCE_NOTICE);
      const cost = await fastest(tokens, chunks);
      expect(cost / base, `${name}: ${cost.toFixed(1)} ms; flowing: ${base.toFixed(1)} ms`).toBeLessThan(8);
    }
  });
});

describe("AC8 — clean answers pass unaltered, streaming, with honest refusals", () => {
  it("delivers a clean answer whole", async () => {
    const pieces = [`${frame}, the record is clear. `, "The order sets a statewide emergency. ", "That is what it requires."];
    expect(said(await collect(pieces))).toBe(pieces.join(""));
  });

  it("reads a possessive split at its apostrophe as prose, however the tokens fall", async () => {
    // The stream lexes only unreleased text, so a token boundary can fall between
    // "Governor" and "'s". Without the character before it, that apostrophe looks like
    // a quotation opening, "agencies' " closes it, and a clean answer is refused.
    const answer = `${frame}, the record is clear. The Governor's staff and the agencies' work continue under the order.`;
    expect(await sameEveryWay(answer)).toBe(answer);
  });

  it("stops at a straight apostrophe that begins a word, the same way however the tokens fall", async () => {
    // The cost Thomas accepted for closing the unclosed single-quote bypass: nothing
    // after the mark reaches the reader. The prompt tells the model never to write one.
    const answer = `${frame}, the record is clear. It runs 'til the plan is done. That is all.`;
    expect(await sameEveryWay(answer)).toBe(`${frame}, the record is clear. It runs ${PROVENANCE_NOTICE}`);
  });

  it("the answering prompt tells the model never to begin a word with an apostrophe", () => {
    expect(ANSWER_SYSTEM_PROMPT).toContain("Never begin a word with an apostrophe");
  });

  it("releases a quotation cited in the avatar's words, whatever the quotation before it names", async () => {
    // Both live refusals, replayed on the real corpus text.
    const at = (title: string, file: string, n: number): RetrievedPolicyChunk => ({
      ...PASSAGES[0],
      id: `live-${n}`,
      content: readFileSync(file, "utf8"),
      source: { ...PASSAGES[0].source, documentTitle: title },
    });
    const chunks = [
      at("EO 24-02: Merge and Extend Executive Order 23-02 and Executive Order 23-09", "corpus/eo-24-02.md", 0),
      at("EO 23-02: Declaring State of Emergency Due to Homelessness", "corpus/eo-23-02.md", 1),
      at("SB 1537 (2024): An Act relating to housing (Oregon Laws 2024, chapter 110)", "corpus/sb-1537.md", 2),
      at("EO 23-04: Establishing a Statewide Housing Production Goal and Housing Production Advisory Council", "corpus/eo-23-04.md", 3),
    ];
    const mentionsAnother = `${O}before the emergency response by way of EO 23-02 was implemented.${C}`;
    const sameDocument = ` The same document states: ${O}About 62% of those experiencing homelessness were unsheltered;${C}`;
    const answers = [
      // A document named inside the first quotation: after the opening, then inside it,
      // where the opening's own words must carry the citation forward.
      `${frame}, the record runs across orders that build on one another. Executive Order 24-02 continues that response. It states: ${mentionsAnother}${sameDocument}`,
      `${frame}, the record on homelessness runs across several orders that build on one another over time, and Executive Order 24-02 continues that response and states: ${mentionsAnother}${sameDocument}`,
      // A long quotation keeps an earlier citation out of reach, as it always did.
      `${frame}, here is the record. On the legislative side, SB 1537 provides: ${O}The Oregon Business Development ` +
        "Department shall provide capacity and support for infrastructure planning to municipalities to enable them to " +
        "plan and finance infrastructure for water, sewers and sanitation, stormwater and transportation consistent with " +
        `opportunities to produce housing units at densities defined in section 55 (3)(a)(C) of this 2024 Act.${C} The order ` +
        `also frames the approach, stating that ${O}expanding housing opportunities and solving the affordable housing ` +
        `crisis will require a new level of innovation and cooperation between the public, private, and non-profit sectors;${C}`,
    ];
    for (const answer of answers) expect(await sameEveryWay(answer, chunks), answer.slice(36, 90)).toBe(answer);
  });

  it("streams progressively rather than as one block", async () => {
    const events = await collect([`${frame}, first part here. `, "second part. ", "third part. ", "fourth part."]);
    expect(events.filter((e) => e.type === "streamed_tokens").length).toBeGreaterThan(2);
  });

  it("reports a provenance refusal as provenance, never as an infrastructure failure", async () => {
    const text = said(await collect([`${frame}, the record says. `, `Under EO 23-02: ${O}words in no passage${C}.`]));
    expect(text).toContain(PROVENANCE_NOTICE);
    expect(text).not.toContain(FAILURE_NOTICE);
  });

  it("repairs a missing frame rather than refusing", async () => {
    const text = said(await collect(["The order sets a statewide emergency. ", "That is what it requires."]));
    expect(text.toLowerCase()).toContain(AVATAR_FRAME[0]);
    expect(text).toContain("statewide emergency");
    expect(text).not.toContain(PROVENANCE_NOTICE);
  });

  it("drops an impersonating opening sentence when the answer continues", async () => {
    const text = said(await collect(["As your Governor, I want to be clear. ", "The order sets a statewide emergency."]));
    expect(text.toLowerCase()).not.toContain("as your governor, i");
    expect(text).toContain("statewide emergency");
  });

  it("screens the sentence it falls back to, however many it has to drop", async () => {
    // The sentence after a dropped one was released unscreened, so a second
    // impersonation walked straight out behind the injected frame (approach round
    // d42bbb0). Each candidate opening is screened in turn.
    const text = await sameEveryWay(
      `As your Governor, I want to be clear. My administration set a target. The order sets a statewide emergency.`,
    );
    expect(text.toLowerCase(), "the second impersonation must not reach the reader").not.toContain("my administration");
    expect(text).toBe(`${frame}, the order sets a statewide emergency.`);
  });

  it("never cuts an opening inside a quotation, and refuses when nothing clean remains", async () => {
    // The repair cut at the first sentence end anywhere — including inside a quotation —
    // and never re-screened what it kept, emitting impersonation and a broken quotation
    // (hidden-failure, round d42bbb0).
    const wrecked = `As your Governor, I say ${O}Look. Now.${C} and my administration acts. Then more follows.`;
    const text = await sameEveryWay(wrecked);
    expect(text).not.toContain("Now.”");
    expect(text.toLowerCase()).not.toContain("my administration");
    expect(text).toBe(`${frame}, Then more follows.`); // "Then" is no function word, so it keeps its capital
    expect(said(await collect(["As your Governor, I want to be clear. My administration acts."])), "nothing clean left")
      .toContain(PROVENANCE_NOTICE);
  });

  it("refuses when an impersonating answer has nothing else", async () => {
    expect(said(await collect(["As your Governor, I want to be clear"]))).toContain(PROVENANCE_NOTICE);
  });
});

describe("AC9 — the reader-facing notices keep their load-bearing content", () => {
  it("the deferral still names the official state portal", () => {
    expect(GROUNDED_DEFERRAL).toContain(OREGON_PORTAL_URL);
  });

  it("the infrastructure notice still discloses the answer is incomplete", () => {
    expect(FAILURE_NOTICE).toMatch(/incomplete/i);
  });

  it("no reader-facing notice speaks as the Governor", () => {
    for (const text of [GROUNDED_DEFERRAL, FAILURE_NOTICE, PROVENANCE_NOTICE]) {
      for (const form of IMPERSONATION_FORMS) expect(text.toLowerCase()).not.toContain(form);
    }
  });

  it("the deferral and the provenance notice speak as the avatar", () => {
    for (const text of [GROUNDED_DEFERRAL, PROVENANCE_NOTICE]) {
      expect(AVATAR_FRAME.some((f) => text.toLowerCase().includes(f))).toBe(true);
    }
  });
});
