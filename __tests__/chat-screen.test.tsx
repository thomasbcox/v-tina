// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatStreamEvent, RetrievedPolicyChunk } from "../src/types";
import RootLayout from "../src/app/layout";
import { ChatScreen } from "../src/components/ChatScreen";
import { Transcript } from "../src/components/Transcript";
import { newTurn, reduceTurn, type Turn } from "../src/lib/chat/client";
import { orchestrateChat, type ChatDeps } from "../src/lib/chat/orchestrate";
import { encodeEvent } from "../src/lib/chat/stream";
import {
  ANSWER_LABEL,
  AVATAR_NOTICE,
  CONNECTION_NOTICE,
  EXCHANGE_LABEL,
  INCOMPLETE_MARK,
  NOTICE_HEADINGS,
  QUESTION_LABEL,
  REWORDING_LABEL,
  SEND_LABEL,
  SOURCES_HEADING,
  WAITING_LABEL,
  WAITING_NOTICE,
} from "../src/lib/copy";
import { FAILURE_NOTICE, GROUNDED_DEFERRAL, PROVENANCE_NOTICE } from "../src/lib/prompts";
import { DISPLAY_FRAME } from "../src/lib/voice";

/**
 * Story `chat-screen`: what the reader sees. Testing Library under jsdom (ratified at
 * the frame consult, option B), except AC1, which renders the real root layout to
 * static markup because a document element cannot be mounted inside a jsdom container.
 *
 * The question and answer regions are found by exposed role and name — what a browser
 * actually announces — not by attribute (approach review, round d2e7d11, finding 3).
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const O = "“";
const C = "”";
const EO_TEXT =
  "NOW, THEREFORE, I, TINA KOTEK, Governor of the State of Oregon, do hereby order that the State " +
  "address unsheltered homelessness as an emergency.";

function chunk(n: number, over: Partial<RetrievedPolicyChunk["source"]> = {}, content = `passage number ${n}`): RetrievedPolicyChunk {
  return {
    id: `chunk-${n}`,
    content,
    chunkIndex: n,
    source: {
      documentTitle: `EO 2${n}-0${n}: An order`,
      date: `202${n}-01-0${n}`,
      url: `https://www.oregon.gov/gov/eo/eo-2${n}-0${n}.pdf`,
      pillar: "housing-and-homelessness",
      documentKind: "executive",
      ...over,
    },
    similarity: 0.8,
  };
}

const EO_CHUNK = chunk(3, { documentTitle: "EO 23-02: Declaring State of Emergency", url: "https://www.oregon.gov/gov/eo/eo-23-02.pdf" }, EO_TEXT);

const AUDIT: ChatStreamEvent = { type: "audit_log_status", recorded: false };

function turnOf(id: number, question: string, events: ChatStreamEvent[]): Turn {
  return events.reduce(reduceTurn, newTurn(id, question));
}

/** The records the real orchestrator emits for `answer`, with fake collaborators. */
async function realRecords(answer: () => AsyncGenerator<string>, over: Partial<ChatDeps> = {}): Promise<ChatStreamEvent[]> {
  const deps: ChatDeps = {
    classify: async () => ({ ok: true, classification: "IN-BOUNDS" }),
    rewrite: async () => "neutral",
    retrieve: async () => [EO_CHUNK],
    answer,
    logError: () => {},
    ...over,
  };
  const out: ChatStreamEvent[] = [];
  for await (const e of orchestrateChat(deps, { messages: [{ role: "user", content: "A question?" }] })) out.push(e);
  return out;
}

const grounded = turnOf(1, "What does the order say?", [
  { type: "safety_status", classification: "IN-BOUNDS" },
  { type: "retrieved_chunks", chunks: [EO_CHUNK] },
  { type: "streamed_tokens", text: `${DISPLAY_FRAME}, the record says: ${O}do hereby order${C}.` },
  AUDIT,
]);

const midAnswer = turnOf(1, "What does the order say?", [
  { type: "safety_status", classification: "IN-BOUNDS" },
  { type: "retrieved_chunks", chunks: [EO_CHUNK] },
  { type: "streamed_tokens", text: `${DISPLAY_FRAME}, the record` },
]);

/** The regions a browser exposes, by the name a reader hears. */
const answerRegion = () => screen.getByRole("region", { name: ANSWER_LABEL });
const answerRegions = () => screen.getAllByRole("region", { name: ANSWER_LABEL });
const exchange = (n: number) => screen.getByRole("article", { name: `${EXCHANGE_LABEL} ${n}` });

/** React escapes an apostrophe in static markup; compare against the text. */
const unescape = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("AC1 — the avatar notice is above and below the screen in every state", () => {
  const states: Array<[string, Turn[]]> = [
    ["before any question", []],
    ["mid-answer", [midAnswer]],
    ["after an answer", [grounded]],
  ];
  for (const [name, turns] of states) {
    it(name, () => {
      const html = unescape(
        renderToStaticMarkup(
          <RootLayout>
            <ChatScreen initialTurns={turns} />
          </RootLayout>,
        ),
      );
      const main = html.indexOf("<main");
      const mainEnd = html.indexOf("</main>");
      expect(main).toBeGreaterThan(0);
      const first = html.indexOf(AVATAR_NOTICE);
      const last = html.lastIndexOf(AVATAR_NOTICE);
      expect(first, "the notice must be present").toBeGreaterThan(0);
      expect(first, "once before the transcript").toBeLessThan(main);
      expect(last, "and once after it").toBeGreaterThan(mainEnd);
      expect(html.split(AVATAR_NOTICE).length - 1, "exactly twice").toBe(2);
      // Neither renders empty: the text sits inside its own element.
      expect(html).toMatch(new RegExp(`<aside[^>]*>${escapeRe(AVATAR_NOTICE)}</aside>[\\s\\S]*<aside[^>]*>${escapeRe(AVATAR_NOTICE)}</aside>`));
    });
  }
});

describe("AC3 — the waiting line, until the first words", () => {
  it("shows the waiting text under its own label while nothing has arrived", () => {
    render(<Transcript turns={[newTurn(1, "A question?")]} />);
    const waiting = screen.getByRole("status", { name: WAITING_LABEL });
    expect(waiting.textContent).toContain(WAITING_NOTICE);
    expect(screen.queryByRole("region", { name: ANSWER_LABEL }), "no answer region yet, so nothing to confuse it with").toBeNull();
    expect(within(screen.getByRole("region", { name: QUESTION_LABEL })).getByText("A question?")).toBeTruthy();
  });

  it("stays through the verdict and the passages, and goes with the first words", () => {
    // Live, 2026-10-03: the verdict and the passages arrived at about one second and
    // the first word after twenty. A wait that ended with the first record left the
    // reader looking at a Sources list with no answer and no explanation.
    const beforeWords = [
      { type: "safety_status", classification: "IN-BOUNDS" } as ChatStreamEvent,
      { type: "retrieved_chunks", chunks: [EO_CHUNK] } as ChatStreamEvent,
    ].reduce(reduceTurn, newTurn(1, "A question?"));
    const { unmount } = render(<Transcript turns={[beforeWords]} />);
    expect(screen.getByRole("status", { name: WAITING_LABEL }).textContent).toContain(WAITING_NOTICE);
    expect(screen.queryByRole("heading", { name: SOURCES_HEADING }), "the sources follow the answer, not precede it").toBeNull();
    unmount();

    const firstWords = reduceTurn(beforeWords, { type: "streamed_tokens", text: `${DISPLAY_FRAME}, the` });
    render(<Transcript turns={[firstWords]} />);
    expect(screen.queryByRole("status", { name: WAITING_LABEL })).toBeNull();
    expect(screen.queryByText(WAITING_NOTICE)).toBeNull();
    screen.getByRole("heading", { name: SOURCES_HEADING });
  });

  it("is never inside the answer's region", () => {
    render(<Transcript turns={[newTurn(1, "A question?"), grounded]} />);
    const waiting = screen.getByRole("status", { name: WAITING_LABEL });
    for (const answer of answerRegions()) expect(answer.contains(waiting)).toBe(false);
  });

  it("the new exchange is brought into view when it is sent", async () => {
    // Found live: a second question rendered below the fold, behind the input, and
    // "appears in the transcript" was true only of the markup. jsdom has no
    // scrollIntoView, so the call is observed rather than its effect.
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const service = fakeService();
    vi.stubGlobal("fetch", service.fetch);
    render(<ChatScreen />);
    ask("A question?");
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
    const target = scrolled.mock.contexts[scrolled.mock.contexts.length - 1] as Element;
    expect(target.getAttribute("aria-label")).toBe(`${EXCHANGE_LABEL} 1`);
    service.close();
  });
});

describe("AC5 — the sources list names each document once, linked, dated, passages readable", () => {
  const sameTitle = "EO 23-02";
  const turn = turnOf(1, "q", [
    { type: "safety_status", classification: "IN-BOUNDS" },
    {
      type: "retrieved_chunks",
      chunks: [
        chunk(1, { documentTitle: sameTitle, url: "https://www.oregon.gov/gov/eo/eo-23-02.pdf" }, "the first passage of the order"),
        chunk(2, { documentTitle: "HB 2001", url: "https://olis.oregonlegislature.gov/hb2001", documentKind: "legislative" }, "a passage of the bill"),
        chunk(3, { documentTitle: sameTitle, url: "https://www.oregon.gov/gov/eo/eo-23-02.pdf" }, "the second passage of the order"),
        chunk(4, { documentTitle: sameTitle, url: "https://www.oregon.gov/gov/eo/eo-23-02-amended.pdf" }, "the amended order's passage"),
      ],
    },
    { type: "streamed_tokens", text: `${DISPLAY_FRAME}, here is the record.` },
    AUDIT,
  ]);

  it("one entry per document, by address, with every passage present", () => {
    render(<Transcript turns={[turn]} />);
    screen.getByRole("heading", { name: SOURCES_HEADING });
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://www.oregon.gov/gov/eo/eo-23-02.pdf",
      "https://olis.oregonlegislature.gov/hb2001",
      "https://www.oregon.gov/gov/eo/eo-23-02-amended.pdf",
    ]);
    expect(links.map((a) => a.textContent)).toEqual([sameTitle, "HB 2001", sameTitle]);
    for (const date of ["2021-01-01", "2022-01-02", "2024-01-04"]) expect(screen.getByText(new RegExp(date))).toBeTruthy();
    for (const passage of [
      "the first passage of the order",
      "the second passage of the order",
      "a passage of the bill",
      "the amended order's passage",
    ]) {
      expect(screen.getByText(passage), passage).toBeTruthy();
    }
  });

  it("an earlier turn's sources never appear under a later turn", () => {
    const later = turnOf(2, "and then?", [{ type: "safety_status", classification: "IN-BOUNDS" }]);
    render(<Transcript turns={[turn, later]} />);
    within(exchange(1)).getByRole("heading", { name: SOURCES_HEADING });
    expect(within(exchange(2)).queryByRole("heading", { name: SOURCES_HEADING })).toBeNull();
    expect(within(exchange(2)).queryByRole("link")).toBeNull();
  });
});

describe("AC6 — the neutral rewording is shown, once, under the turn it belongs to", () => {
  it("labelled, before the answer, and not on the next turn", () => {
    const partisan = turnOf(1, "Why does the Governor keep wasting money?", [
      { type: "safety_status", classification: "PARTISAN-TRAP", neutralisedQuestion: "What is the rationale for the spending?" },
      { type: "retrieved_chunks", chunks: [EO_CHUNK] },
      { type: "streamed_tokens", text: `${DISPLAY_FRAME}, the record states its rationale.` },
      AUDIT,
    ]);
    const plain = turnOf(2, "What about education?", [
      { type: "safety_status", classification: "IN-BOUNDS" },
      { type: "retrieved_chunks", chunks: [EO_CHUNK] },
      { type: "streamed_tokens", text: `${DISPLAY_FRAME}, on education the record says this.` },
      AUDIT,
    ]);
    render(<Transcript turns={[partisan, plain]} />);

    const labels = screen.getAllByText(REWORDING_LABEL);
    expect(labels, "exactly one rewording label on the page").toHaveLength(1);
    const first = exchange(1);
    const second = exchange(2);
    expect(first.contains(labels[0])).toBe(true);
    expect(within(first).getByText(/What is the rationale for the spending\?/)).toBeTruthy();
    expect(within(second).queryByText(REWORDING_LABEL)).toBeNull();

    const answer = within(first).getByRole("region", { name: ANSWER_LABEL });
    const order = labels[0].compareDocumentPosition(answer);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING, "the rewording comes before the answer").toBeTruthy();
  });
});

describe("AC7 — a declined question shows the deferral and no sources at all", () => {
  it("not even a heading", () => {
    const declined = turnOf(1, "Who should I vote for?", [
      { type: "safety_status", classification: "OUT-OF-BOUNDS" },
      { type: "streamed_tokens", text: GROUNDED_DEFERRAL },
      AUDIT,
    ]);
    const ungrounded = turnOf(2, "Highway funding?", [
      { type: "safety_status", classification: "IN-BOUNDS" },
      { type: "retrieved_chunks", chunks: [] },
      { type: "streamed_tokens", text: GROUNDED_DEFERRAL },
      AUDIT,
    ]);
    render(<Transcript turns={[declined, ungrounded]} />);
    expect(screen.queryByRole("heading", { name: SOURCES_HEADING })).toBeNull();
    expect(screen.queryByText(SOURCES_HEADING)).toBeNull();
    expect(answerRegions()).toHaveLength(2);
    for (const answer of answerRegions()) expect(answer.textContent).toContain(GROUNDED_DEFERRAL);
  });
});

/** The checks AC8, AC9 and AC10 share: the notice apart, the mark at the answer's end. */
function expectSetApart(heading: string, noticeText: string) {
  const answer = answerRegion();
  const notice = screen.getByRole("status", { name: heading });
  expect(within(notice).getByRole("heading").textContent).toBe(heading);
  expect(notice.textContent).toContain(noticeText);
  expect(answer.contains(notice), "the notice is outside the answer's region").toBe(false);
  expect(answer.textContent, "none of the notice's words inside the answer").not.toContain(noticeText);
  expect(answer.textContent?.trimEnd().endsWith(INCOMPLETE_MARK), "the mark is visible text at the answer's end").toBe(true);
  expect(answer.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING, "the notice follows the answer").toBeTruthy();
  // The mark comes from text, not from an attribute a sighted reader never sees.
  expect(within(answer).getByText(INCOMPLETE_MARK)).toBeTruthy();
}

describe("AC8 — a stop by the quotation screen is a notice apart from the answer", () => {
  it("against the real emitter", async () => {
    const records = await realRecords(async function* () {
      yield `${DISPLAY_FRAME}, the record is clear. `;
      yield `Under EO 23-02: ${O}words in no passage${C}. That is all.`;
    });
    expect(records.some((e) => e.type === "notice" && e.kind === "provenance"), "the fixture is a real refusal").toBe(true);
    const turn = records.reduce(reduceTurn, newTurn(1, "A question?"));
    render(<Transcript turns={[turn]} />);
    expectSetApart(NOTICE_HEADINGS.provenance, PROVENANCE_NOTICE);
    expect(answerRegion().textContent).not.toContain("words in no passage");
  });

  it("before the first word: the answer region still shows where it stopped", async () => {
    // Correctness review, round d2e7d11, finding 5. The opening itself carries the
    // bad quotation, so the screen refuses before releasing a single word.
    const records = await realRecords(async function* () {
      yield `${DISPLAY_FRAME}, under EO 23-02: ${O}words in no passage${C}. That is all.`;
    });
    expect(records.some((e) => e.type === "streamed_tokens"), "the fixture releases no words").toBe(false);
    expect(records.some((e) => e.type === "notice"), "and refuses on provenance").toBe(true);
    const turn = records.reduce(reduceTurn, newTurn(1, "A question?"));
    render(<Transcript turns={[turn]} />);
    expectSetApart(NOTICE_HEADINGS.provenance, PROVENANCE_NOTICE);
  });
});

describe("AC9 — a failure mid-answer is a notice apart from the answer", () => {
  it("against the real emitter", async () => {
    const records = await realRecords(async function* () {
      yield `${DISPLAY_FRAME}, here is the record so far. `;
      yield "And then the provider";
      throw new Error("provider closed the connection");
    });
    expect(records.some((e) => e.type === "error"), "the fixture is a real failure").toBe(true);
    const turn = records.reduce(reduceTurn, newTurn(1, "A question?"));
    render(<Transcript turns={[turn]} />);
    expectSetApart(NOTICE_HEADINGS.failure, FAILURE_NOTICE);
    expect(answerRegion().textContent).not.toContain("provider closed");
  });
});

/** A fake service: one response whose body the test feeds by hand. Tolerant of a
 *  stream the screen has already cancelled, which is what a local failure now does. */
function fakeService() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    void init;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  const safely = (f: () => void) => {
    try {
      f();
    } catch {
      // The stream was cancelled by the screen; nothing more can be fed to it.
    }
  };
  return {
    fetch,
    /** The request's cancellation signal, as the screen passed it. */
    signal: () => (fetch.mock.calls[0]?.[1] as RequestInit | undefined)?.signal as AbortSignal,
    send: (event: ChatStreamEvent) => safely(() => controller?.enqueue(encoder.encode(encodeEvent(event)))),
    sendRaw: (text: string) => safely(() => controller?.enqueue(encoder.encode(text))),
    close: () => safely(() => controller?.close()),
  };
}

function ask(text: string) {
  const input = screen.getByRole("textbox", { name: QUESTION_LABEL }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: SEND_LABEL }));
  return input;
}

describe("AC10 — through the mounted screen: a stream cut short, and an unreadable record", () => {
  it("a stream that ends without its final record shows the connection notice, apart, and ends the request", async () => {
    const service = fakeService();
    vi.stubGlobal("fetch", service.fetch);
    render(<ChatScreen />);
    ask("What does the order say?");
    await waitFor(() => expect(service.fetch).toHaveBeenCalledTimes(1));
    service.send({ type: "safety_status", classification: "IN-BOUNDS" });
    service.send({ type: "retrieved_chunks", chunks: [EO_CHUNK] });
    service.send({ type: "streamed_tokens", text: `${DISPLAY_FRAME}, the record says` });
    await waitFor(() => expect(answerRegion().textContent).toContain("the record says"));
    service.close();
    await waitFor(() => screen.getByRole("status", { name: NOTICE_HEADINGS.connection }));
    expectSetApart(NOTICE_HEADINGS.connection, CONNECTION_NOTICE);
    // Approach review, round d2e7d11, finding 2: a turn the screen ended tells the
    // server the reader is gone.
    expect(service.signal().aborted, "the request is aborted").toBe(true);
  });

  it("a record that cannot be read ends the answer with the connection notice, keeps what arrived, aborts, and logs the cause", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = fakeService();
    vi.stubGlobal("fetch", service.fetch);
    render(<ChatScreen />);
    ask("What does the order say?");
    await waitFor(() => expect(service.fetch).toHaveBeenCalledTimes(1));
    service.send({ type: "safety_status", classification: "IN-BOUNDS" });
    service.send({ type: "streamed_tokens", text: `${DISPLAY_FRAME}, the words that arrived` });
    await waitFor(() => expect(answerRegion().textContent).toContain("the words that arrived"));
    service.sendRaw('data: {"type":"something-else"}\n\n');
    service.send({ type: "streamed_tokens", text: " and words after the bad record" });
    await waitFor(() => screen.getByRole("status", { name: NOTICE_HEADINGS.connection }));
    expectSetApart(NOTICE_HEADINGS.connection, CONNECTION_NOTICE);
    expect(answerRegion().textContent).not.toContain("words after the bad record");
    expect(service.signal().aborted, "the request is aborted").toBe(true);
    // Hidden-failure review, round d2e7d11: the cause reaches the console, and carries
    // the schema's objection as `cause`, so a systemic failure is diagnosable.
    expect(logged).toHaveBeenCalledWith(
      "chat request failed",
      expect.objectContaining({ message: expect.stringContaining("not a declared record"), cause: expect.anything() }),
    );
    service.close();
  });

  it("an unreadable record before the first word still marks the answer", async () => {
    // Correctness review, round d2e7d11, finding 5, the other case.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const service = fakeService();
    vi.stubGlobal("fetch", service.fetch);
    render(<ChatScreen />);
    ask("What does the order say?");
    await waitFor(() => expect(service.fetch).toHaveBeenCalledTimes(1));
    service.send({ type: "safety_status", classification: "IN-BOUNDS" });
    service.sendRaw("data: {not json\n\n");
    await waitFor(() => screen.getByRole("status", { name: NOTICE_HEADINGS.connection }));
    expectSetApart(NOTICE_HEADINGS.connection, CONNECTION_NOTICE);
    expect(screen.queryByRole("status", { name: WAITING_LABEL }), "the wait is over").toBeNull();
  });
});

describe("AC11 — one question at a time, by the button and by the keyboard", () => {
  it("a second question goes nowhere until the first answer ends", async () => {
    const service = fakeService();
    vi.stubGlobal("fetch", service.fetch);
    render(<ChatScreen />);
    const input = ask("first question");
    await waitFor(() => expect(service.fetch).toHaveBeenCalledTimes(1));
    const button = screen.getByRole("button", { name: SEND_LABEL }) as HTMLButtonElement;

    // A second question, typed while the first is in progress.
    fireEvent.change(input, { target: { value: "second question" } });
    expect(button.disabled, "the control is unavailable").toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(button);
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await new Promise((r) => setTimeout(r, 20));
    expect(service.fetch, "nothing was sent").toHaveBeenCalledTimes(1);

    // Correctness review, round d2e7d11, finding 3: a stop notice arrives, the final
    // record has not — the gate stays shut in that interval.
    service.send({ type: "safety_status", classification: "IN-BOUNDS" });
    service.send({ type: "streamed_tokens", text: `${DISPLAY_FRAME}, the record.` });
    service.send({ type: "notice", kind: "provenance", text: PROVENANCE_NOTICE });
    await waitFor(() => screen.getByRole("status", { name: NOTICE_HEADINGS.provenance }));
    expect(button.disabled, "a notice does not open the gate").toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    await new Promise((r) => setTimeout(r, 20));
    expect(service.fetch).toHaveBeenCalledTimes(1);

    // The final record ends the exchange; the control comes back; Enter sends.
    service.send(AUDIT);
    service.close();
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(service.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole("region", { name: QUESTION_LABEL })).toHaveLength(2);
  });
});
