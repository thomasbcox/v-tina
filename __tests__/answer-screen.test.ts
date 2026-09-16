import { describe, expect, it } from "vitest";
import type { ChatStreamEvent, RetrievedPolicyChunk } from "../src/types";
import { DISPLAY_FRAME, screenedAnswer } from "../src/lib/chat/orchestrate";
import {
  FAILURE_NOTICE,
  GROUNDED_DEFERRAL,
  OREGON_PORTAL_URL,
  PROVENANCE_NOTICE,
} from "../src/lib/prompts";
import { AVATAR_FRAME, CADENCE_MAX_UNQUOTED_WORDS, IMPERSONATION_FORMS, checkCadence } from "../src/lib/voice";

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
  it("DISPLAY_FRAME matches a declared AVATAR_FRAME", () => {
    // A display form the screen did not recognise would inject a frame the cadence
    // counter never sees — and then inject it again, forever.
    expect(AVATAR_FRAME.some((f) => DISPLAY_FRAME.toLowerCase().includes(f))).toBe(true);
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
    // unheld and unverified. It is the specification's own invented statistic.
    for (const quoted of ["'a 13% rise in unsheltered homelessness'", "‘a 13% rise in unsheltered homelessness’"]) {
      const text = said(await collect([`${frame}, the record is clear. `, `Under EO 23-02: ${quoted}. Done.`]));
      expect(text, `must not reach the reader: ${quoted}`).not.toContain("13%");
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

describe("AC6 — the cadence is enforced as the answer streams", () => {
  const sentence = (i: number) => `This is sentence number ${i} of the avatar's own explanation. `;

  it("injects the frame when the avatar's own prose passes the bound", async () => {
    const pieces = [`${frame}, here is the record. `];
    for (let i = 0; i < 40; i += 1) pieces.push(sentence(i));
    const text = said(await collect(pieces));
    // Enforcement, not a test-only function: the STREAMED answer satisfies the bound.
    expect(checkCadence(text), "the reader received an over-long unframed stretch").toEqual([]);
    const frames = text.split(DISPLAY_FRAME).length - 1;
    expect(frames, "the frame must have been injected at least once mid-answer").toBeGreaterThan(1);
  });

  it("does not inject when the model repeats the frame itself", async () => {
    const pieces = [`${frame}, here is the record. `];
    for (let i = 0; i < 40; i += 1) {
      pieces.push(i % 10 === 9 ? `${frame}, to continue. ` : sentence(i));
    }
    const text = said(await collect(pieces));
    expect(checkCadence(text)).toEqual([]);
    const injected = text.split(`${DISPLAY_FRAME}, this is`).length - 1;
    expect(injected, "no injection is needed when the model keeps the cadence").toBe(0);
  });

  it("does not count quoted text toward the bound", async () => {
    // The quotation must be VERIFIABLE, or the answer is refused and the refusal
    // notice — which itself speaks as the avatar — is what gets counted. The first
    // version of this test used made-up words and was measuring a refusal.
    const long = Array.from({ length: CADENCE_MAX_UNQUOTED_WORDS * 2 }, (_, i) => `clause${i}`).join(" ");
    const chunks: RetrievedPolicyChunk[] = [{ ...PASSAGES[0], content: `${EO_TEXT} ${long}` }];
    const text = said(await collect(
      [`${frame}, the record says. `, `Under EO 23-02: ${O}${long}${C}. Done.`],
      chunks,
    ));
    expect(text, "the long quotation must be released, not refused").not.toContain(PROVENANCE_NOTICE);
    expect(text).toContain("clause0");
    expect(text.split(DISPLAY_FRAME).length - 1, "a long quotation needs no re-identification").toBe(1);
  });

  it("keeps a proper noun's capital when injecting before it", async () => {
    const pieces = [`${frame}, here is the record. `];
    for (let i = 0; i < 30; i += 1) pieces.push(sentence(i));
    pieces.push("Oregon adopted the measure. ");
    const text = said(await collect(pieces));
    expect(text).not.toMatch(/Governor, oregon/);
  });
});

describe("AC8 — clean answers pass unaltered, streaming, with honest refusals", () => {
  it("delivers a clean answer whole", async () => {
    const pieces = [`${frame}, the record is clear. `, "The order sets a statewide emergency. ", "That is what it requires."];
    expect(said(await collect(pieces))).toBe(pieces.join(""));
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
