# Lesson proposal — answer-voice-screen, round 26728d4

Proposed at `/close` step 3b on 2026-09-21, and checked independently before it reaches Thomas.
**Workflow lesson** — the review loop's recovery path — not a product finding.

## What happened, and where it first became visible

In round 26728d4 the three correctness-altitude critics ran concurrently. Hidden-failure and the
doc-drift shadow passed. The correctness critic executed 23 commands, then returned a final message
that was not valid JSON, and `review_runner.py` refused to promote it: "FAIL: final message's JSON
does not parse — object opening at offset 0: Expecting ',' delimiter at offset 1326". The `/review`
step-8 fail-closed check then prescribes "round stopped; rerun /review". The lesson first became
visible there, at that instruction, when deciding how to recover.

## The activation

- **What fired:** the runner refused to promote a reviewer result. **Class: session-observed.** The
  runner keeps no durable record of a refused pass that is not a trial; the only record is this
  story's loop record (`reviews/answer-voice-screen.md` → `review/8`) and its section "Codex
  correctness pass — round 7", both written by the builder.
- **The gate itself caught what it exists to catch.** Refusing a malformed reply is the system
  working, and nothing about that gate is in question.
- **What it revealed concerns the recovery the loop prescribes.** "Rerun /review" repeats step 8
  whole, and step 8 dispatches every pass unconditionally — including the doc-drift shadow trial,
  whose runs are capped.

## Evidence

Items 1–4 are outside this repository (deployed tooling and the machine-wide trial ledger), so the
lines are quoted here to be checkable; item 5 is in it.

1. **The recovery text and the unconditional dispatch** — `~/.claude/skills/review/SKILL.md`, step 8:
   `|| { echo "FAIL: correctness pass (correctness rc=$rc_c, hidden-failure rc=$rc_h) — round stopped; rerun /review" >&2; exit 1; }`,
   below three `python3 "$R" --run-codex …` dispatch lines (correctness, hidden-failure, doc-drift)
   that carry no condition on which passes already succeeded.
2. **A trial run is counted per dispatch, not per round** — `~/.claude/skills/review/review_runner.py`,
   `reserve_trial_run`: `used = sum(1 for e in _read_trial_ledger(ledger) if e["kind"] == "reserved")`,
   then a new `reserved` line recording `slug` and `round`. Nothing checks whether that slug and round
   already hold a run. The cap, from the doc-drift entry in `PASSES`:
   `"trial": {"max_runs": 20, "end": "2026-10-16"}`.
3. **An artifact is published by atomic replacement** — same file, `os.replace(tmp, artifact)` — so a
   rerun overwrites the passing critics' results for the round instead of keeping them.
4. **The ledger before this round's recovery** — `~/.claude/trials/doc-drift.jsonl`, read 2026-09-21:
   6 of 20 runs reserved, across four repositories, each on a distinct slug and round. A full rerun
   would have been the first round sampled twice.
5. **What was done instead, and that it held** — `reviews/answer-voice-screen.md` → `review/8` and
   "Codex correctness pass — round 7": the correctness critic alone was re-run with the same round id,
   base and prompt against the unchanged HEAD. It promoted (29 commands, 1 finding), and the round
   completed with one shadow run.

## Consulted and excluded

- **Why the reply was malformed.** Plausibly the review's own subject — quotation marks, backticks
  and characters outside the Basic Multilingual Plane quoted inside JSON strings — made escaping
  error-prone. The rejected message is not preserved, so the cause cannot be established. Excluded:
  the lesson depends on what recovery costs when a critic's reply fails, not on why it failed.
- **The reach report of the retry attempting to write `/tmp/sim.mjs`.** Unrelated to recovery, and
  nothing persisted.

## Isolated or systematic

**Systematic in mechanism, observed once.** Every refusal of one enforced critic while a trial pass is
open meets the same instruction, and both the dispatch and the counting are code paths rather than
chance. Frequency is the open question: this is the first time in this story that one of the two
concurrent correctness critics was refused while the other passed.

## Candidate lesson

When one of the two enforced correctness critics is refused and the other passes, the loop's recovery
re-runs the whole step. That spends a run of any open trial on a commit the trial has already sampled,
and replaces the passing critics' results. The narrower recovery — re-run only the refused critic,
under the same round id and base, against an unchanged HEAD — completes the round at neither cost,
and the loop does not describe it.

## Competing explanation

The coarse instruction is deliberate. One recovery path is simpler to follow and to test than a
conditional one; the cap has slack (14 of 20 runs left); the ledger records each run's round, so the
trial's analysis can drop a duplicate; and a replaced artifact is the same round's, replaced before
anyone has judged it, since step 9 comes after the fail-closed exit. On that reading a partial refusal
costs one trial run and some compute, which does not justify a second recovery path.

## What would weaken, narrow or disprove it

- The trial's analysis already counting samples per repository, slug and round, which would reduce
  the cost to one run of the cap.
- The runner refusing a second reservation for a slug and round it has already sampled, which would
  make a full rerun harmless to the trial.
- Partial refusals proving rare enough over the trial's window that the cost never materialises.

## What must not be generalized

- Not that the fail-closed check is wrong: stopping on half a review is right.
- Not that a routed model is unreliable: one malformed reply is one event.
- Not that a refused critic's output may be repaired or let through: the retry produced a new result,
  and the rejected one was not edited.
- Not beyond the trial window: once no pass carries `trial`, a full rerun costs only compute.

## Workflow or product

Workflow. Nothing in V-Tina's behaviour is involved; any remedy is a change to the deployed review
skill, made through its own loop.
