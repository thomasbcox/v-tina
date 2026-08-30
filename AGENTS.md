# Repo-specific reviewer guidance — v-tina

**This file is an addendum, not the reviewer contract.** The contract itself is shared by every
repository and lives in exactly one place:

    ~/.claude/workflow-AGENTS.md

Everything below is **additional** to that contract and applies to **this repository only**. It
never replaces, overrides, or restates the shared rules.

Do **not** paste the shared contract in here. Both backends already receive it: the `fireworks`
runner pushes it as its own labelled context input, and the `codex` prompts interpolate it inline.
A copy sitting here would reach the reviewer as a **second, competing rulebook** with no rule for
reconciling the two — so `/frame` and `/review` both refuse to run when they detect one.

To change a rule that applies everywhere, edit the shared contract's source in
`claude-light-workflow` and run `./install.sh`; it reaches every repo at once.

**Apart from the single rule below, this repository follows the estate rules unchanged** — the
shared reviewer contract, the `shellcheck` + `shfmt -i 2 -ci` standard, and the
`/frame` → `/review` → `/close` loop all apply exactly as written elsewhere.

## Project rules to enforce

- **Acceptance criteria are written as Gherkin-style prose, and stay numbered.** Every criterion in
  a spec's `## Acceptance criteria` section — the section `/frame` writes into `reviews/<slug>.md` —
  must be a **Given / When / Then** scenario in plain prose, carried under the numbering the shared
  workflow already requires.

  - **The number stays.** Gherkin's own `Scenario:` label does not replace it, and no criterion is
    exempt. One number is one scenario; a criterion that needs two scenarios is two numbered
    criteria, not one criterion with a compound `When`.
  - **Given, When, Then — in that order, all three present.** `And` / `But` may extend any of the
    three. `Given` sets the starting state, `When` names a *single* triggering action, `Then` names
    the observable outcome. A criterion with no `When` is a statement about the world rather than a
    criterion: rewrite it so something happens, or drop it.
  - **Prose, not a `.feature` file.** These are sentences a human reviewer reads. Do not add step
    definitions, tags, `Background`, `Scenario Outline`, `Examples` tables, or a runner that parses
    them, unless a story explicitly asks for that machinery.
  - **No implementation tokens in `Then`.** The outcome is what an observer can see, never a
    selector, function name, file path, or literal assertion. (This is the shared contract's
    existing rule about oracles derived from implementation shape — a pointer here, not a second
    copy.)

  Flag any spec whose acceptance criteria are bare assertions rather than Given/When/Then
  scenarios, any criterion missing one of the three parts, and any criterion whose `Then` could not
  fail.

  The canonical layout — bolded keywords, one clause per line:

  ```markdown
  ## Acceptance criteria

  1. **Given** a session with no saved profile,
     **when** the user opens the settings page,
     **then** the form shows the built-in defaults and Save is disabled.

  2. **Given** a session with a saved profile,
     **when** the user edits any field and saves,
     **then** the new value is persisted and survives a reload,
     **and** the prior value stays recoverable until the session ends.
  ```
