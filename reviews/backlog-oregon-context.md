Date: 2026-09-17 · Branch: claude/backlog-oregon-context · Status: approved · Class: records

# backlog-oregon-context — backlog "assume Oregon context where reasonable"

## Problem

A neutral question that names no jurisdiction is declined as out of bounds even when it sits squarely
inside V-Tina's pillars. Thomas wants V-Tina to read such a question as being about Oregon state
government, answer it from Oregon's record, and say so. It is router work — story 2's classifier and
rewrite, which story 3 excludes — so it is recorded now and built later. This repository has no
`BACKLOG.md`; this story creates it with this one item.

**What was observed, and when.** On 2026-09-16, verifying `answer-voice-screen` round 8175a2d, "What
does the record say about addiction treatment and recovery services?" was declined by the classifier 7
times in 8 (the eighth a timeout), after three in-bounds verdicts the same day with no code change
(`reviews/answer-voice-screen.md` → *Post-fix verification (2026-09-16, round 8175a2d)*). The
classifier sees only the bare question, and its instructions end with a tie-break: a question that
"could be read more than one way" is declined. A question that names no state can be read as national.

**The experiment, 2026-09-17.** A throwaway script, no project code changed, sent each question to
the live classifier 6 times with today's instructions and 6 times with one added rule: a question that
names no country, state or other jurisdiction is about Oregon state government, while one naming
federal policy, another state or another country stays out of bounds.

| Question | Must be | Today | With the rule |
|---|---|---|---|
| What does the record say about addiction treatment and recovery services? | answered | declined 6/6 | answered 6/6 |
| How are schools improving reading for young kids? | answered | declined 6/6 | answered 6/6 |
| What is being done about homelessness? | answered | answered 6/6 | answered 6/6 |
| What does federal law say about addiction treatment? | declined | declined 6/6 | declined 6/6 |
| How does California handle homelessness? | declined | declined 6/6 | declined 6/6 |
| What is the Governor's favorite food? | declined | declined 6/6 | declined 6/6 |

Promising, and small: six questions, six runs each. It shows the idea is achievable; it does not show
it is reliable.

**Guidance given to Thomas the same day, recorded so the story that picks this up starts from it:**
keep the declared frame ("As a virtual avatar of the Governor") rather than new wording; leave out
certainty language such as "confidently", because the screen guarantees quotations are the record's
words, not that an answer is complete; state the Oregon scope in the answer. Answers stay grounded
exactly as now — a question read as Oregon's still gets the deferral when the record does not cover it.

## In scope

1. Create `BACKLOG.md` at the repository root with an **Open** section and a **Done** section.
2. Add one open item, worded as in *The entry* below: the behaviour Thomas wants, why it is declined
   today, the shape to consider (explicitly not decided), what the implementing story owes, and the
   sequencing note — pointing to this file for the evidence rather than restating it.
3. Add the second open item, worded as in *The entry — FEAT-2*, on the same terms.
4. Add the third open item, worded as in *The entry — FEAT-3*, on the same terms.
5. Add the fourth and fifth open items, worded as in *The entries — OPS-1 and OPS-2*, on the same
   terms.

## Non-goals

- Any change to the classifier, rewrite or answering prompts, or any other product code.
- Deciding the question set, its thresholds, or whether the chat screen shows the reinterpreted
  question. Those belong to the story that picks the item up, at its own consult.
- Seeding other backlog items. None exist in this repository; none are reconstructed from memory.

## The entry

```markdown
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
```

## The entry — FEAT-2 (added 2026-09-18 by Thomas's direction)

**Scope amendment, stated so it can be vetoed at merge review.** This story was approved on 2026-09-18
to seed one item. At the round-4 review stop for `answer-voice-screen`, Thomas directed that his
self-description wording be backlogged rather than folded into that story; it is added here as a second
item rather than paying for a second records branch. Everything else about the story is unchanged.

```markdown
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
```

## The entry — FEAT-3 (added 2026-09-19 by Thomas's direction)

**Second scope amendment, stated so it can be vetoed at merge review.** At the round-4 close of
`answer-voice-screen`, the refusal log's 60-character limit blocked two diagnoses; Thomas directed that
it be filed. Added here rather than on a third records branch.

```markdown
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
```

## The entries — OPS-1 and OPS-2 (added 2026-09-20 by Thomas's direction)

**Third scope amendment, stated so it can be vetoed at merge review.** At the round-6 review stop for
`answer-voice-screen` (round 3b101a0), Thomas chose to file one count copy that lies outside that
story's declared files rather than widen its scope, and to file a mechanical check for the rule, since
the same class of finding had recurred round after round. Added here rather than on a new records
branch, so that story's scope-containment criterion still holds.

**Prefix — an assumption, open until merge.** These are the repository's first items that change
tooling and hygiene rather than what the product does, so `FEAT-` does not fit. `OPS-` is the
workflow's existing prefix for that kind of work, and the counts rule itself was filed under it in
the workflow's own backlog. See Open question 2.

```markdown
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
```

## Acceptance criteria

Bookkeeping throughout, so plain numbered statements rather than Gherkin (`AGENTS.md`).

1. `BACKLOG.md` exists at the repository root with an Open section and a Done section, and the Open
   section carries exactly the items in *The entry*, *The entry — FEAT-2*, *The entry — FEAT-3* and
   *The entries — OPS-1 and OPS-2*, as approved.
2. The item's wording keeps the rule to questions that name **no** jurisdiction, keeps every other
   out-of-bounds rule, marks its design as not decided, requires the measured question set with its
   must-decline controls, and points to this file for the evidence instead of restating it.
3. Scope containment: `git diff --name-only main...HEAD -- . ':(exclude)reviews/'` lists only
   `BACKLOG.md`.

## Test notes

### Risks — the wrong states a person could meet

- **R1 — The idea is misstated**, so the story that picks it up builds something Thomas did not ask for:
  every question read as Oregon's, instead of only a question that names no jurisdiction.
- **R2 — A small probe is taken for proof.** A later reader treats six questions run six times as
  settled reliability and skips the measured question set.
- **R3 — The item reads as decided.** Its suggested shape is built without its own consult.

### Oracles

| AC | Oracle | Mechanism |
|---|---|---|
| 1 | manual | **R1.** Thomas reads `BACKLOG.md` at merge review against *The entry* he approved here. Red when the file is missing, lacks either section, or the item's text differs from the approved wording. |
| 2 | manual | **R1, R2, R3.** The same read, judged against his request. Red when the rule is widened past "names no jurisdiction", the must-decline controls or thresholds are missing, the shape reads as decided, or the probe's numbers appear in the item as settled fact. |
| 3 | manual | Loop check, run once at the merge fork: the enumerated diff command, output shown to Thomas. Red when any path other than `BACKLOG.md` appears. |

**No regressions list:** the `records` class runs no design review and no demonstrate-red, and no
criterion names a size (`workflow-protocol.md` → *Change classes*).

## Loop record

- frame/6 — n/a — records class: no design review runs (workflow-protocol.md → Change classes)
- frame/9 — n/a — records class: no demonstrate-red, and no criterion names a size
- review/6 — n/a — records class: no reviewer pass
- review/8 — n/a — records class: no reviewer pass
- close/3b — not yet reached
- close/4 — not yet reached

## Open questions

1. **The item id prefix — a one-way door.** This is the repository's first backlog item, so every later
   item copies its prefix, and changing it afterwards means relabelling them all. The workflow's
   existing prefixes name a kind of work — `BUG-`, `OPS-`, `AUDIT-`, `AAR-`. Proposed: **`FEAT-`**, for a
   change in what the product does.
   **Resolved 2026-09-18: `FEAT-`** (Thomas). `STORY-` was declined as colliding with the product
   spec's user-story numbering, and `IDEA-` as misleading once an item is built.
2. **The prefix for tooling and hygiene items — a one-way door once merged.** `OPS-1` and `OPS-2` are
   the first such items here, so later ones copy the prefix. Assumed: **`OPS-`**, the workflow's
   existing prefix for this kind of work. The cost: the deployed workflow documents cite items in the
   *workflow's* backlog as "`BACKLOG.md` OPS-NN", and a reader in this repository could look them up
   here instead; the numbers cited there are far above this repository's for now, so the collision is
   latent rather than live. The alternative is a prefix of this repository's own, which avoids that
   ambiguity at the price of a second vocabulary. Put to Thomas at the `answer-voice-screen` round-6
   fork (2026-09-20).


## Approval (2026-09-18)

**Thomas: "In the entry, as written"** — scope approved with the entry's requirements (only questions
that name no jurisdiction; the shape not decided; a measured question set) kept in `BACKLOG.md` on the
item they constrain, and the evidence kept here. He first asked why a builder would skip requirements
kept only in this file; the answer given was that the difference is small — the entry is certain to be
read when the item is picked up, a pointer only if followed, and the next story's design review and
consult would catch a missing requirement anyway — and that the better reason for keeping them in the
entry is that they are requirements on the work, not evidence. Prefix: `FEAT-`.

## Design sketch — HOW

N/A — mechanical. One new markdown file holding one entry; no structure, pattern or dependency. The
evidence is stated once, here, a dated record; the entry is living text and points to it, so it carries
no measurements that could go stale (`workflow-protocol.md` → *Counts are copies*).
