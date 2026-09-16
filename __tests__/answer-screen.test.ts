import { describe, expect, it } from "vitest";
import type { ChatStreamEvent, RetrievedPolicyChunk } from "../src/types";
import { screenedAnswer } from "../src/lib/chat/orchestrate";
import {
  FAILURE_NOTICE,
  GROUNDED_DEFERRAL,
  OREGON_PORTAL_URL,
  PROVENANCE_NOTICE,
} from "../src/lib/prompts";
import { AVATAR_FRAME, IMPERSONATION_FORMS } from "../src/lib/voice";

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

async function collect(pieces: string[]): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const e of screenedAnswer(from(pieces), PASSAGES, () => {})) out.push(e);
  return out;
}

const said = (events: ChatStreamEvent[]) =>
  events
    .filter((e): e is Extract<ChatStreamEvent, { type: "streamed_tokens" }> =>
      e.type === "streamed_tokens",
    )
    .map((e) => e.text)
    .join("");

const frame = AVATAR_FRAME[0];

describe("AC4 — an unverifiable quotation never reaches the reader", () => {
  it("withholds the quotation and refuses on provenance", async () => {
    const events = await collect([
      `${frame}, the record is clear. `,
      `Under ${EO}: "`,
      "a 13% rise in unsheltered homelessness",
      '". That is the position.',
    ]);
    const text = said(events);
    expect(text, "the fabricated quotation must never appear").not.toContain("13%");
    expect(text).toContain(PROVENANCE_NOTICE);
  });

  it("releases a quotation that does verify", async () => {
    const events = await collect([
      `${frame}, the record is clear. `,
      `Under ${EO}: "`,
      "do hereby order that the State address",
      '". That is the position.',
    ]);
    const text = said(events);
    expect(text).toContain("do hereby order that the State address");
    expect(text).not.toContain(PROVENANCE_NOTICE);
  });

  it("refuses rather than releasing a quotation that never closes", async () => {
    const events = await collect([`${frame}, the record says: "`, "something unterminated"]);
    expect(said(events)).toContain(PROVENANCE_NOTICE);
    expect(said(events)).not.toContain("something unterminated");
  });
});

describe("AC8 — a clean answer is unaltered, progressive, and refusals are honest", () => {
  it("delivers a clean answer whole", async () => {
    const pieces = [
      `${frame}, the record is clear. `,
      "The order sets a statewide emergency. ",
      "That is what it requires.",
    ];
    const events = await collect(pieces);
    expect(said(events)).toBe(pieces.join(""));
  });

  it("streams progressively rather than as one block", async () => {
    const pieces = [
      `${frame}, first part here. `,
      "second part. ",
      "third part. ",
      "fourth part.",
    ];
    const events = await collect(pieces);
    const records = events.filter((e) => e.type === "streamed_tokens");
    // A held opening followed by one block would be two. The point of the pull
    // stream is that prose flows as it is generated.
    expect(records.length).toBeGreaterThan(2);
  });

  it("does not hold prose that contains no quotation", async () => {
    const events = await collect([`${frame}, a. `, "b. ", "c."]);
    const first = events.findIndex((e) => e.type === "streamed_tokens");
    expect(first, "the opening must be released, not withheld to the end").toBe(0);
  });

  it("reports a provenance refusal as provenance, never as an infrastructure failure", async () => {
    // Telling a reader "something went wrong" when a provenance gate fired is a
    // false statement about what happened.
    const events = await collect([
      `${frame}, the record says. `,
      `Under ${EO}: "`,
      "words that are not in any passage",
      '".',
    ]);
    const text = said(events);
    expect(text).toContain(PROVENANCE_NOTICE);
    expect(text, "the infrastructure notice must not be used for a refusal").not.toContain(
      FAILURE_NOTICE,
    );
  });

  it("repairs a missing frame rather than refusing the answer", async () => {
    // The likeliest prompt slip should not cost an answer, and must not be
    // reported as a failure either.
    const events = await collect(["The order sets a statewide emergency. ", "That is what it requires."]);
    const text = said(events);
    expect(text.toLowerCase()).toContain(AVATAR_FRAME[0]);
    expect(text).toContain("statewide emergency");
    expect(text).not.toContain(PROVENANCE_NOTICE);
  });

  it("strips an impersonating opening instead of publishing it", async () => {
    const events = await collect([
      "As your Governor, I want to be clear. ",
      "The order sets a statewide emergency.",
    ]);
    const text = said(events);
    expect(text.toLowerCase()).not.toContain("as your governor, i");
    expect(text).toContain("statewide emergency");
  });

  it("refuses when stripping an impersonating opening would leave nothing", async () => {
    const events = await collect(["As your Governor, I want to be clear"]);
    expect(said(events)).toContain(PROVENANCE_NOTICE);
  });
});

describe("AC9 — the reader-facing notices keep their load-bearing content", () => {
  it("the deferral still names Oregon's official state portal", () => {
    expect(GROUNDED_DEFERRAL).toContain(OREGON_PORTAL_URL);
  });

  it("the infrastructure notice still discloses the answer is incomplete", () => {
    expect(FAILURE_NOTICE).toMatch(/incomplete/i);
  });

  it("no reader-facing notice speaks as the Governor", () => {
    for (const [name, text] of [
      ["GROUNDED_DEFERRAL", GROUNDED_DEFERRAL],
      ["FAILURE_NOTICE", FAILURE_NOTICE],
      ["PROVENANCE_NOTICE", PROVENANCE_NOTICE],
    ] as const) {
      const lower = text.toLowerCase();
      for (const form of IMPERSONATION_FORMS) {
        expect(lower, `${name} must not speak as the Governor`).not.toContain(form);
      }
    }
  });

  it("the deferral and the provenance notice speak as the avatar", () => {
    for (const text of [GROUNDED_DEFERRAL, PROVENANCE_NOTICE]) {
      expect(AVATAR_FRAME.some((f) => text.toLowerCase().includes(f))).toBe(true);
    }
  });
});

describe("refusal is proportionate — fabrication stops an answer, a missed citation does not", () => {
  it("releases a faithful quotation whose citation the matcher did not recognise", () => {
    // Refusing these suppressed correct answers on the first live runs: the words
    // ARE the record's, so no reader is misdirected to a document that lacks
    // them — which is the harm the refusal exists to prevent.
    return (async () => {
      const events = await collect([
        `${frame}, the record says. `,
        'Somewhere in the papers: "',
        "do hereby order that the State address",
        '". That is it.',
      ]);
      const text = said(events);
      expect(text).toContain("do hereby order that the State address");
      expect(text).not.toContain(PROVENANCE_NOTICE);
    })();
  });

  it("still refuses words that are in no passage at all", async () => {
    const events = await collect([
      `${frame}, the record says. `,
      'Somewhere in the papers: "',
      "a 13% rise in unsheltered homelessness",
      '".',
    ]);
    expect(said(events)).toContain(PROVENANCE_NOTICE);
  });
});
