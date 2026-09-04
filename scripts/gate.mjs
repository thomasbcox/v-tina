#!/usr/bin/env node
/**
 * The gate. Runs every check, then reports.
 *
 * Deliberately NOT `a && b && c`: chaining stops at the first failure, so one
 * broken check hides the state of the others. Every check runs; the exit code is
 * non-zero if any failed.
 */
import { spawnSync } from "node:child_process";

// Each entry names a script defined in package.json rather than restating its
// command, so there is one definition per check. Running them through `npm run`
// also resolves the project's own installed binaries instead of reaching for the
// registry when one is missing.
const CHECKS = ["typecheck", "lint", "test"];

const failed = [];
for (const name of CHECKS) {
  process.stdout.write(`\n=== gate: ${name} ===\n`);
  const r = spawnSync("npm", ["run", "--silent", name], { stdio: "inherit" });
  if (r.status !== 0) failed.push(name);
}

process.stdout.write("\n=== gate summary ===\n");
for (const name of CHECKS) {
  process.stdout.write(`  ${failed.includes(name) ? "FAIL" : "pass"}  ${name}\n`);
}
if (failed.length > 0) {
  process.stdout.write(`\ngate FAILED: ${failed.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write("\ngate passed\n");
