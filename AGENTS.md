# Repo-specific reviewer guidance — v-tina

**This file is an addendum, not the reviewer contract.** The contract itself is shared by every
repository and lives in exactly one place:

    ~/.claude/workflow-AGENTS.md

Everything below is **additional** to that contract and applies to **this repository only**. It
never replaces, overrides, or restates the shared rules.

Do **not** paste the shared contract in here. Codex already receives it — `run_codex` interpolates
it into the prompt — and auto-reads this file as a **local addendum** on top of it. A copy sitting
here would arrive as a **second, competing rulebook** with no rule for reconciling the two, so the
`--check-local-contract` preflight STOPS both `/frame` and `/review` when it detects one.

To change a rule that applies everywhere, edit the shared contract's source in
`claude-light-workflow` and run `./install.sh`; it reaches every repo at once.

**Apart from the single rule below, this repository follows the estate rules unchanged** — the
shared reviewer contract, the `shellcheck` + `shfmt -i 2 -ci` standard, and the
`/frame` → `/review` → `/close` loop all apply exactly as written elsewhere.

## Project rules to enforce

- **Acceptance criteria: Gherkin prose for product criteria, numbered throughout.**

  **Where this binds.** At `/frame` **step 5**, when the spec is drafted into `reviews/<slug>.md`.
  The author writes the criteria in this form; the reviewer flags deviations from it.

  **Which criteria take it.** Use Given / When / Then whenever **a person using the product can
  fail the `Then`** — the outcome is observable in the product's own behavior.

  **Which criteria do not.** Workflow-bookkeeping criteria stay as plain numbered property
  assertions: scope containment ("the diff touches only these files"), records-class criteria, and
  anything whose subject is the repository or the loop rather than the product. **Do not wrap these
  in a scenario.** A manufactured `Given a repository` / `When the diff is taken` is a fake scenario
  — it reads as product behavior while asserting bookkeeping, and it buys nothing.

  **Shape, for the criteria that take it.**
  - **The number stays.** Gherkin's `Scenario:` label does not replace it. One number is one
    scenario.
  - **`Given` / `When` / `Then`, in that order, all three present.**
  - **`When` is a single trigger.** `And` / `But` may extend `Given` or `Then` only — never `When`.
    Two triggers are two numbered criteria.
  - **Prose, not a `.feature` file.** These are sentences a human reviewer reads. No step
    definitions, tags, `Background`, `Scenario Outline`, `Examples` tables, and no runner that
    parses them.
  - **No implementation tokens in `Then`.** The outcome is what an observer can see, never a
    selector, function name, file path, or literal assertion. (This is the shared contract's
    existing rule about oracles derived from implementation shape — a pointer here, not a second
    copy.)

  **Test notes are unchanged by this rule.** Gherkin governs the criterion *text* only. Every
  numbered criterion — scenario or property assertion alike — still gets exactly **one**
  `## Test notes` row naming **one** oracle mode from the closed set (`Small` / `Medium` / `Large` /
  `manual` / `reviewer`). The step-6 independent regressions and the step-9 demonstrate-red
  obligation key off that table exactly as before: **one regression per numbered scenario, derived
  from the intent of its `Then`.**

  **Flags.** A product criterion written as a bare assertion instead of a scenario is
  **IMPORTANT**. A `Then` that cannot fail is **BLOCKER**.

  The canonical layout — bolded keywords, one clause per line, bookkeeping criteria plain:

  ```markdown
  ## Acceptance criteria

  1. **Given** a session with no saved profile,
     **When** the user opens the settings page,
     **Then** the form shows the built-in defaults and Save is disabled.

  2. **Given** a session with a saved profile,
     **When** the user edits a field and saves,
     **Then** the new value is persisted and survives a reload.

  3. **Given** a profile field that was changed and saved earlier in the session,
     **When** the user reverts that field,
     **Then** the prior value is restored.

  4. The diff touches only `src/settings.ts` and its test.
  ```
