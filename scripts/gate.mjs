#!/usr/bin/env node
/**
 * The gate. Runs every check, then reports.
 *
 * Deliberately NOT `a && b && c`: chaining stops at the first failure, so one
 * broken check hides the state of the others. Every check runs; the exit code is
 * non-zero if any failed.
 */
import { spawnSync } from "node:child_process";

const CHECKS = [
  ["typecheck", "npx", ["tsc", "--noEmit"]],
  ["lint", "npx", ["eslint", "."]],
  ["test", "npx", ["vitest", "run"]],
];

const failed = [];
for (const [name, cmd, args] of CHECKS) {
  process.stdout.write(`\n=== gate: ${name} ===\n`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) failed.push(name);
}

process.stdout.write("\n=== gate summary ===\n");
for (const [name] of CHECKS) {
  process.stdout.write(`  ${failed.includes(name) ? "FAIL" : "pass"}  ${name}\n`);
}
if (failed.length > 0) {
  process.stdout.write(`\ngate FAILED: ${failed.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write("\ngate passed\n");
