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

## Acceptance criteria

Bookkeeping throughout, so plain numbered statements rather than Gherkin (`AGENTS.md`).

1. `BACKLOG.md` exists at the repository root with an Open section and a Done section, and the Open
   section carries exactly the item in *The entry*, as approved.
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
