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
 * Every run that measures appends one receipt to `RECEIPT_LOG`, **pass or fail**,
 * and exits non-zero on any threshold miss. A run that fails before asking
 * anything — missing credentials, say — appends nothing: it measured nothing.
 * Commit the log after every run: a failed run left out of the history is exactly
 * what the append-only log exists to prevent. Then paste the printed block
 * between the README's receipt markers in "Classifier reliability" — a test holds
 * that block equal to the latest receipt.
 *
 * A non-verdict is recorded as `TIMEOUT` when the call used the whole
 * classification deadline, judged by elapsed time rather than by the wording of
 * an error, and as `NO_VERDICT` otherwise. Each one's stated cause is kept in the
 * receipt.
 */
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createChatDeps } from "../src/lib/chat/deps";
import { getEdgeEnv } from "../src/lib/env";
import { CLASSIFIER_MODEL } from "../src/lib/fireworks";
import { CLASSIFY_DEADLINE_MS } from "../src/lib/safety";
import {
  EXPECTED_LABEL,
  CONCURRENT_CALLS,
  NO_VERDICT,
  QUESTIONS,
  TIMEOUT,
  RECEIPT_LOG,
  RUNS_PER_QUESTION,
  classifierFingerprint,
  meetsThreshold,
  renderReceipt,
  type QuestionResult,
  type Receipt,
} from "./classifier-questions";

/** Loaded the way `ingest-corpus.ts` does, for the same reason: a standalone script
 *  gets no `.env.local` from Next.js, and a variable already set must win. */
function loadLocalEnv(path = ".env.local"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

/** The operator's calendar date. `toISOString` would give UTC, stamping a
 *  late-evening run with tomorrow (correctness review round b912bb7). */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const { classify } = createChatDeps(getEdgeEnv());

  const jobs = QUESTIONS.flatMap((q, qi) => Array.from({ length: RUNS_PER_QUESTION }, () => qi));
  const outcomes: string[][] = QUESTIONS.map(() => []);
  const reasons: Record<string, number>[] = QUESTIONS.map(() => ({}));
  let next = 0;

  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const qi = jobs[next++];
      const started = Date.now();
      const verdict = await classify(QUESTIONS[qi].question);
      if (verdict.ok) {
        outcomes[qi].push(verdict.classification);
      } else {
        outcomes[qi].push(Date.now() - started >= CLASSIFY_DEADLINE_MS ? TIMEOUT : NO_VERDICT);
        reasons[qi][verdict.reason] = (reasons[qi][verdict.reason] ?? 0) + 1;
      }
      process.stdout.write(".");
    }
  }
  await Promise.all(Array.from({ length: CONCURRENT_CALLS }, worker));
  process.stdout.write("\n\n");

  const results: QuestionResult[] = QUESTIONS.map((q, qi) => {
    const expected = EXPECTED_LABEL[q.expect];
    const misses: Record<string, number> = {};
    let correct = 0;
    for (const outcome of outcomes[qi]) {
      if (outcome === expected) correct++;
      else misses[outcome] = (misses[outcome] ?? 0) + 1;
    }
    const noVerdictReasons = reasons[qi];
    return {
      question: q.question,
      expect: q.expect,
      correct,
      runs: outcomes[qi].length,
      misses,
      ...(Object.keys(noVerdictReasons).length > 0 && { noVerdictReasons }),
    };
  });

  const receipt: Receipt = {
    date: localDate(new Date()),
    fingerprint: classifierFingerprint(),
    model: CLASSIFIER_MODEL,
    runsPerQuestion: RUNS_PER_QUESTION,
    results,
    passed: results.every(meetsThreshold),
  };

  mkdirSync(dirname(RECEIPT_LOG), { recursive: true });
  appendFileSync(RECEIPT_LOG, `${JSON.stringify(receipt)}\n`);

  process.stdout.write(`${renderReceipt(receipt)}\n\n`);
  for (const [qi, byReason] of reasons.entries()) {
    for (const [reason, n] of Object.entries(byReason)) {
      process.stdout.write(`no verdict ×${n} (${QUESTIONS[qi].question}): ${reason}\n`);
    }
  }
  process.stdout.write(`receipt appended to ${RECEIPT_LOG} — commit it, pass or fail\n`);
  if (!receipt.passed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
