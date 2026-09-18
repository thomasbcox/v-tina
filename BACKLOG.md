# Backlog

## Open

### FEAT-1 — Read a question that names no jurisdiction as being about Oregon

**Want (Thomas, 2026-09-17).** A neutral question that names no country, state or other jurisdiction —
"What does the record say about addiction treatment and recovery services?" — is read as a question
about Oregon state government, answered from Oregon's record, and the answer says so: "As a virtual
avatar of the Governor, here is what Oregon's record shows about …". Keep the declared frame; add no
certainty language such as "confidently".

**Why it is declined today.** The classifier sees only the bare question, and its instructions decline
a question that can be read more than one way; one that names no state reads as possibly national. A
one-rule experiment moved the ambiguous questions in bounds and kept the must-decline controls out.
Evidence and dates: `reviews/backlog-oregon-context.md`.

**Shape to consider — not decided.** Narrow the tie-break to jurisdiction alone, leaving every other
out-of-bounds rule as it is; carry the Oregon reading into retrieval and the answer; disclose the
reinterpreted question the way the partisan rewrite's `neutralisedQuestion` already is.

**Owed by the story that builds it.** Reliability measured, not asserted: a fixed question set — questions
that must now be answered, and controls that must still be declined (federal policy, other states,
personal questions about the Governor, partisan traps) — each run many times, with pass thresholds, the
stricter one on the declines. Re-run on any prompt or model change and on a schedule: the same question
changed verdict within a day with no code change. Grounding and quotation checks stay as they are.

**Sequencing.** Changes the router (story 2's code) and edits `src/lib/prompts.ts`, which
`answer-voice-screen` also edits — start after that story merges. The question set overlaps User
Story 5's stress-test suite.

## Done
