# Lesson proposal — chat-screen (round d2e7d11, 2026-10-04)

**Class: workflow.** It concerns the review loop's runner and skill text, not the product.

## What happened, and where it first became visible

At `/review` step 8 the correctness and hidden-failure critics were dispatched concurrently from
one background shell. The hidden-failure critic (kimi-latest) promoted its artifact in about nine
minutes. The correctness critic (glm-latest) was still running when the caller's background time
cap — ten minutes, the desktop app's maximum for a backgrounded command; not anything in the
reviewer harness, which has no cap — killed the shell. *(Wording corrected after the independent
check, `reviews/chat-screen.lesson.d2e7d11.json`, its one NIT: "harness" is the loop's term for
the reviewer runner, and the cap is the caller's.)* It first became visible as a task
notification reading "stopped after reaching its background time limit", with no stop line from
`run_codex`, no artifact, and one review worktree left behind at
`/private/var/folders/…/claude-review-vrpjsk_g` (`git worktree list` showed it; it was removed by
hand). Re-run alone and detached from the cap, the same critic finished in about eleven minutes
(loop record, `review/8`; `reviews/chat-screen.md`).

## The activation, and its class

**Session-observed.** The runner refused nothing: it was killed from outside before it could write
anything. There is no durable trace except the orphan worktree, the loop-record line this session
wrote, and the harness's own notification. A later reader cannot re-derive it from the repository
alone (OPS-27's limit applies).

## What it revealed

Two things the loop does not state:

1. **A critic's run can exceed the budget of whatever invokes it, and the loop names no budget.**
   `/review` step 8 says to background the three critics in one shell and `wait`; it says nothing
   about how long a critic may take or what to do when the caller has a ceiling. One pass took
   eleven minutes alone on a diff of about 3,800 lines (the lockfile is most of it).
2. **An external kill leaves `run_codex`'s worktree behind and writes no stop line.** The stop
   vocabulary in `/review` → *The reviewer harness* covers every way codex or the gates can fail,
   and OPS-56 closed the stale-artifact side of a killed round by construction (round-named
   artifacts). Neither covers the runner itself being terminated: the throwaway worktree is not
   removed, and the loop record has no stop class to record under.

## Evidence

- `reviews/chat-screen.md` → `## Loop record` → `review/8`: the first attempt's stop (the key),
  the concurrent second attempt (hidden-failure promoted, correctness killed), the detached third
  run, the durations.
- `reviews/chat-screen.hidden-failure.d2e7d11.json` (promoted at 09:17 on the concurrent run) and
  `reviews/chat-screen.correctness.d2e7d11.json` (promoted at 09:37 on the detached run; its
  summary line is time-stamped by the critic).
- The orphan worktree: observed with `git worktree list` in this session and removed with
  `git worktree remove --force`; the only durable trace is this sentence.
- Novelty: `BACKLOG.md` of this repository has no item on a killed critic run or a leftover review
  worktree (its only hit for "key" is OPS-3's hosted-runner note; AAR-1 covers re-running one
  refused critic, which is the recovery used, not the failure). The workflow repository's
  `BACKLOG.md`: OPS-56 (a killed round's artifacts, closed by construction), BUG-23 (`/close`'s own
  worktree cannot switch branches), OPS-71 (a rejected reply discarded) — adjacent, none this. Its
  `.aar/rejected-lessons.md` has no entry mentioning a kill, a cap, a timeout, or a worktree.

## Material evidence consulted and excluded

- **The first attempt's "codex exited 1" stops** (the revoked Fireworks key). Excluded: the stop
  class named the failure exactly, the cause was outside the loop, and the recovery (re-run the
  refused critics with the same round id) is AAR-1, already filed. A control that caught what it
  was built to catch.
- **The doc-drift `TRIAL CLOSED`.** Excluded: expected, documented, recorded.
- **The MCP noise line in codex's stderr** (`resources/list failed for mempalace`). Excluded:
  unrelated to the kill and to the loop.

## Isolated or systematic?

**Systematic in kind, rare in incidence, on this basis:** any caller with a time ceiling — the
harness's background cap here, a CI job's step timeout elsewhere — meets it whenever a critic's
duration crosses the ceiling, and nothing in the loop measures or bounds that duration. It has
been observed once, on one large diff, with one slow route.

## Candidate lesson

A review critic has no stated time budget and no stop class for being killed from outside. When a
caller's ceiling is lower than a critic's duration, the round loses the critic's work, leaves a
worktree behind, and records nothing unless the operator notices. The loop should either state
how a long pass is run (detached from any caller ceiling, or with the ceiling raised) or have the
runner clean up and record on termination — which of these is a later story's decision, not this
lesson's.

## Competing explanations

- **This is the caller's limitation, not the loop's.** The ten-minute cap belongs to the tool that
  launched the shell; a terminal session has no such cap, and `run_codex` cannot see or prevent a
  `SIGKILL`. On this reading the lesson shrinks to an operator habit — launch long critics
  detached — and no control is missing. This explanation is genuinely competing: it is the one a
  reader who never uses a capped caller would give, and it may be right about where the fix
  belongs. It does not explain away the second half: even under a terminal, a critic interrupted
  by any signal the runner can catch leaves its worktree.
- **The diff was unusually large.** The lockfile inflated it, and a smaller story's critics would
  finish well inside ten minutes. True, but it narrows the incidence, not the mechanism.

## What would weaken, narrow or disprove it

- A measurement over past rounds showing critic durations rarely approach any caller's ceiling
  would make the budget half low-leverage.
- Confirmation that the kill was `SIGKILL` (uncatchable) would narrow the cleanup half to "prune on
  the next run" rather than "trap and clean".
- A runner change that already prunes stale `claude-review-*` worktrees on start would close the
  cleanup half outright.

## What must not be generalized

- Not "concurrent critics are unsafe": the concurrency did not cause the kill, and the earlier
  double failure was the key.
- Not a product finding: nothing in V-Tina was wrong.
- Not a claim about glm-latest's speed in general: one route, one diff, one measurement.
