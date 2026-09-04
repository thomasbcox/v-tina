Date: 2026-08-31 · Branch: claude/technology-foundation · Status: approved · Class: deployed

# technology-foundation — stand up the app skeleton, a real gate, and CI

## Problem

`repo-bootstrap` deliberately shipped a **no-op gate**: `.claude/workflow.json` runs an `echo`
that always exits 0. That was the right call when no technology had been chosen, and it is
recorded as such — but it means `/review` step 3 proves nothing and `/frame` step 9 has no
mechanism to demonstrate red against. The 2026-08-30 audit filed the same two gaps as its top
findings: **no test gate** and **no CI**.

`v-tina-user-stories.md` divides the build across five workstreams (database, backend
orchestration, prompts, UI, QA). None can start until the project they all edit exists, and if
each defines its own idea of the data they hand each other — the spec's `PolicyChunk` is passed
from the database workstream to the backend — the pieces will not meet. That collision is
exactly what the five-way split exists to prevent.

The spec's own suite (`npm run test:stress`, User Story 5) queries a **live deployment** with real
credentials. It is a Large test and belongs to the QA workstream; it cannot be this repository's
gate.

## In scope

1. **Project skeleton** — Next.js + TypeScript + Tailwind, laid out in the directories the spec
   already names: `src/app/`, `src/lib/`, `src/components/`, `src/types/`, plus `supabase/`,
   `scripts/` and `__tests__/`. No feature logic.
2. **Shared contracts** — `src/types/index.ts` declaring the boundary types the spec's agent
   contracts already name: `PolicyChunk` (chunk text plus source metadata: title, date, URL,
   policy pillar) and the `/api/chat` stream event union (safety status, retrieved chunks,
   streamed tokens, audit-log status).
3. **`src/lib/env.ts`** — validates the Supabase and Fireworks environment variables at startup
   and fails naming the offending key. Pure, no network, unit-tested.
4. **Vitest** configured, with unit tests covering `env.ts`.
5. **A real gate** — one `npm run gate` composing typecheck (`tsc --noEmit`), lint (`eslint`) and
   the unit suite. `.claude/workflow.json`'s `testCommand` is repointed at it.
6. **CI** — a GitHub Actions workflow running that same gate on push and on pull requests
   targeting `main`.
7. **`.env.example`** — every key `env.ts` requires, with placeholder values. The `.gitignore`
   negation added by `repo-bootstrap` already exempts this one file from the `.env*` ignore.

## Non-goals

- **All five workstreams' logic.** No migrations or ingestion, no prompts, no API routes, no UI
  components, no stress-test runner. This story builds only what they land in.
- **`npm run test:stress`** — Large, needs a live deployment and real credentials. QA workstream.
- **Deployment to Vercel and provisioning Supabase.** No infrastructure is created.
- **A formatting check** and **markdown/link checking** — both declined at step 1. The link
  checker is additionally unrunnable from this session: the tools need Homebrew, which is owned
  by `thomasadmin`.
- **Making the CI check *required* on `main`.** A repo settings change, and see Open questions —
  it would break `/close` as the repo is configured today.

## Acceptance criteria

Criteria 1–3 are observable by a person using the foundation; 4–7 are workflow bookkeeping and
stay as numbered property assertions, per `AGENTS.md`.

1. **Given** a clean checkout with dependencies installed,
   **When** a developer runs the gate command recorded in `.claude/workflow.json`,
   **Then** it runs typecheck, lint and the unit suite, and exits non-zero if any of the three
   fails.

2. **Given** an environment where a required Supabase or Fireworks variable is missing or empty,
   **When** the application starts,
   **Then** startup fails with an error naming every variable at fault,
   **And** with every required variable present and well-formed the application starts normally.

   *Amended 2026-09-01* — previously read "when `src/lib/env.ts` is loaded", which described the
   module rather than the application. That wording is precisely what let the approach pass's
   BLOCKER through: the module was correct and tested while nothing ever loaded it.

3. **Given** a pull request targeting `main`,
   **When** the GitHub Actions workflow runs,
   **Then** it executes the same gate the local `testCommand` runs and reports its pass or fail
   status on that pull request.

4. `.claude/workflow.json`'s `testCommand` invokes the real gate and no longer contains the
   `repo-bootstrap` no-op `echo`.

5. `src/types/index.ts` declares chunk types carrying the source metadata the spec enumerates
   (document title, date, URL, policy pillar), separating a stored chunk from a retrieved one so
   the similarity score is required exactly where the spec requires it, and a stream-event type
   covering all four event kinds the spec's `/api/chat` contract names.

8. The safety classification vocabulary declared in `src/types/index.ts` matches the flags the
   specification's own acceptance criteria assert, in both directions: nothing asserted is
   missing, and nothing is declared that the specification never asserts. *(Added 2026-09-01
   after the round-2 approach review found the declared vocabulary had been paraphrased rather
   than taken from the spec.)*

6. Every environment variable `src/lib/env.ts` requires appears in the tracked `.env.example`.

7. Scope containment: run
   `git diff --name-only main...HEAD -- . ':(exclude)reviews/'`
   and verify no files appear beyond the project skeleton generated for item 1, plus
   `src/types/index.ts`, `src/lib/env.ts`, `__tests__/`, `.env.example`,
   `.github/workflows/`, `.claude/workflow.json`, `.gitignore`, `vitest.config.mts`,
   `scripts/gate.mjs`, `.nvmrc`, `README.md`, `src/instrumentation.ts` and `src/lib/safety.ts`.

## Test notes

The gate is real from this story onward, so criteria 2 and 6 name a **size** and carry a genuine
demonstrate-red obligation at step 9.

| AC | Oracle mode | Mechanism |
|---|---|---|
| 1 | `manual` | Read `testCommand` from `.claude/workflow.json`, run it, confirm all three checks execute. Confirm non-zero exit by breaking one check deliberately. Includes the empty case: a suite with no tests must not be reported as a pass of the whole gate. |
| 2 | `Small` | Unit tests over `env.ts` with no I/O: one case per required variable missing, one per malformed, and the all-present case. The error must name the failing variable, not merely report failure. |
| 3 | `manual` | Open the pull request and read the reported check on it. Cannot be judged locally — it needs GitHub to run the workflow. |
| 4 | `reviewer` | Parse `.claude/workflow.json`; confirm `testCommand` names the gate and that the `repo-bootstrap` echo string is gone. |
| 5 | `reviewer` | Read `src/types/index.ts` against `v-tina-user-stories.md`'s stated contracts and confirm each named field and event kind is present, and that retrieval requires a similarity score while storage does not. |
| 8 | `Small` | A test that extracts the asserted flags from `v-tina-user-stories.md` itself (`flagged as "..."`) and compares them against the declared vocabulary both ways. The extent comes from the specification, not a retyped list, so a spec change forces a contract change. Includes the empty case: the test fails if the pattern stops matching anything, so it cannot pass vacuously. |
| 6 | `Small` | A test that derives the required-variable list **from `env.ts` itself** and asserts each appears in `.env.example`. The extent comes from the module that defines the requirement, so adding a variable without documenting it fails without anyone editing the test. |
| 7 | `reviewer` | Run the enumerated diff command and compare against the listed paths. |

### Regressions (ratified list — sourced from the step-6 design review)

Proposed by the independent reviewer from the criteria, before any implementation existed.
**Every criterion received at least one; there is no coverage gap.** Criteria 2 and 6 name a
size, so step 9 must demonstrate red against their entries here.

**AC1** (oracle: `manual`)

- The gate script chains the three checks with `&&`, so when typecheck fails the lint and unit suite never execute — the exit-code letter holds while the 'runs all three' intent (a full report of what is broken) is violated.
- The gate's exit status reflects only the last command (steps joined with `;`, or an npm script whose intermediate failure is swallowed), so a failing lint followed by a passing test run exits 0 and the failing check is never surfaced.
- The test step is configured to pass when no test files exist (a passWithNoTests-style flag), so 'the unit suite runs' is satisfied by a suite that tests nothing — the deliberate-break check in the test notes passes while the suite is vacuous.

**AC2** (oracle: `Small`)

- Validation checks presence but not emptiness: a variable set to an empty string (or whitespace-only) is accepted as present, so the 'missing or empty' half of the criterion fails silently while every 'variable exists' test is green.
- The error message names the failing variable only incidentally — a dumped env dump, a raw schema-issue blob, or a stack trace in which the key appears among unrelated noise — satisfying 'naming the variable' textually while leaving a developer unable to tell which key is actually at fault.
- The 'well-formed' happy path returns raw, untrimmed strings with no shape check at all, so a placeholder like 'your-key-here' or a URL missing its scheme passes as well-formed — values are returned without raising while being unusable.

**AC3** (oracle: `manual`)

- The workflow restates the three checks inline in YAML instead of invoking the one gate script, so the CI check and the local `testCommand` are two copies that can drift — a check does run and report on the PR (the letter) while 'the same gate' (the intent) is already false on day one.
- The workflow triggers on pull requests to any branch, or only on pushes, so a PR targeting `main` gets no reported check while activity elsewhere shows green — the trigger filter never actually matches the one case the criterion names.
- The gate step's failure is neutralized (continue-on-error, `|| true`, or a missing `npm ci` failure propagation), so the PR always shows a green check regardless of the gate result — the reporting exists but can never report failure.

**AC4** (oracle: `reviewer`)

- `testCommand` is repointed to `npm run gate` and the echo string is removed from `workflow.json`, but the `gate` script in `package.json` itself omits one of the three checks or still contains a vacuous step — the no-op migrated from the config file into the manifest rather than disappearing.

**AC5** (oracle: `reviewer`)

- PolicyChunk declares all four metadata fields as optional, so a chunk lacking title, date, URL and pillar still typechecks — the fields are 'declared' while the contract's intent (every chunk carries complete source metadata for the verification UI) is void.
- The stream-event union nominally has four members but one is a catch-all whose payload is `unknown`/`any`, or the discriminator values do not match the names the `/api/chat` contract uses — all four kinds are 'covered' while real streamed events either fail to narrow or silently match the catch-all.

**AC6** (oracle: `Small`)

- `.env.example` contains every required key but with real-looking credential values instead of placeholders — the file is exempted from the `.env*` ignore, so the completeness letter is satisfied by committing what look like secrets, the exact outcome the ignore family exists to prevent.
- `.env.example` satisfies 'every required variable appears' while accumulating stale keys nothing requires, or documenting a required key under a different name than `env.ts` reads — the one-directional check stays green while the file stops being a usable setup document.

**AC7** (oracle: `reviewer`)

- Every committed path is on the allowlist, but feature logic is smuggled into an allowed file — the chat route or prompt content drafted inside `src/types/index.ts`, or a working component beyond the scaffold under `src/components/` — satisfying the path enumeration while violating the 'no feature logic' intent the containment exists to enforce.
- The generated skeleton keeps the starter template's demo content (the default landing page, sample API route, placeholder assets) unexamined — all paths are 'the project skeleton generated for item 1' by the letter, while shipping demo behavior the story's 'no feature logic' scope meant to exclude.

## Loop record

- frame/6 — ran (codex on kimi-latest, 3 findings, 16 regressions) → reviews/technology-foundation.design.f04cf8d.json
- frame/9 — demonstrated red for every ratified regression on the two size-bearing criteria:
  AC2 (3 regressions) and AC6 (2). Baseline green, each regression red, restored green.
- review/6 — ran (codex on glm-latest, 0 findings — CLEAN) → reviews/technology-foundation.approach.a9eef9c.json
- review/8 — round 4: ran (codex: deepseek-pro-latest correctness / gpt-oss-120b hidden-failure,
  1 / 0 findings) → reviews/technology-foundation.correctness.a9eef9c.json,
  reviews/technology-foundation.hidden-failure.a9eef9c.json. The hidden-failure critic was blocked
  for three attempts by an upstream model failure and completed only after the routing was changed
  off `kimi-latest` on 2026-09-03; the diagnosis is kept below because it explains the gap in the
  record, not because the pass is still missing.
- close/3b — activation observed (review_runner refused to promote, 3x, session-observed);
  judged not novel and no proposal written — see the note below for why neither canned wording
  ('no activation' / 'ran') was accurate here.
- close/4 — presented: re-review or merge; Thomas chose **merge**

**Earlier rounds of this story** (kept as prose, not as record lines: the record holds one line
per step by design, and extra lines break the round-id agreement check `/close` step 3b runs):

- round 1: ran (codex on glm-latest, 2 findings) → reviews/technology-foundation.approach.fbb22d2.json
- round 2: ran (codex on glm-latest, 3 findings) → reviews/technology-foundation.approach.bfc05cf.json
- round 3: ran (codex on glm-latest, 3 findings) → reviews/technology-foundation.approach.4f33c43.json
- round 4: ran (codex on glm-latest, 0 findings — CLEAN) → reviews/technology-foundation.approach.a9eef9c.json

## Open questions

**Resolved at the step-7 consult:** Q1 = **zod** (ratified one-way door); Q3 = **pin, with a
single documented source of truth**. Q2 remains open.

1. ~~**A validation dependency for `env.ts`, or hand-rolled?**~~ — **zod**, decided 2026-08-31. `zod` is the industry-standard way
   to declare and validate a shape like this, is tiny and dependency-free, and would be the
   project's **first runtime dependency choice** — a one-way door, since later stories will copy
   the pattern. Hand-rolling avoids the dependency but reimplements what one declarative
   construct covers, which the best-practice lens flags in the other direction. Needs ratifying.
2. **Should the CI check be made *required* on `main`?** Not in scope as written, and it would
   currently **break `/close`**: `allow_auto_merge` is `false` on this repository, and step 5(a)
   aborts outright when a required check exists while auto-merge is off. If the check is to be
   required, auto-merge must be enabled in the same move.
3. ~~**Node 26 is newer than Next.js's supported range is likely to name.** The toolchain here is
   node v26.7.0. If the scaffold emits an unsupported-engine warning, is that acceptable, or
   should the story pin a supported Node version in CI and document it locally?**~~ — **pin**, decided 2026-08-31.

## Design sketch — HOW

- **Skeleton** — generate with `create-next-app` (TypeScript, Tailwind, App Router, `src/`
  directory, ESLint) rather than hand-assembling config, so the layout matches what the ecosystem
  and the spec both expect. Delete only what is demonstrably unused.
- **`src/types/index.ts`** — plain exported `interface`/`type` declarations, no runtime code and
  no dependency. The stream events are a discriminated union on a `type` field, which is the
  standard shape for the "parse the streamed event" job User Story 4 describes.
- **`src/lib/env.ts`** — one module exporting a validated, typed config object, throwing on first
  invalid variable with the variable named. Whether the check is declared with `zod` or written by
  hand is Open question 1. Loaded once at startup, never re-read per request.
- **Vitest** — `vitest.config.ts` with the default Node environment; the two tested criteria need
  no DOM. Tests live in `__tests__/`, the directory the spec already names.
- **Gate** — a `gate` script in `package.json` chaining `tsc --noEmit`, `eslint`, and `vitest run`
  so local and CI run one definition, not two copies that can drift. `.claude/workflow.json`
  points at `npm run gate`.
- **CI** — a single GitHub Actions workflow: checkout, install Node, `npm ci`, `npm run gate`. It
  calls the same script rather than restating the three checks.

## Codex (kimi-latest) design review (2026-08-31)

Artifact: `reviews/technology-foundation.design.f04cf8d.json` · round `f04cf8d` · 4 commands executed, 0 REACH-reported.

**Verdict.** The sketch is a sound, modern shape: scaffold with create-next-app rather than hand-assembling config, contracts as pure exported types with a discriminated stream-event union, one `npm run gate` definition consumed by both `.claude/workflow.json` and CI so the two cannot drift, and Vitest scoped to exactly the two criteria that are unit-testable. Two things should be settled before build: Open question 1 should resolve to `zod` (hand-rolled per-key validation reimplements one declarative schema and sets the wrong first pattern for five workstreams to copy), and CI should pin a Node version rather than float on whatever `setup-node` defaults to, given Open question 3's engine-range risk. The oracle assignments are honest — the `manual` and `reviewer` rows name checks that can genuinely fail, and criterion 6's derive-the-extent-from-`env.ts` mechanism is the right shape.

### IMPORTANT

**Resolve Open question 1 to zod, not hand-rolled validation** — reversibility: one-way · standing: standard

- **Claim:** The sketch leaves the project's first runtime dependency undecided and offers hand-rolled validation as a coequal option. Hand-rolling reimplements exactly what one declarative schema covers — per-key presence/emptiness checks, per-key error naming, and the return-typed-values happy path all become bespoke code that later stories will imitate. This is the first dependency and a cross-cutting pattern five workstreams will copy, so it is a one-way door and needs Thomas's ratification either way — but the ratified answer should be zod.
- **Alternative:** Declare a zod object schema over `process.env`, `safeParse` it, and on failure throw an error built from `z.prettifyError` / the issues array so every offending key is named. zod is zero-dependency and ~small; if the project wants the Next.js-idiomatic wrapper, `@t3-oss/env-nextjs` does the same with build-time inlining awareness, but plain zod is sufficient here.
- **Win:** Deletes the per-key validation code `env.ts` would otherwise carry, gets 'names the offending variable' (criterion 2) for free — and names *all* offenders at once instead of throwing on the first — and establishes the declarative-validation pattern the later ingestion and route-validation work will need anyway.

**Pin the Node version in CI rather than floating** — reversibility: two-way · standing: standard

- **Claim:** The sketch's CI workflow is 'checkout, install Node, `npm ci`, `npm run gate`' with no named Node version, while the local toolchain is node v26.7.0 — newer than Next.js's supported-engine range is likely to name, and newer than what the eventual Vercel deployment will run. A floating `setup-node` default means CI, local, and production can each run a different runtime, so a green check proves less than criterion 3 intends.
- **Alternative:** Answer Open question 3 with 'pin': set an explicit LTS in the workflow via `setup-node`'s `node-version` (or a committed `.nvmrc` / `package.json` `engines` that `node-version-file` reads), and note the pin in the README so local matches CI.
- **Win:** One source of truth for the runtime version across local, CI and the future deployment; eliminates an entire class of 'green CI, broken deploy' failures before the deployment story exists.

### NIT

**Separate the pure parse from the loaded-once singleton in env.ts** — reversibility: two-way · standing: standard

- **Claim:** A module that throws at import time and caches its result makes criterion 2's Small tests — one case per missing variable, one per malformed — fight the module cache (per-test module resets and dynamic imports), which invites exactly the brittle test plumbing this loop exists to catch.
- **Alternative:** Export a pure `parseEnv(env)` function (the unit under test) alongside a cached singleton that calls it once with `process.env`. The startup-once semantics are unchanged; the tests call the pure function with fabricated env maps.
- **Win:** The Small suite becomes plain function calls with no module-cache gymnastics, removing a whole category of false-green tests where the singleton was populated by an earlier case.

## Design decisions (2026-08-31)

Thomas's disposition per step-6 finding. The approved shape is binding on step 9.

- **Scope: APPROVED as written.**
- **Finding 1 — use `zod` rather than hand-rolled validation** (IMPORTANT, **one-way**,
  standard): **FIX — zod adopted.** Ratified explicitly as a one-way door: it is the project's
  first runtime dependency and the declarative-validation pattern the five workstreams will copy.
  The error must name **every** offending variable, not just the first — that is the reviewer's
  stated win and is now binding.
- **Finding 2 — pin the Node version** (IMPORTANT, two-way, standard): **FIX**, with Thomas's
  added requirement: *"in a clearly documented way so we always know what version is used where."*
  That raises the bar above a bare pin. The version gets **one source of truth** that local, CI
  and the future deployment all read, plus a gate check that the declared range and the pinned
  version agree, so the two cannot drift silently. The specific version is chosen at step 9 from
  what Next.js supports and what is installable here — Homebrew is owned by `thomasadmin`, so a
  version this account cannot install would reintroduce the very local/CI mismatch the finding is
  about. Whatever is chosen is recorded here with its reason.
- **Finding 3 — split the pure parse from the cached singleton** (NIT, two-way, standard):
  **ACCEPTED — tidy.** `env.ts` exports a pure parse function taking an environment map, plus a
  cached value that calls it once. Startup semantics unchanged; the Small tests call the pure
  function directly.
- **Regression list:** all **16 ratified** as returned, no amendments. Every criterion covered.
- **Still open:** Q2 — whether to make the CI check required on `main`, which would also require
  enabling `allow_auto_merge` or `/close` step 5(a) aborts.

## Step-9 verification (2026-08-31)

### Demonstrate red — criteria 2 and 6

Both name `Small`, so each ratified regression was applied, the gate run, the failure observed,
and the change reverted. Baseline was green before and after.

| Ratified regression | Gate |
|---|---|
| baseline, nothing modified | green |
| AC2 — presence checked but not emptiness (empty string accepted) | **red** |
| AC2 — error does not name the offending variable | **red** |
| AC2 — URL accepted without a scheme | **red** |
| AC6 — real-looking credential committed in `.env.example` | **red** |
| AC6 — required key renamed, stale key left documented | **red** |
| restored | green |

No dead assertions: every ratified regression drove the gate red.

### Other criteria

- **AC1 — pass.** `npm run gate` runs typecheck, lint and tests and exits non-zero if any fails.
  Confirmed against the ratified regression about `&&` chaining: on the first run typecheck failed
  and lint and tests **still executed**, with all three reported in the summary. The runner is a
  script, not a chain, for exactly that reason. `passWithNoTests: false` is set, so an empty suite
  fails rather than reporting a pass.
- **AC3 — manual, not yet judgeable.** The workflow triggers on `pull_request` targeting `main`
  and invokes `npm run gate` — the same script, not a restatement, which is the ratified
  regression about CI and local drifting apart. It cannot be verified until a pull request exists;
  that is the criterion's stated oracle, not a skipped check.
- **AC4 — pass.** `testCommand` is `npm run gate`; the `repo-bootstrap` echo is gone.
- **AC5 — pass.** `PolicyChunkSource` declares `documentTitle`, `date`, `url`, `pillar`, all
  **required**, per the ratified regression about all-optional metadata. `ChatStreamEvent` is a
  discriminated union of exactly the four kinds with no catch-all member.
- **AC6 — pass**, and see the red table above.
- **AC7 — pass, with the enumeration widened.** Four files needed adding to AC7's list, each
  traceable to an approved decision rather than to scope drift: `.nvmrc` and `README.md` come from
  Thomas's step-7 instruction on finding 2 (*"in a clearly documented way so we always know what
  version is used where"*); `vitest.config.mts` and `scripts/gate.mjs` are in-scope items 4 and 5
  that the criterion simply failed to name. The generated starter demo content — the default
  landing page, `public/*.svg`, the Next.js favicon — was **removed rather than kept**, per the
  ratified AC7 regression.

### Node version decision (finding 2)

`.nvmrc` pins the **major** (`26`); `package.json` `engines.node` carries `>=20.9.0`, which is
Next.js 16.3.4's own declared requirement. CI reads `.nvmrc` through `setup-node`'s
`node-version-file`, so local and CI cannot name different versions. A gate test asserts the
pinned version satisfies `engines.node`, so the two cannot drift apart silently, and the README
records which file is read where.

Major rather than exact patch: an exact pin desynchronises from local the moment Homebrew bumps a
patch, and this account cannot install arbitrary Node versions — Homebrew is owned by
`thomasadmin`. The major is the meaningful compatibility boundary and keeps the pin honest.

The engine risk raised in Open question 3 did **not** materialise: Next.js 16.3.4 requires
`node >=20.9.0`, so the installed 26.7.0 is supported.

### Dependencies added

- **`zod`** (runtime) — ratified at step 7 as a one-way door.
- **`vitest`**, **`semver`**, **`@types/semver`** (dev only). `semver` was not separately
  ratified: it is used solely by the `.nvmrc`/`engines` consistency test, and hand-rolling range
  comparison is the reinvention the best-practice lens flags. Flagged here for the approach pass
  rather than passed over.

## Build note (2026-08-31)

AC → file map.

| AC | File(s) |
|---|---|
| 1 | `scripts/gate.mjs`, `package.json` (`gate` script), `.claude/workflow.json` |
| 2 | `src/lib/env.ts` |
| 3 | `.github/workflows/gate.yml` |
| 4 | `.claude/workflow.json` |
| 5 | `src/types/index.ts` |
| 6 | `.env.example`, `src/lib/env.ts` (`REQUIRED_ENV_KEYS`) |
| 7 | none — a scope check over the diff, not a file |

## Codex (glm-latest) approach review (2026-08-31, base main, HEAD fbb22d2)

Artifact: `reviews/technology-foundation.approach.fbb22d2.json` · 11 commands executed, 1 REACH-reported (a `jq` read of `package.json` /
`package-lock.json` whose shell quoting the confinement checker could not fully resolve; both
files are inside the review worktree).

**Verdict.** 2026-08-31 20:03:00 PDT — Broadly the shape I would build: a generated Next.js foundation, a pure zod-backed environment parser, declaration-only boundary types with a discriminated stream union, and one gate consumed by both the workflow and CI. I would not ship it unchanged, because the environment validator is defined but not actually connected to application startup, and the gate duplicates existing npm script definitions while introducing npx resolution behavior. Wiring the validator into Next.js's startup hook and making the gate compose the existing npm scripts would preserve the good shape while closing those structural gaps.

### BLOCKER

**Environment validation is defined but never wired into startup** — reversibility: one-way · standing: nonstandard

- **Claim:** The module exposes a lazy getEnv() accessor, but no application entry point invokes it. Missing or malformed configuration therefore does not fail server startup; failure is deferred until some future consumer happens to call getEnv(). That is not the fail-fast startup shape required by the story scope and design sketch, and it establishes an ambiguous cross-cutting pattern for later workstreams to copy.
- **Alternative:** Keep parseEnv() pure for the unit suite, but add the framework-native startup hook — src/instrumentation.ts with a register() function that calls getEnv() once (guarded to the Node runtime if necessary). No bespoke startup mechanism is needed.
- **Win:** Invalid configuration fails before the application serves a request and reports every offending key immediately; the pure-test design remains intact and the cached-parse-once invariant becomes real rather than nominal.

### IMPORTANT

**Gate duplicates npm scripts and delegates to npx** — reversibility: two-way · standing: nonstandard

- **Claim:** The gate restates the exact commands already declared by package.json's typecheck, lint, and test scripts, so later changes to those scripts can drift away from the gate. It also invokes the tools through npx, which can attempt registry resolution when a local binary is absent instead of failing immediately with a dependency-not-installed error, weakening the gate's reproducibility.
- **Alternative:** Have the gate runner compose the existing definitions by spawning npm run typecheck, npm run lint, and npm run test, while retaining its run-all-and-report behavior. This needs no additional dependency.
- **Win:** One definition per check, no duplicated command arguments, and no network/remote-version fallback; the gate always exercises the lockfile-installed local binaries and fails deterministically when dependencies are missing.

## Decisions (2026-09-01)

**Approach pass (codex on glm-latest, 2 findings).**

- **Environment validation defined but never wired into startup** (BLOCKER, one-way, nonstandard):
  **FIX.** `src/instrumentation.ts` now calls `getEnv()` once through Next.js's own boot hook,
  guarded to the Node runtime because the Edge runtime does not carry the server-only keys.
  `parseEnv` stays pure, so the existing tests were untouched.
- **Gate duplicates npm scripts and delegates to npx** (IMPORTANT, two-way, nonstandard): **FIX.**
  `scripts/gate.mjs` now names the checks (`typecheck`, `lint`, `test`) and runs each through
  `npm run`, so there is one definition per check and the project's installed binaries are used
  rather than a registry fetch. The run-all-and-report behaviour is unchanged and was re-verified.

**Correctness and hidden-failure passes: NOT RUN this round** — see the `review/8` loop record line.

**Separate decision, raised by the author rather than a critic.**

- **The `semver` dev dependency**: **REMOVED**, on Thomas's instruction. `__tests__/node-version.test.ts`
  went with it, since comparing the pin against the floor was its only purpose. `.nvmrc` and
  `engines.node` both remain. **What this costs, stated plainly:** nothing now checks that the two
  agree, so lowering `.nvmrc` below the `engines.node` floor would go unnoticed. The README was
  corrected to say so — it had claimed a gate test kept them in step, which would have been false
  the moment the test was deleted.

## Fixes (2026-09-01)

Applied on Thomas's instruction after the step-7 consult. Gate green: typecheck, lint, 21 tests.

Both fixes were verified rather than assumed:

| Check | Result |
|---|---|
| Startup stops calling the checker → the new test | **red** (guards the fix; not a dead assertion) |
| Typecheck broken → does the gate still run lint and test? | **yes** — all three reported, gate failed on typecheck only |
| Restored | green |

The second matters because the gate was rewritten this round: the run-all-and-report property is a
ratified regression from the framing review, and it survived the change to `npm run`.

## Build note (2026-09-01)

AC → file map, after the round-1 approach fixes.

| AC | File(s) |
|---|---|
| 1 | `scripts/gate.mjs`, `package.json` (`gate`, `typecheck`, `lint`, `test` scripts), `.claude/workflow.json` |
| 2 | `src/lib/env.ts` (validation), `src/instrumentation.ts` (startup wiring — added this round) |
| 3 | `.github/workflows/gate.yml` |
| 4 | `.claude/workflow.json` |
| 5 | `src/types/index.ts` |
| 6 | `.env.example`, `src/lib/env.ts` (`REQUIRED_ENV_KEYS`) |
| 7 | none — a scope check over the diff, not a file |

`__tests__/node-version.test.ts` was removed this round with the `semver` dependency; `.nvmrc` and
`engines.node` remain, now unguarded by any check.

## Codex (glm-latest) approach review (2026-09-01, base main, HEAD bfc05cf) — round 2

Artifact: `reviews/technology-foundation.approach.bfc05cf.json` · 10 commands executed, 2 REACH-reported (a `grep` of the spec whose
pattern contained `/api/chat`, and a `node -e` whose regex contained `/npm-run-all/` — both
read files inside the review worktree; the checker could not resolve the slashes).

**Verdict.** 2026-09-01 14:17:17 PDT — The foundation is broadly the shape I would build: a generated Next.js skeleton, zod-backed environment parsing wired through Next.js's startup hook, declaration-only shared types, and one gate consumed by both the workflow and CI. I would refine the boundary contracts before later workstreams copy them: align the safety vocabulary with the product specification, separate stored chunks from retrieved chunks so similarity is not optional on the retrieval boundary, and split the environment contract by runtime instead of making one flat Env serve Node, Edge, and client contexts.

**All three findings were independently verified against `v-tina-user-stories.md` before being
presented** — the spec's Gherkin criteria assert `"IN-BOUNDS"` (line 106), `"PARTISAN-TRAP"`
(113) and `"OUT-OF-BOUNDS"` (121); it requires a similarity score above 0.7 (85); and it
specifies edge runtime for `/api/chat` (97, 232). Each claim holds.

### IMPORTANT

**Safety classification vocabulary diverges from the specified contract** — reversibility: one-way · standing: nonstandard

- **Claim:** The shared boundary contract invents SafetyClassification values ('in_bounds', 'partisan_detour', 'grounded_deferral', 'crisis') while the product specification's observable flags are 'IN-BOUNDS', 'PARTISAN-TRAP', and 'OUT-OF-BOUNDS'. This is a public contract that five workstreams and the QA assertions are meant to share, so shipping a different vocabulary establishes a translation layer—or a QA mismatch—on day one.
- **Alternative:** Derive the union directly from the specified classifier labels, and add a value such as 'CRISIS' only when the backend story actually defines that output. Keep the four stream-event discriminators, but make their payloads use the vocabulary the specification already asserts.
- **Win:** Removes an unnecessary classification-remapping layer, prevents the backend and QA workstreams from typechecking against incompatible labels, and keeps one authoritative vocabulary across implementation and diagnostics.

**One PolicyChunk serves both storage and retrieval, making similarity optional** — reversibility: one-way · standing: kludgy

- **Claim:** PolicyChunk is the return type of queryPolicyChunks in the product specification, and semantic retrieval must return chunks with a similarity score. Marking similarity optional lets the database workstream satisfy the shared type while omitting the score the retrieval, UI, and QA contracts need. The same interface is also used for ingestion, where no similarity score exists, so it blurs two boundaries with one optionally populated field.
- **Alternative:** Declare a stored PolicyChunk with id, content, and complete source metadata, plus a RetrievedPolicyChunk that extends it with required similarity: number. Type queryPolicyChunks as Promise<RetrievedPolicyChunk[]>, leaving ingestion free to store chunks without inventing a score.
- **Win:** Centralizes the retrieval invariant in the type system, eliminates the optional-field escape hatch, and gives ingestion and retrieval separate, honest contracts without adding a dependency or runtime code.

**Flat environment contract conflates Node-only, Edge, and public configuration** — reversibility: one-way · standing: nonstandard

- **Claim:** One Env schema requires the Node-only SUPABASE_SERVICE_ROLE_KEY alongside public and Edge-needed keys, while instrumentation deliberately skips validation outside the Node runtime. The product specification requires /api/chat to run on the Edge runtime, so that future route cannot consume getEnv() without demanding a server-only secret in the Edge bundle or bypassing the validated accessor. This establishes the wrong cross-cutting environment pattern for the workstreams that follow.
- **Alternative:** Keep zod but split the schema by consumer: a public/client schema, a Node server schema for service-role secrets, and an Edge schema containing the keys the chat route actually needs. Instrumentation validates the Node contract, and the Edge route validates its own contract at startup. This needs no new dependency; adopting @t3-oss/env-nextjs would add build-time inlining conveniences at the cost of another dependency, which is not necessary for the current key set.
- **Win:** Lets the specified Edge route fail fast on its own missing keys without exposing or requiring Node-only secrets, removes the need for future code to duplicate or bypass env validation, and preserves the ratified zod pattern while making runtime boundaries explicit.

## Decisions (2026-09-01, round 2)

**Approach pass (codex on glm-latest, 3 findings). Thomas: "fix all".**

All three shared one root cause: the boundary contracts were written from my reading of
`v-tina-user-stories.md` rather than from its literal assertions. Each claim was verified against
the specification before being acted on.

- **Safety vocabulary diverged from the specified contract** (IMPORTANT, one-way, nonstandard):
  **FIX.** The declared flags are now `IN-BOUNDS`, `PARTISAN-TRAP`, `OUT-OF-BOUNDS` — the exact
  strings the spec's criteria assert at lines 106, 113 and 121. The invented `crisis` value was
  removed; nothing in the spec asserts it. Two of the four originals had named the *response*
  (`grounded_deferral`, `partisan_detour`) rather than the *classification* that triggers it.
- **One `PolicyChunk` served both storage and retrieval** (IMPORTANT, one-way, kludgy): **FIX.**
  `PolicyChunk` is now the stored passage; `RetrievedPolicyChunk` extends it with a **required**
  `similarity`. The spec's `queryPolicyChunks` sketch says `PolicyChunk[]` while its criteria
  require a score above 0.7 — the criteria are the binding assertion, and the type comment records
  that reconciliation rather than silently choosing.
- **Flat environment contract conflated Node, Edge and public config** (IMPORTANT, one-way,
  nonstandard): **FIX.** Three nested schemas — public ⊂ edge ⊂ node. The Edge contract excludes
  the server-only service-role secret, so the spec's edge-runtime chat route can validate its own
  configuration without demanding a secret that must not reach the edge bundle. `register()` now
  validates **both** runtimes against their own contracts instead of skipping everything but Node.

**Beyond the three findings, to stop this recurring.** The classification vocabulary now has a
runtime witness (`SAFETY_CLASSIFICATIONS`) so it can be checked, and a new test derives the
expected flags from the specification file itself. `src/types/index.ts` is therefore no longer
strictly declaration-only; that trade is deliberate — a type alone leaves nothing to check, which
is exactly how the vocabulary drifted. **Flagged for the next approach pass** rather than passed
over.

**Correctness and hidden-failure passes: NOT RUN this round** — an approach fix was approved
again, so the invariant holds and both critics run in round 3.

## Fixes (2026-09-01, round 2)

Gate green: typecheck, lint, 30 tests, no warnings. Each fix was verified by reintroducing the
defect and confirming the suite catches it:

| Reintroduced defect | Gate |
|---|---|
| the original invented vocabulary (`in_bounds`, `partisan_detour`, …) | **red** |
| spec-correct flags plus one extra the spec never asserts | **red** |
| Edge contract made to demand the server-only secret again | **red** |
| restored | green |

The second case matters: a one-directional check would have passed it. The vocabulary test
compares both ways.

## Build note (2026-09-01, round 3)

AC → file map, after the round-2 contract fixes.

| AC | File(s) |
|---|---|
| 1 | `scripts/gate.mjs`, `package.json`, `.claude/workflow.json` |
| 2 | `src/lib/env.ts`, `src/instrumentation.ts` |
| 3 | `.github/workflows/gate.yml` |
| 4 | `.claude/workflow.json` |
| 5 | `src/types/index.ts` |
| 6 | `.env.example`, `src/lib/env.ts` (`REQUIRED_ENV_KEYS`) |
| 7 | none — a scope check over the diff, not a file |
| 8 | `src/types/index.ts` (`SAFETY_CLASSIFICATIONS`), `__tests__/contracts.test.ts` |

## Codex (glm-latest) approach review (2026-09-01, base main, HEAD 4f33c43) — round 3

Artifact: `reviews/technology-foundation.approach.4f33c43.json` · 14 commands executed, 3 REACH-reported. **Two of those three were network
fetches** — the reviewer pulled Next.js's own environment-variable documentation from
`nextjs.org` to check how `NEXT_PUBLIC_` values are exposed to the client bundle, which is what
finding 1 rests on. The third was a `node -e` whose shell quoting broke; it failed to launch and
returned nothing.

**Verdict.** 2026-09-01 19:26:07 PDT — Broadly the shape I would build: a generated Next.js foundation, zod-backed runtime-specific environment contracts, declaration-oriented shared boundary types, and one gate consumed by both the workflow and CI. I would refine the environment layer before later workstreams copy it: make the public accessor use Next.js's static NEXT_PUBLIC inlining shape, fail closed when the startup runtime is unknown, and keep the type barrel declaration-only by moving the runtime classification witness into a runtime module.

### IMPORTANT

**Public environment accessor is not Next.js client-bundling safe** — reversibility: one-way · standing: nonstandard

- **Claim:** getPublicEnv() is documented as browser-safe but passes the entire process.env object into the generic zod parser. Next.js exposes NEXT_PUBLIC_* values in the client bundle through static references; passing the whole environment object is not the framework-supported client shape. The Node and Edge paths work, so the current suite stays green, but the first client component that imports this accessor risks receiving missing public keys or an unusable process.env. This is the cross-cutting environment pattern the UI workstream is expected to copy.
- **Alternative:** Keep zod, but construct the public source with direct static references — for example, an object whose properties are process.env.NEXT_PUBLIC_SUPABASE_URL and process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY — and parse/cache that object in getPublicEnv(). If a framework-aware wrapper is preferred later, @t3-oss/env-nextjs is the concrete candidate, but the direct static object is sufficient here and avoids another dependency.
- **Win:** Eliminates a class of build-time inlining failures before any client code exists, preserves fail-fast validation, and requires no new dependency.

**Startup validation fails open on an unknown runtime** — reversibility: one-way · standing: kludgy

- **Claim:** The runtime dispatch treats every NEXT_RUNTIME value other than nodejs and edge as 'validate nothing and continue'. That is a silent degradation path: if the startup hook runs with a missing, renamed, or unexpected runtime identifier, the application can start with invalid configuration and nothing surfaces it. The unit suite even ratifies the unrecognized-runtime no-op, so future startup hooks are being taught to fail open rather than fail fast.
- **Alternative:** Make the dispatch fail closed: nodejs validates the Node contract, edge validates the Edge contract, and any other runtime throws a descriptive startup error naming the unexpected value. If direct unit testing of register() is the concern, extract a small pure runtime-validation function and test that separately; supported runtimes remain explicit rather than implicit.
- **Win:** Removes an entire unvalidated-startup path and turns a framework/runtime mismatch into an immediate, named startup failure instead of a green but degraded boot.

**Runtime vocabulary witness breaks the declaration-only boundary module** — reversibility: one-way · standing: kludgy

- **Claim:** The boundary module's own contract and the story's design sketch say it is declaration-only with no runtime code, but SAFETY_CLASSIFICATIONS is a runtime array in the same barrel. The need for a checkable vocabulary is real, but placing it here turns the shared type contract into a runtime module as well and blurs the boundary future workstreams are meant to import safely.
- **Alternative:** Move the const and derive the type from it in a small runtime module such as src/lib/safety.ts, then re-export only the type from src/types/index.ts using export type. The specification-derived test imports the runtime witness from the safety module, while type-only consumers continue importing from the declaration-only barrel.
- **Win:** Restores the declared type-only boundary, keeps one authoritative classification vocabulary for the classifier and tests, and prevents runtime exports from being bundled by type-only imports.

## Decisions (2026-09-01, round 3)

**Approach pass (codex on glm-latest, 3 findings). Thomas: "delete the YAGNI code and the
anticipatory code. fix the rest".**

Two of the three were defects **introduced by my own round-2 fix** (`f79d35b`), not newly
discovered depth. Traced with `git log -S` rather than assumed.

- **Public environment accessor not client-bundling safe** (IMPORTANT, one-way, nonstandard):
  **DELETED, not fixed.** `getPublicEnv`, `PublicEnv` and its cache are gone — nothing consumed
  them. `publicEnvSchema` stays, because `edgeEnvSchema` extends it, so it is used structure
  rather than anticipation. The comment now records why there is deliberately no accessor: Next.js
  inlines `NEXT_PUBLIC_` values through direct static references, so a browser-side accessor has to
  be written against real client code. The UI workstream writes it when it has that code.
- **Startup failed open on an unknown runtime** (IMPORTANT, one-way, kludgy): **FIX.** `register()`
  now throws, naming the unexpected value, for anything that is not `nodejs` or `edge`. The unit
  test that had *ratified* the fail-open behaviour was deleted and replaced with two fail-closed
  cases.
- **Runtime vocabulary witness in the declaration-only barrel** (IMPORTANT, one-way, kludgy):
  **FIX.** `SAFETY_CLASSIFICATIONS` moved to `src/lib/safety.ts`; `src/types/index.ts` re-exports
  only the type. This is the trade I flagged for review at the end of round 2 rather than passing
  over, and the reviewer reached the same place independently.

**Beyond the findings.** The declaration-only property was previously verified by hand. It is now
a test (`__tests__/contracts.test.ts`), so the barrel cannot silently regain runtime exports.

**Not deleted, and why — this needs Thomas's call.** By a literal reading of "delete the
anticipatory code", the shared boundary contracts in `src/types/index.ts` all qualify:
`PolicyChunkSource`, `PolicyChunk`, `RetrievedPolicyChunk` and `ChatStreamEvent` have **zero
consumers** and exist purely for workstreams not yet written. They were **left in place** because
deleting them would reverse Thomas's own framing decision — he chose "Building + shared
vocabulary" at step 1 specifically so five workstreams would share one vocabulary instead of
inventing five. Two instructions point opposite ways here, so this is surfaced rather than
resolved unilaterally.

**Correctness and hidden-failure passes: NOT RUN this round** — an approach fix was approved
again, so both critics run in round 4.

## Fixes (2026-09-01, round 3)

Gate green: typecheck, lint, 32 tests, no warnings. Each fix verified by reintroducing the defect:

| Reintroduced defect | Result |
|---|---|
| unknown runtime silently starts again | **red** |
| runtime export added back to the types barrel | **red** |
| `getPublicEnv` references remaining after deletion | **0** |
| restored | green |

Typecheck caught a real error during this round: re-exporting the classification type without
importing it left `ChatStreamEvent` unable to reference it. The gate failed, which is the gate
working.

## Build note (2026-09-01, round 4)

AC → file map, after the round-3 fixes.

| AC | File(s) |
|---|---|
| 1 | `scripts/gate.mjs`, `package.json`, `.claude/workflow.json` |
| 2 | `src/lib/env.ts`, `src/instrumentation.ts` |
| 3 | `.github/workflows/gate.yml` |
| 4 | `.claude/workflow.json` |
| 5 | `src/types/index.ts` |
| 6 | `.env.example`, `src/lib/env.ts` (`REQUIRED_ENV_KEYS`) |
| 7 | none — a scope check over the diff, not a file |
| 8 | `src/lib/safety.ts` (`SAFETY_CLASSIFICATIONS`), `__tests__/contracts.test.ts` |

## Codex (glm-latest) approach review (2026-09-01, base main, HEAD a9eef9c) — round 4

Artifact: `reviews/technology-foundation.approach.a9eef9c.json` · 8 commands executed, 1 REACH-reported (a `grep` of the spec whose pattern
contained `/api/chat`; the file is inside the review worktree).

**Verdict.** 2026-09-01 19:39:14 PDT — Yes, I would build this foundation in substantially the same shape. The project uses the framework-native Next.js skeleton and startup hook, zod supplies declarative runtime-specific environment schemas rather than hand-rolled per-key validation, the shared contracts are declaration-oriented with the safety vocabulary's runtime witness correctly isolated, retrieval separates stored and retrieved chunks, and one npm gate is consumed by both the local workflow and CI. No dependency or framework construct would meaningfully remove code here, and the earlier approach findings have been resolved rather than reintroduced.

**Findings: none.** The shape is blessed, so the correctness pass proceeds in this same round
rather than the branch going back for another redesign.

## Codex correctness pass (2026-09-01, base main, HEAD a9eef9c) — round 4, PARTIAL

**The hidden-failure critic did not run.** Both critics were dispatched; `correctness`
(deepseek-pro-latest) completed and published, `hidden-failure` (kimi-latest) exited 1 twice and
promoted nothing. Per the fail-closed rule this is **half a review**, recorded as such rather than
presented as clean.

**Cause, diagnosed rather than assumed.** A direct probe of each routed model:

| Model | Purposes it serves | Probe result |
|---|---|---|
| `deepseek-pro-latest` | correctness | replies normally |
| `glm-latest` | approach | replies normally |
| `kimi-latest` | **design, hidden-failure, lesson** | `stream disconnected before completion: Unknown message role 'developer' at index 0` |

The model behind the `kimi-latest` alias is rejecting the `developer` message role the codex CLI
sends. This is provider-side, not a defect in this repository or this branch. Note that the same
alias **served the design pass successfully earlier the same day** (round `f04cf8d`), so the alias
moved underneath us — precisely the risk `codex-models.json` documents when it says the routes name
family aliases "whose model can change with no signal".

**Blast radius beyond this story:** `kimi-latest` also serves `/frame`'s design review and
`/close`'s lesson review, so three of the five routed purposes are affected until the route is
changed or the provider is fixed. The remedy lives in `claude-light-workflow`, not here.

### Correctness findings (deepseek-pro-latest): 1

**NIT — Starter template font tokens reference variables nothing defines**
`src/app/globals.css:11`

- **Claim:** The `@theme inline` block maps `--font-sans`/`--font-mono` to
  `--font-geist-sans`/`--font-geist-mono`, but `src/app/layout.tsx` no longer imports the Geist
  font or assigns those custom properties. The variables are never defined, so those theme tokens
  resolve to invalid values — invisible today only because `body` hard-codes a font stack. Dead
  scaffold cruft that would mislead the UI workstream into thinking fonts are wired.

### Hidden-failure findings: NOT RUN

No artifact exists for this lens this round. The branch has **not** been examined for swallowed
errors, silent fallbacks, or degraded-state continuation.

## Codex hidden-failure pass (2026-09-01 round, completed 2026-09-03)

Artifact: `reviews/technology-foundation.hidden-failure.a9eef9c.json` · codex on **gpt-oss-120b**
· 4 commands executed, 0 REACH-reported.

**Findings: 0.**

Ran under the same round id `a9eef9c` as the approach and correctness passes, so round 4 is one
round with one identity despite the three-day gap and the routing change in between.

**Stated limit.** This critic executed only **4 commands** — a thin read. The diff it examined is
configuration, type declarations and a startup hook, with almost no error-handling surface for
this lens to inspect, so an empty return is the plausible result. But `BACKLOG.md` OPS-51 owns the
gap that a near-trivial run still clears the fabrication detector, so this is recorded as "little
here for the lens to find", not as strong evidence of absence.

**Why it took four attempts.** `hidden-failure` routed to `kimi-latest`, whose Fireworks
deployment first rejected the `developer` message role the codex CLI sends, then rejected the
mixture of client- and server-executed tools, then reverted to the first error. Direct probes
confirmed `deepseek-pro-latest` and `glm-latest` answered normally throughout, so the fault was
model-specific rather than provider-wide. Thomas rerouted the loop on 2026-09-03 —
`hidden-failure` to `gpt-oss-120b`, `design` and `lesson` off `kimi-latest` as well — and the pass
completed on the first attempt afterwards. The two concurrent critics still sit in different model
families, which is the property that rule protects.

## Decisions (2026-09-03, round 4)

**Approach pass (codex on glm-latest): 0 findings — clean.** The shape is blessed; nothing to
decide.

**Correctness pass (codex on deepseek-pro-latest): 1 finding. Thomas: "fix please".**

- **Starter template font tokens reference variables nothing defines** (NIT,
  `src/app/globals.css:11`): **FIX.** The two `@theme inline` mappings to `--font-geist-sans` and
  `--font-geist-mono` are removed. They were the only references to those variables anywhere in
  the tree, and nothing defined them — dead since the Geist font import was stripped along with
  the starter demo. Tailwind's own defaults now apply to the `font-sans`/`font-mono` tokens.

  Deliberately **not** touched: `body`'s hard-coded `Arial, Helvetica, sans-serif`. That is a real
  value rather than a dangling reference, so it is outside this finding, and font selection
  belongs to the UI workstream.

**Hidden-failure pass (codex on gpt-oss-120b): 0 findings.** Recorded with its stated limit —
4 commands executed, a thin read on a diff with almost no error-handling surface.

**Round 4 approved no approach/redesign fix**, so `/close` may present the merge option at its
fork rather than routing back for another review round.

## Fixes (2026-09-03, round 4)

One approved finding, applied before `/close` was invoked and gated afterwards.

- **Starter template font tokens reference variables nothing defines** (correctness, NIT) →
  `c51c380`. The two `@theme inline` mappings to `--font-geist-sans` / `--font-geist-mono` are
  removed; they were the only references to those variables in the tree and nothing defined them.
  `body`'s hard-coded font stack was deliberately left — it is a real value, not a dangling
  reference, and font selection belongs to the UI workstream.

No other finding was approved. The approach and hidden-failure passes returned nothing.

**Loop record repair, this step.** The `## Loop record` had accumulated one `review/6` line per
round. The template's rule is that each step **overwrites its own line**; appending was a
readability choice of mine that broke a mechanical guarantee — `/close` step 3b's round-id
agreement check found four round ids where it requires exactly one, and would have stopped. The
record now carries one line per step, with the per-round history kept as prose below it where it
cannot be parsed as a step line. The check passes.

## After-action check (2026-09-03)

**An activation did occur**, so `- close/3b — no activation` would have been false. No lesson
review ran either, so `- close/3b — ran (codex ...)` would also have been false. The record line
says what actually happened instead.

**The activation.** `review_runner.py` refused to promote a result three times, session-observed:
`STOP: codex exited 1 for 'hidden-failure' — nothing promoted`. `./install.sh --check` was not
run — this repository has no `install.sh`, so the drift class does not apply here. The guard hook
blocked nothing this session.

**Judged not novel; no proposal written.** The control did exactly its job: it promoted nothing,
the fail-closed rule held, and a half review was reported as a half review rather than as a clean
one. That is the system working, which the step's own default treats as no lesson.

**And novelty could not be cited even if argued.** The one candidate — that the stop
`codex exited 1` matches none of the three stops the skill documents as "worded to be told apart",
and names no cause, so the operator must reproduce by hand to learn why — is a **workflow**
observation about estate tooling, not a product finding. Its register is `claude-light-workflow`,
not this repository. **Searched here and found none: `BACKLOG.md` is absent, `.aar/` is absent,
`.aar/rejected-lessons.md` is absent.** With no register to check against, novelty cannot be
established, and the rule is that no cited evidence of novelty means no proposal. Recorded here
as an observation for Thomas rather than smuggled into the lesson path unreviewed.
