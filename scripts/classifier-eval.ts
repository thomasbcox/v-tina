/**
 * Measures the classifier's routing against the question set (FEAT-1).
 *
 *   npm run eval:classifier
 *
 * Asks every question in `classifier-questions.ts` `RUNS_PER_QUESTION` times
 * through the **production** classifier — `createChatDeps(...).classify`, with its
 * real deadline, retries and exact-match parse — so what is measured is what
 * ships, not a copy of it. Needs the live Fireworks key; costs a few minutes and a
 * few cents, which is why it is an operator command and not part of the gate.
 *
 * Every run appends one receipt to `RECEIPT_LOG`, **pass or fail**, and exits
 * non-zero on any threshold miss. Commit the log after every run: a failed run
 * left out of the history is exactly what the append-only log exists to prevent.
 * Then paste the printed block into the README's "Classifier reliability"
 * section — a test holds the README equal to the latest receipt.
 */
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createChatDeps } from "../src/lib/chat/deps";
import { getEdgeEnv } from "../src/lib/env";
import { CLASSIFIER_MODEL } from "../src/lib/fireworks";
import {
  EXPECTED_LABEL,
  NO_VERDICT,
  QUESTIONS,
  RECEIPT_LOG,
  RUNS_PER_QUESTION,
  classifierFingerprint,
  meetsThreshold,
  renderReceipt,
  type QuestionResult,
  type Receipt,
} from "./classifier-questions";

/** Concurrent classifier calls. Enough to finish in minutes, few enough not to
 *  trip the provider's rate limit and turn the measurement into one of timeouts. */
const CONCURRENCY = 4;

/** Loaded the way `ingest-corpus.ts` does, for the same reason: a standalone script
 *  gets no `.env.local` from Next.js, and a variable already set must win. */
function loadLocalEnv(path = ".env.local"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

async function main(): Promise<void> {
  loadLocalEnv();
  const { classify } = createChatDeps(getEdgeEnv());

  const jobs = QUESTIONS.flatMap((q, qi) => Array.from({ length: RUNS_PER_QUESTION }, () => qi));
  const outcomes: string[][] = QUESTIONS.map(() => []);
  const reasons = new Map<string, number>();
  let next = 0;

  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const qi = jobs[next++];
      const verdict = await classify(QUESTIONS[qi].question);
      if (verdict.ok) {
        outcomes[qi].push(verdict.classification);
      } else {
        outcomes[qi].push(NO_VERDICT);
        reasons.set(verdict.reason, (reasons.get(verdict.reason) ?? 0) + 1);
      }
      process.stdout.write(".");
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write("\n\n");

  const results: QuestionResult[] = QUESTIONS.map((q, qi) => {
    const expected = EXPECTED_LABEL[q.expect];
    const misses: Record<string, number> = {};
    let correct = 0;
    for (const outcome of outcomes[qi]) {
      if (outcome === expected) correct++;
      else misses[outcome] = (misses[outcome] ?? 0) + 1;
    }
    return { question: q.question, expect: q.expect, correct, runs: outcomes[qi].length, misses };
  });

  const receipt: Receipt = {
    date: new Date().toISOString().slice(0, 10),
    fingerprint: classifierFingerprint(),
    model: CLASSIFIER_MODEL,
    runsPerQuestion: RUNS_PER_QUESTION,
    results,
    passed: results.every(meetsThreshold),
  };

  mkdirSync(dirname(RECEIPT_LOG), { recursive: true });
  appendFileSync(RECEIPT_LOG, `${JSON.stringify(receipt)}\n`);

  process.stdout.write(`${renderReceipt(receipt)}\n\n`);
  for (const [reason, n] of reasons) process.stdout.write(`no verdict ×${n}: ${reason}\n`);
  process.stdout.write(`receipt appended to ${RECEIPT_LOG} — commit it, pass or fail\n`);
  if (!receipt.passed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
