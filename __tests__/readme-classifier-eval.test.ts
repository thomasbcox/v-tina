import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NO_VERDICT,
  QUESTIONS,
  TIMEOUT,
  countedCorrect,
  README_RECEIPT_END,
  README_RECEIPT_START,
  RECEIPT_LOG,
  classifierFingerprint,
  meetsThreshold,
  parseReceipts,
  renderReceipt,
} from "../scripts/classifier-questions";

const ROOT = resolve(__dirname, "..");
const README = readFileSync(resolve(ROOT, "README.md"), "utf8");
const SECTION = (README.split("### Classifier reliability")[1] ?? "").split(/\n##+ /)[0];
const PUBLISHED = SECTION.split(README_RECEIPT_START)[1]?.split(README_RECEIPT_END)[0];
const LOG_PATH = resolve(ROOT, RECEIPT_LOG);
const receipts = existsSync(LOG_PATH) ? parseReceipts(readFileSync(LOG_PATH, "utf8")) : [];
const latest = receipts.at(-1);

describe("AC6 — the published routing reliability is a real measurement of the code that ships", () => {
  it("has a receipt log written by the measuring command", () => {
    expect(latest, `${RECEIPT_LOG} holds no receipt — run npm run eval:classifier`).toBeDefined();
  });

  it("the latest receipt was measured on exactly this instruction, model, question set and thresholds", () => {
    // A mismatch means something the numbers depend on changed after they were
    // measured. The fix is a new run, never an edited receipt.
    expect(latest?.fingerprint, "re-measure: npm run eval:classifier").toBe(classifierFingerprint());
  });

  it("the latest receipt covers every question in the set, once", () => {
    // Derived from the authoritative list, not from the receipt's own copy, so a
    // receipt that silently skipped a question cannot pass.
    expect(latest?.results.map((r) => r.question)).toEqual(QUESTIONS.map((q) => q.question));
  });

  it("the latest receipt met every threshold", () => {
    // Recomputed from the counts rather than trusting the receipt's own flag.
    const failing = (latest?.results ?? []).filter((r) => !meetsThreshold(r)).map((r) => r.question);
    expect(failing, "questions below their threshold in the latest run").toEqual([]);
    expect(latest?.passed).toBe(true);
  });

  it("the README publishes the latest receipt exactly, and nothing else between its markers", () => {
    // Equality, not containment: a stale table left beside the current one must
    // fail (approach review round b912bb7).
    expect(SECTION, "the README has no Classifier reliability section").not.toBe("");
    expect(PUBLISHED, "the README has no receipt markers").toBeDefined();
    expect(latest).toBeDefined();
    expect(PUBLISHED?.trim()).toBe(renderReceipt(latest!));
  });

  it("the README limits the claim to the questions listed", () => {
    expect(SECTION).toMatch(/describe (only )?(these|the listed) questions/i);
  });
});

describe("AC6 — a receipt cannot carry impossible or mis-credited evidence", () => {
  const line = (result: object) =>
    JSON.stringify({
      date: "2026-09-25",
      fingerprint: "0123456789ab",
      model: "m",
      runsPerQuestion: 20,
      results: [result],
      passed: true,
    });

  it("refuses a result whose outcomes do not add up to its runs", () => {
    const impossible = { question: "q", expect: "must-decline", correct: 20, runs: 20, misses: { [NO_VERDICT]: 20 } };
    expect(() => parseReceipts(line(impossible))).toThrow(/correct plus misses must equal runs/);
  });

  it("refuses causes that do not add up to the runs with no verdict", () => {
    const r = { question: "q", expect: "must-decline", correct: 19, runs: 20, misses: { [TIMEOUT]: 1 }, noVerdictReasons: { a: 2 } };
    expect(() => parseReceipts(line(r))).toThrow(/causes must add up/);
  });

  it("credits a deadline miss as a decline on a control, and nothing else", () => {
    const control = { question: "q", expect: "must-decline" as const, correct: 18, runs: 20 };
    expect(countedCorrect({ ...control, misses: { [TIMEOUT]: 2 } })).toBe(20);
    expect(countedCorrect({ ...control, misses: { [NO_VERDICT]: 2 } })).toBe(18);
    const answer = { question: "q", expect: "must-answer" as const, correct: 18, runs: 20 };
    expect(countedCorrect({ ...answer, misses: { [TIMEOUT]: 2 } })).toBe(18);
  });
});
