Date: 2026-09-27 · Branch: claude/refusal-diagnostics · Status: approved · Class: deployed

# refusal-diagnostics — FEAT-3: keep enough of a refused quotation to diagnose it

**Approved 2026-09-27.** Thomas, at the frame consult: "B, and as recommended on everything else".
Option B is taken for Open question 1. Every other disposition is the one recommended at the consult,
and all are recorded under *Design decisions* below.

## Problem

When the quotation screen refuses a quotation, the reader gets the provenance notice and the server
log gets one line: the check's reason and the quotation's **first 60 characters**. The refused text
never reaches the reader, by design. So when those 60 characters match the record, the point where
the model's wording leaves the record lies past the cut, and a live refusal cannot be diagnosed from
what was logged.

It has cost two diagnoses so far, both during live verification of `answer-voice-screen`
(`reviews/answer-voice-screen.md` → "Live again, after the citation fix", and the round-5 live run:
"Centers shall provide this service twenty-four hours a day…"). Each had to be worked out
indirectly, by re-running retrieval and searching the corpus for the prefix.

Thomas wants the refusal recorded well enough to tell what was wrong: the whole quoted span, which
check failed, and which document was taken as the citation (`BACKLOG.md` → FEAT-3). It is
server-side only. The backlog item also puts a decision first: settle what a server log may hold
before widening it, and keep that apart from the unresolved decision on whether the public's
questions are stored at all (the audit-log stub, `reviews/answer-voice-screen.md` → Non-goals).

**Why the privacy question is real, not theoretical.** A refused quotation is, by definition, text
the record does not contain. The answering model's input includes text the reader wrote: their
question, and the conversation history their browser sends, where the reader controls both the
user and the assistant turns. So a refused quotation can be the reader's own words quoted back.
Today at most 60 characters of that can reach the log. **Decided (option B):** the log keeps the
whole quotation only when its opening is the record's own words. Otherwise it keeps the opening
alone, as today.

## In scope

1. **One refusal record for every quotation refusal.** This covers a quotation in the opening, a
   quotation after it, and a broken quotation mark. The record holds the quotation, the check that
   refused it, and the documents taken as its citation.
2. **The shortening rule (option B).** A refused quotation is logged whole when its opening appears
   in a passage retrieved for the answer. Otherwise only its opening is logged, and the entry says
   it was shortened, from what length, and why.
3. **The verifier reports every document it checked.** When one sentence names several documents,
   the check tries each of them. Today the refusal reports only the nearest.
4. **The record reaches the server log intact, as one entry.** It is not cut by a character limit,
   by the console's own formatting, or by line breaks.
5. **The README** states:
   - what a refusal's log entry holds;
   - the shortening rule;
   - that the entry never holds the reader's question;
   - the remaining exposure: a quotation that opens with the record's words may go on to repeat the
     reader's.

## Non-goals

- **The audit log, and storing the public's questions.** `audit_log_status` stays
  `recorded: false`. This story decides only what a *refusal's* log entry may hold.
- **Anything the reader sees.** The stream, the provenance notice and the wire contract are
  unchanged.
- **Refusals that are not about a quotation.** An opening that impersonates the Governor, and the
  cadence log, keep their current log lines.
- **The "quotation released without a detected citation" log line.** It is cut at 60 characters
  too, but it records a quotation that was *released*, which the reader already saw (Open question
  3, decided: leave it).
- **The documents retrieved for the answer.** The entry does not list them (Open question 2,
  decided: no).
- **A logging library.** One record at one call site does not earn a dependency. The existing
  injected logger stays the only logging seam.
- **Choosing a log host or its retention.** Nothing is deployed yet. A host may cap the length of
  one log line. This story guarantees only that the process emits the whole record, and the host's
  cap is something to check when a host is chosen.
- **Locating the divergence automatically** (Open question 1, option C, not taken).

## Acceptance criteria

Criteria 1–7 are observable in the product's behaviour: what the operator reads in the server log,
and what the reader receives. Criteria 8–9 are bookkeeping and stay as plain assertions, per
`AGENTS.md`. Criterion 7 was added at approval for option B. The README and scope criteria moved from
7–8 to 8–9. Criteria 1–6 keep the numbers the consult ratified.

1. **Given** an answer containing a quotation whose first 60 characters appear in a passage
   retrieved for the answer, and whose later words do not,
   **When** the screen refuses that quotation,
   **Then** the one server log entry recording the refusal holds the whole quotation, however long,
   so the point where it leaves the record can be found from that entry alone.

2. **Given** a quotation refused by any of the screen's quotation checks,
   **When** the operator reads the refusal's log entry,
   **Then** it names which check refused the quotation.

3. **Given** a quotation whose sentence names one or more documents,
   **When** the screen refuses it,
   **Then** the refusal's log entry names every document the quotation was checked against, and no
   other.

4. **Given** a quotation that has no document named before it, or that was refused before any
   citation was read,
   **When** the screen refuses it,
   **Then** the refusal's log entry states that no document was taken as its citation.

5. **Given** a reader's question and earlier turns of the conversation,
   **When** the screen refuses a quotation in the answer,
   **Then** the refusal's log entry holds none of the reader's question, its neutral rewrite, or the
   earlier turns, beyond any words the refused quotation itself contains.

6. **Given** an answer in which the screen refuses a quotation,
   **When** the reader receives the answer,
   **Then** they see the provenance notice as before and none of the refused quotation's words.

7. **Given** a quotation longer than 60 characters whose first 60 characters appear in no passage
   retrieved for the answer,
   **When** the screen refuses it,
   **Then** the refusal's log entry holds only those first 60 characters,
   **And** it states that the quotation was shortened, its full length, and that its opening is not
   in the retrieved record.

8. The README states what a refusal's log entry holds, the shortening rule, that the entry never
   holds the reader's question or conversation, and that a quotation opening with the record's words
   may go on to repeat words the reader wrote.

9. Scope containment: `git diff --name-only main...HEAD -- . ':(exclude)reviews/'` lists only
   `src/lib/voice.ts`, `src/lib/chat/orchestrate.ts`, `__tests__/answer-screen.test.ts`,
   `__tests__/voice.test.ts`, `__tests__/chat-orchestrate.test.ts`, `README.md` and `BACKLOG.md`
   (FEAT-3 moved to Done at close).

## Test notes

### Risks — the wrong states a person could meet

- **R1 — Still truncated.** The operator opens a refusal and the quotation is still cut short. The
  cause could be a new character cap, the console's own formatting of a long value, or the entry
  being split into several log lines. The divergence stays unrecoverable, which is the failure
  FEAT-3 exists to fix.
- **R2 — Wrong attribution.** The entry names a different document from the ones the check used.
  For example, it names only the nearest document when the sentence named two. Or it leaves the
  citation blank when one was read. Either way the operator investigates the wrong document.
- **R3 — The reader's question reaches the log.** A later "for context" addition puts the asked
  question, its rewrite, or the conversation into the refusal entry. That would decide the
  audit-log privacy question by accident.
- **R4 — The refused text reaches the reader.** Widening what a refusal carries leaks it into the
  stream, which breaks the rule that an unverifiable quotation never reaches the reader.
- **R5 — A refusal path is missed.** One path still logs the old 60-character form: a quotation in
  the opening, a quotation after it, or a broken mark. The fix then works on the tested case and
  fails on the next live refusal.
- **R6 — An entry grows without limit.** *Added at the consult from the design review, as a
  **stated limit with no check**.* The bound: a refusal ends the answer, and the provider caps the
  answer at `ANSWER_MAX_TOKENS` (`src/lib/chat/deps.ts`). So one entry is never longer than one
  answer, and an answer has at most one.
- **R7 — The shortening rule misjudges.** *Added at approval for option B.* It can fail in two
  directions:
  - It logs whole a quotation whose opening is not in the record. The reader's own words then reach
    the log, which is the exposure B exists to avoid.
  - It cuts a quotation whose opening is in the record, and the diagnosis is lost again.

### Oracles

| AC | Oracle | Mechanism |
|---|---|---|
| 1 | Small | **R1.** A suite test drives the screen with a quotation whose first 60 characters are in the cited passage and whose tail is not. The quotation is sized from the answer's own token budget (`ANSWER_MAX_TOKENS` × 4 characters), which is past the console's 10,000-character cut. The test asserts on what the injected logger receives. Red when the entry lacks the quotation's final words, holds a line break, or arrives as more than one log call. **Plus one smoke test** on the real default logger with the console spied. Red when the console receives anything other than a single string holding the quotation's tail. |
| 2 | Small | **R5.** A suite test triggers a refusal down each path (a quotation in the opening, a quotation after it, each broken-mark kind) and for each refusing reason. The reasons come from a fixture table keyed by the declared reason type, so the typecheck fails when a reason is added without a case. Red when any case's entry lacks its check, names a different one, or has the old truncated form. |
| 3 | Small | **R2.** Two cases. In the first, a quotation's sentence names two documents and neither holds the words. In the second, the nearest named document is in an earlier sentence. Red when the entry names only one of the two, names a document the check did not test, or is blank. |
| 4 | Small | **R2.** An uncited fabricated quotation, and an elided one. Red when the citation list is absent, is not exactly empty, or names a document. |
| 5 | Small | **R3.** The whole exchange runs with fake collaborators. A question and earlier turns carry a distinctive marker that the refused quotation does not contain. It runs on both the in-bounds path and the partisan (rewritten) path. Red when the marker or the rewrite's text appears in the refusal entry, or when the entry holds any field beyond those the README documents. |
| 6 | Small | **R4.** The existing never-reaches-the-reader tests, plus AC1's long diverging quotation and AC7's invented one. Every event the reader receives is checked, not only the answer text. Red when any of the refused quotation's words appear in any event, or when the provenance notice is missing or changed. |
| 7 | Small | **R7.** Two cases. First, a quotation longer than 60 characters whose opening is invented. Second, the record's own opening, line-wrapped by the model, followed by a diverging tail. Red when any of the invented quotation's text past its first 60 characters appears anywhere in the entry, when the entry lacks the shortened statement or the full length, or when the line-wrapped record quotation is cut. |
| 8 | reviewer | The reviewer reads the README against what the code records. Red when the README claims a field the entry does not hold, omits one it does, misstates the shortening rule, or leaves out the remaining exposure. |
| 9 | manual | A loop check, run once at the merge fork: the command above, with its output shown to Thomas. Red when any other path appears. |

### Proposed regressions (design review, round 655b822)

**Coverage check.** Every risk (R1–R5) and every test-judged criterion (AC1–AC6) received at least
one regression. AC8 (reviewer) and AC9 (manual) are judged by a person and owe none. No gap.
**Beyond coverage:** the reviewer proposed one risk the list lacked, the size of one refusal entry.
It was ratified as R6, a stated limit.

**R7 and AC7 postdate the design review.** They were added at approval for option B. As the consult
said they would be, their regressions are the builder's own (last two rows), written after approval.
They are flagged to Thomas with the approval record, and not reviewed by the design critic.

| Names | Oracle | Regression | Disposition (2026-09-27) |
|---|---|---|---|
| R1 / AC1 | Small | The record is serialised with an indent, or as joined fields. The whole quotation is logged uncut, but split across many lines that a line-based collector interleaves with other entries. | **Accepted.** |
| R1 / AC1 | Small | A generous cap (a slice at some large constant) replaces the 60. The test's single size passes, and the next live refusal longer than the new cap is still cut. | **Amended.** The test's quotation is sized from the answer's token budget, so a cap below what an answer typically holds goes red. A cap above anything an answer can hold truncates nothing real. That is stated here, not tested. |
| R2 / AC3 | Small | The entry logs every document named in the window, not the ones actually tested. The two-in-one-sentence case passes. The earlier-sentence case then names a document the check deliberately did not use. | **Accepted.** AC3's earlier-sentence case catches it. |
| R2 / AC4 | Small | An empty citation list cannot be told apart from a field no path ever filled in. A test that only checks that no title appears passes both. | **Amended.** The list must be present and exactly empty. A path that read a citation but wrote an empty list is caught by AC3's cases. |
| R3 / AC5 | Small | The marker test proves one exact string is absent. A leak in another form passes it, such as a new "context" field or a prompt fragment carrying the reader's wording. | **Amended.** AC5 is also red when the entry holds any field beyond the documented ones. |
| R4 / AC6 | Small | The refused words stay out of the answer text but reach the reader through another channel, such as an error event's payload or a status field, which the existing tests do not inspect. | **Accepted.** AC6 checks every event the reader receives. |
| R5 / AC2 | Small | A future refusal site reuses an existing reason and hand-builds the old 60-character string. The typecheck fires only on a new *reason*, so it stays green. | **Accepted as a stated gap.** No test can list refusal sites that do not exist yet. The mitigation is structural: the free-text refusal is narrowed to the impersonating opening, so a new quotation refusal has to build the record. |
| AC2 | Small | A grammar refusal and a verification refusal read alike in the log, so the operator goes to the wrong code. | **Rejected.** Every reason value belongs to exactly one check, so no two checks' refusals can read alike. |
| AC1 (oracle mode) | Small | The test's copy of console formatting drifts from Node's. It goes red while the product is correct, or stays green while the real console mangles the record. | **Accepted.** It is the same point as the IMPORTANT finding, and AC1's mechanism now follows it. |
| New risk | — | Lifting the 60-character limit to "however long" means a pathological quotation is written to the log in full on every refusal, and nothing in the risk list bounds that. | **Amended.** Added as R6, a stated limit with its bound. No check. |
| R7 / AC7 | Small | *Builder's own.* The opening is compared without normalising one side, so a record opening that the model line-wrapped fails the check and is cut. The diagnosis FEAT-3 exists for is then lost on exactly its own case. | Written after approval; flagged to Thomas. |
| R7 / AC7 | Small | *Builder's own.* The quotation field is cut, but the whole text still rides in the entry: kept to compute its length, or left in a second field. | Written after approval; flagged to Thomas. |

## Loop record

- frame/6 — ran (codex on kimi-latest, 3 findings, 10 regressions) → reviews/refusal-diagnostics.design.655b822.json
- frame/9 — not yet reached
- review/6 — not yet reached
- review/8 — not yet reached
- close/3b — not yet reached
- close/4 — not yet reached

## Open questions

All decided at the 2026-09-27 consult.

1. **How much of a reader's own words may a refusal's log entry hold?** **Decided: B.** The whole
   quotation is kept when its opening is in a retrieved passage. Otherwise only the opening is
   kept, as today, and the entry says so. The options put were:
   - **A:** the whole quotation, always.
   - **B:** as above.
   - **C:** no text, only where the match ended.
2. **Should the entry also list the documents retrieved for the answer?** **Decided: no.**
3. **Should the "released without a detected citation" line be widened as well?** **Decided:
   leave it.**

## Codex (kimi-latest) design review (2026-09-27)

**Verdict:** it would build it this way. The design has one record type, one shared builder at the
refusal sites, and one serialisation point through the existing injected logger. Both claims the
design rests on were checked against the code: the refusal sites cut at 60 characters, and the
verifier reports only the nearest document while testing more than one. It judged JSON-stringifying
the record the standard answer to the console's truncation, and turning down a logging library
correct at one call site. It had two cautions: the privacy decision must be taken at the consult
rather than by the sketch's default, and AC1's oracle.

**QUESTION — the sketch builds option A while Open question 1 is undecided** (one-way × standard).
Once a log host is chosen and entries are retained, reader words already written cannot be
unwritten. The sketch's shape is agnostic between A and B, since B adds one predicate at record-build
time. *Alternative:* put A/B/C to Thomas as the consult's lead item, and implement only the chosen
option. *Win:* the privacy posture of the server log is decided once, deliberately.

**IMPORTANT — AC1's oracle re-implements console formatting in the test** (two-way × kludgy). "Formats
the spied arguments exactly as the console does" is a second copy of the delivery mechanism, and it
can drift from the real console. *Alternative:* assert on what the injected logger receives: one
string holding the quotation's final words and no line break. Keep one thin smoke test on the real
default logger that asserts the console received one string holding the tail past 10,000
characters. *Win:* the test fails when the criterion fails, and not when its private console
replica disagrees with Node.

**NIT — the helper contract misdescribes the grammar site** (two-way × standard). The sketch says the
helper takes "the UnverifiedQuotation the verifier already returns", but the mid-answer grammar
site holds a lexer token and calls no verifier. *Alternative:* the helper takes the record's fields.
The verifier-backed sites pass their result through, and the grammar site builds the record from
the token. *Win:* no spurious verifier call is added to the grammar path.

**Builder's check of the review.** One correction to both the sketch and the review. The mid-answer
grammar site does not cut at 60 characters: it logs the reason alone and **no text at all**. It is
still in scope, since a refusal there is as undiagnosable as the others.

## Design decisions (2026-09-27)

Thomas: "B, and as recommended on everything else". These bind the build.

| Item | Decision |
|---|---|
| QUESTION: privacy, Open question 1 (one-way) | **B.** The whole quotation is kept only when its opening is in a retrieved passage. Otherwise only the opening is kept, with a shortened statement. It adds AC7 and R7. |
| IMPORTANT: AC1's oracle re-implements console formatting | **Fix,** as the reviewer proposed: assert on what the injected logger receives, plus one smoke test on the real console. |
| NIT: helper contract at the grammar site | **Fix.** The grammar site builds the problem from its token and calls no verifier. The sketch below is corrected. |
| Risk list | **R6 added** as a stated limit, bounded by the answer's token budget, with no check. **R7 added** for option B. |
| Regressions | As in the Disposition column of the regressions table. |
| Open questions 2 and 3 | The defaults stand: no retrieved-document list, and the released-quotation line is left as is. |
| `UnverifiedQuotation.citedAs` becomes a required list (two-way, internal) | Taken as sketched. |

## Design sketch — HOW

*Updated at approval for option B and the NIT. The design review judged the pre-approval version.*

**Where.** In `screenedAnswer` (`src/lib/chat/orchestrate.ts`), three sites refuse on a quotation:
- the opening's `verifyQuotations` check, which cuts at 60 characters;
- the mid-answer `verifyQuotedSpan` check, which also cuts at 60;
- a mid-answer grammar `violation` token, which logs the reason and no text.

All three go through one helper, `refuseQuotation(problem)`, which takes an `UnverifiedQuotation`:
- the two verifier sites pass through the result they already hold;
- the grammar site builds one from its token, as `{ text: t.raw, reason: t.reason, citedAs: [] }`, and
  calls no verifier.

The free-text `refuse(why)` is narrowed to the impersonating-opening refusals, which pass their
`form`. No quotation refusal can then bypass the record.

**The record** is built by a pure function in `src/lib/voice.ts`, `refusalEntry(problem, passages)`.
The privacy rule is unit-tested there, offline, beside the verifier it depends on. The record is
`{ check, quotation, citedAs, shortened }`:
- `check` is `UnverifiedQuotation["reason"]`, the union that already declares every verifying and
  grammar reason.
- `quotation` is the text the check compared: the verifier's `normalise`d span, whose
  whitespace-collapsing and curly-to-straight folds cannot move a divergence point. For a grammar
  violation it is the token's `raw` text. It is cut by the shortening rule below.
- `citedAs` is a list, and it is always present. An empty list means "no document was taken as the
  citation".
- `shortened` is `null` when `quotation` is whole. Otherwise it records the full length and the
  reason, `opening-not-in-passages`.

**The shortening rule (option B).** A constant in `voice.ts` holds the opening's length (60, the cut
the log used before). The quoted words, without their marks and normalised, are logged whole when
either:
- they are no longer than the opening, or
- their opening appears in any retrieved passage, searched in the same normalised index the verifier
  uses.

Otherwise only the opening is kept.

This keeps the full diagnosis in both branches:
- **The opening is in the record:** the divergence lies later, and the whole text shows it. Both past
  failures were of this kind.
- **The opening is not in the record:** the divergence lies within the opening, which the entry
  shows.

A quotation of the reader's words rarely opens with the record's words, so it stays at today's
exposure.

**The voice.ts change to the verifier.** `verifyQuotedSpan` reports `candidates`, the documents it
actually tested: every document named in the quotation's sentence, or else the nearest one. Today
it reports only the nearest, `named[0].title`. `UnverifiedQuotation.citedAs` changes from an
optional string to a required `readonly string[]`. It is `[]` for `no-citation`, for `elided`, and
for grammar violations. The one existing assertion on `citedAs` in `voice.test.ts` moves to the list
form.

**Serialisation.** The record is passed to the existing injected `log` as a single
`JSON.stringify`d string, under the existing context label `"answer refused on provenance"`. The
reason is Node's console formatting. The default logger is `console.error(context, value)`. A
string value is printed as-is. An object value goes through `util.inspect`, which cuts any string
past 10,000 characters and prints nesting past depth 2 as `[Object]`. That is the same truncation,
at a larger size. JSON also escapes line breaks, so a line-based log collector keeps the record as
one entry. There is no logging library: `logError` stays the seam, and tests inject it as they do
today.

**Privacy boundary.** The record carries those four fields and nothing else. `screenedAnswer` is
never handed the question or the history, and the builder does not widen its parameters to get
them. The README states the entry's fields, the shortening rule, and the remaining exposure next to
the audit-log note. It names the opening-length constant rather than restating its value.
