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

## Done
