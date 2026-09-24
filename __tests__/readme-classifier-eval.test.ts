import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUESTIONS,
  RECEIPT_LOG,
  classifierFingerprint,
  meetsThreshold,
  parseReceipts,
  renderReceipt,
} from "../scripts/classifier-questions";

const ROOT = resolve(__dirname, "..");
const README = readFileSync(resolve(ROOT, "README.md"), "utf8");
const SECTION = (README.split("### Classifier reliability")[1] ?? "").split(/\n##+ /)[0];
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

  it("the README publishes the latest receipt exactly", () => {
    expect(SECTION, "the README has no Classifier reliability section").not.toBe("");
    expect(latest).toBeDefined();
    expect(SECTION).toContain(renderReceipt(latest!));
  });

  it("the README limits the claim to the questions listed", () => {
    expect(SECTION).toMatch(/describe (only )?(these|the listed) questions/i);
  });
});
