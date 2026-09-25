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

### FEAT-2 — V-Tina's own self-description, in her own words

**Want (Thomas, 2026-09-18).** V-Tina says "I am a virtual avatar of Gov Tina Kotek", and at first
mention may add a clause such as "designed to answer questions about the Governor's policies,
accomplishments, and stated plans, based on public official sources". She never says "I am the
Governor's assistant" — it is untrue.

**Why it does not work today.** That wording is not one of the declared frames, so the screen reads it
as missing its frame and prepends its own: the reader gets "As a virtual avatar of the Governor, I am a
virtual avatar of Gov Tina Kotek…". Verified by running the screen (`reviews/answer-voice-screen.md` →
round-4 decisions).

**Shape to consider — not decided.** Add the declarative form to the declared frames so the screen
recognises it, and teach the answering prompt when to use it and when to add the first-mention clause.
The cadence counter reads the same declared list, so it follows automatically.

**Owed by the story that builds it.** Settle the clause's wording first: "designed to **accurately**
answer" promises accuracy nothing enforces. What the system does guarantee is that quotations are the
record's own words and that anything it cannot match is refused; "based on public official sources" is
accurate, since the corpus is Oregon executive orders and bills. Keep the claim to what holds.

**Sequencing.** Touches `src/lib/voice.ts` and `src/lib/prompts.ts`, which `answer-voice-screen` also
edits — start after that story merges.

### FEAT-3 — Keep enough of a refused quotation to diagnose it

**Want (Thomas, 2026-09-19).** When the screen refuses a quotation, what it records is enough to tell
what was wrong with it.

**Why it does not work today.** The refusal log keeps only a quotation's first 60 characters, and the
refused text never reaches the reader by design — so when the visible prefix matches the record, the
divergence lies past the cut and the refusal cannot be diagnosed from a live run. It cost two
diagnoses during round-4 live verification of `answer-voice-screen`; both had to be reasoned out
indirectly, by re-running retrieval and searching the corpus.

**Shape to consider — not decided.** Record the whole quoted span, which check failed, and which
document was taken as the citation. Server-side only; nothing reader-facing changes.

**Owed by the story that builds it.** Decide what a server log may hold before widening it. The
quotation is model output about public records, but the reader's question sits beside it in the same
log, and whether the public's questions are stored at all is deliberately unresolved
(`reviews/answer-voice-screen.md` → Non-goals, the audit-log stub). Keep those two decisions apart.

**Sequencing.** Independent of FEAT-1 and FEAT-2. Touches `src/lib/chat/orchestrate.ts`, which
`answer-voice-screen` also edits — start after that story merges.

### FEAT-4 — Tell the reader an answer can take a while

**Want (Thomas, 2026-09-24).** A reader is told that an answer can take a while to begin.

**Why it is needed.** Classification may now take up to 10 seconds before anything streams (raised
from 3 s in `reviews/oregon-default-jurisdiction.md`, because a missed deadline turns the reader
away). Silence that long reads as a broken page.

**Shape to consider — not decided.** A notice or progress indicator on the chat screen, shown from
the moment a question is sent until the first record arrives. The screen is User Story 4 and does not
exist yet, so this is a requirement on that story. Whether the stream should also send an early
"working" record is part of the same decision.

**Sequencing.** With or after User Story 4's chat screen.

### FEAT-5 — Consider caching answers to common questions

**Want (Thomas, 2026-09-24).** Contemplate caching responses for common questions, so a frequently
asked question does not pay the classification and answer time every time.

**Shape to consider — not decided.** Two levels, with different costs. Caching the classifier's
verdict by exact question text removes the slowest, least predictable step for repeats and changes
nothing a reader sees. Caching whole answers saves more but is harder to keep honest: an answer must
be invalidated when the corpus changes, it freezes one sample of a varying model, and it must still
pass the quotation screen as served.

**Owed by the story that builds it.** A cache stores the public's questions, which is the privacy
decision deliberately left open (`reviews/answer-voice-screen.md` → Non-goals, the audit-log stub;
FEAT-3 keeps the two apart). Decide that first. Measure how often questions actually repeat before
building: exact-text repeats may be rare. A cached verdict also sidesteps the drift the routing
measurement watches for, so the cache's lifetime must be shorter than the re-measure interval (OPS-3).

**Sequencing.** After FEAT-4 and User Story 4; there are no readers to repeat questions yet.

### OPS-1 — The policy-pillars comment still counts the pillars

**What is wrong (found 2026-09-20).** The comment above `POLICY_PILLARS` in
`src/lib/ingest/pillars.ts` calls them "Governor Kotek's three stated priorities", while the same
comment says pillars are "an open classification expected to grow with the corpus". The number is a
second statement of the list's length, and it goes false the day a pillar is added
(`workflow-protocol.md` → *Counts are copies*).

**The fix.** Name the kind — "Governor Kotek's stated priorities" — and leave the list as the only
statement of how many there are.

**Why it is filed rather than fixed.** The approach review of `answer-voice-screen` (round 3b101a0)
reported it, and that story's declared file scope does not include this file; Thomas kept the scope
rather than widen it for a comment.

**Sequencing.** Independent. If OPS-2 lands first, its check flags this line and the fix rides there.

### OPS-2 — Catch counts in living text mechanically

**Want (Thomas, 2026-09-20).** A number in living text that restates the size of a set defined
elsewhere is caught when the gate runs, not by a reviewer a round later.

**Why it recurs today.** The rule is read, never run. Successive review rounds of
`answer-voice-screen` each found counts that had survived the previous round's fix, because each fix
covered the instances named or the sections swept, and nothing checked the rest. Instances and dates:
`reviews/answer-voice-screen.md` → round-6 decisions.

**Shape to consider — not decided.** A check that flags a number word standing next to a noun that
names a declared list ("three lists", "five fields"), either as a test in the existing suite or as a
separate gate check. The hard part is the boundary: dated records — story files, review artifacts,
Done rows — may carry counts by design, and a parameter such as a threshold or a limit is not a count
at all.

**Owed by the story that builds it.** Measure false positives on this repository before adopting it,
and state how a flagged number that is genuinely a rule or a parameter is exempted, so the exemption
is visible rather than a silent allowlist.

**Sequencing.** Independent of the FEAT items. Its first run should flag OPS-1's line.

### OPS-3 — Re-run the classifier measurement on a schedule

**Want (Thomas, 2026-09-24).** The routing measurement FEAT-1 built runs on a schedule as well as by
hand, so drift with no code change is seen.

**Why it is needed.** The classifier's verdict on the same question has changed within a day with no
code change (`reviews/backlog-oregon-context.md`). The gate catches a changed instruction, model or
question set; it cannot catch the provider's model behaving differently under the same name.

**Shape to consider — not decided.** A scheduled job that runs `npm run eval:classifier` and reports
a failed receipt. It needs a hosted runner holding the Fireworks key, which this repository does not
have, and a decision on where a scheduled run's receipt is committed.

**Sequencing.** After FEAT-1 (`reviews/oregon-default-jurisdiction.md`) merges.

### AAR-1 — Recover a partial correctness refusal by re-running only the refused critic

**What happened (2026-09-21).** In `answer-voice-screen` round 26728d4 the review runner refused the
correctness critic's reply — its final message was not valid JSON — while the hidden-failure critic
and the doc-drift shadow passed. The loop's only recovery for that, "round stopped; rerun /review",
repeats the whole step and so dispatches all three critics again.

**The lesson.** Repeating the whole step spends one of the doc-drift trial's capped runs on a commit
the trial has already sampled, and replaces the results that passed. The narrower recovery — re-run
only the refused critic, with the same round id, base and prompt, against an unchanged HEAD —
completed the round at neither cost, and the loop describes it nowhere, so the next builder to meet a
partial refusal must either spend the run or improvise.

**Weight — as checked.** The independent lesson check found the lesson real and modest. The cap cost
is the weaker half: the trial's ledger shows a run consumed the same day by an ordinary stop in
another repository, so spending the cap is not peculiar to this path. The undocumented recovery is the
stronger half. When the decision was taken, no commit had yet been sampled twice. Evidence and the
corrected figures: `reviews/answer-voice-screen.md` → `review/8` and "Codex correctness pass — round
7", and `reviews/answer-voice-screen.lesson.26728d4.json`.

**Remedy — not decided.** Approving the lesson approves no change. Documenting the narrower recovery in
the review skill, or teaching the runner to decline a second trial run for a round it has already
sampled, is a later story through the workflow's own loop.

## Done
