Date: 2026-08-30 · Branch: claude/agents-gherkin-scope · Status: approved · Class: deployed

# agents-gherkin-scope — scope the Gherkin AC rule to product criteria

Loop: none — this branch ran no loop of its own. It predates `.claude/workflow.json` existing in
this repository, so `/frame` and `/review` could not run against it at the time: `/review` stopped
at step 1 with no config to load, and there was no gate for step 3.

**It was nonetheless reviewed.** `claude/repo-bootstrap` was stacked on this branch by Thomas's
step-1 decision, so every reviewer pass in that story diffed `main...HEAD` and therefore read this
branch's `AGENTS.md` changes in full:

- design (codex on kimi-latest) -> `reviews/repo-bootstrap.design.1e7c26f.json`
- approach (codex on glm-latest) -> `reviews/repo-bootstrap.approach.1d3eb76.json`
- correctness (codex on deepseek-pro-latest) -> `reviews/repo-bootstrap.correctness.1d3eb76.json`
- hidden-failure (codex on kimi-latest) -> `reviews/repo-bootstrap.hidden-failure.1d3eb76.json`

No finding in any pass concerned this branch's changes.

## What changed

`AGENTS.md` gained one repo-local rule: acceptance criteria for product behaviour are written as
numbered Given/When/Then prose, while workflow bookkeeping criteria stay as numbered property
assertions. The preamble was corrected to name the single reviewer harness (codex) and the actual
mechanism — `run_codex` interpolates the shared contract into the prompt; codex auto-reads this
file as a local addendum.

## Why this file exists

The merge commit `merge: <slug>` is the protocol's single source of truth for whether a story
shipped. Without a story file and its own merge commit,
`git log main --grep "^merge: agents-gherkin-scope"` would return empty for work that is in fact
in `main`.

## Gate

No gate ran on this branch: `.claude/workflow.json` does not exist here, because the config that
defines the gate arrives with `repo-bootstrap`, which merges second. Stated rather than skipped
silently.
