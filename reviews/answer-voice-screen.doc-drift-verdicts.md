# Doc-drift shadow critic — verdicts

The doc-drift critic runs beside the correctness pass while its trial is open (`BACKLOG.md` OPS-91).
Its findings are **recorded and judged here, never acted on and never put in the decision menu** —
this file is kept apart from `reviews/answer-voice-screen.md` so that the other critics, which read
the story file in later rounds, are not primed by claims that were never ratified.

A verdict is **real** (the sentence is false after this branch), **false alarm**, or **cannot tell**,
judged on the whole sentence rather than the quoted fragment.

## Round 3b101a0 (2026-09-20)

Base `main`, as the shadow pass always uses. 10 findings — **9 real, 1 false alarm, 0 cannot tell.**

| # | Title | file:line | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Status still counts two missing endpoint capabilities | `README.md:17` | **real** | Only the chat screen is still absent; the voice work is this branch, so "two things" is now one |
| 2 | Status still calls the answering prompt a plain placeholder | `README.md:17` | **real** | `ANSWER_SYSTEM_PROMPT` (`src/lib/prompts.ts:102`) is the finished avatar prompt, not a placeholder, and the voice story is not "next" |
| 3 | Module docstring still calls voice prompts provisional | `src/lib/prompts.ts:19` | **real** | `PROVISIONAL_PROMPTS` is `[]` (`src/lib/prompts.ts:176`) and both notices are classified reader-facing |
| 4 | Module docstring still describes a plain placeholder prompt | `src/lib/prompts.ts:23` | **real** | The prompt below it now decides the avatar frame, quotation marks, citation form and cadence |
| 5 | Stale claim that a test holds the provisional README list equal | `src/lib/prompts.ts:27` | **real** | The README-equality test (`__tests__/readme-prompts.test.ts:80`) loops over the reader-facing and routing lists only; nothing compares a README provisional list with the empty constant |
| 6 | Frame comment overgeneralizes to every reader-facing notice | `src/lib/voice.ts:23` | **real** | `FAILURE_NOTICE` (`src/lib/prompts.ts:154`) is a reader-facing notice and opens "Something went wrong…", deliberately not with the frame |
| 7 | Reader-facing list comment includes a deliberately neutral notice | `src/lib/prompts.ts:191` | **real** | Same constant: its own docstring says it is "Deliberately NOT in character", so "the avatar's own voice" is not true of the whole list |
| 8 | Wire documentation omits provenance text in streamed tokens | `README.md:228` | **real** | `refuse` yields `PROVENANCE_NOTICE` as a `streamed_tokens` event (`src/lib/chat/orchestrate.ts:361`), so the either/or is not exhaustive |
| 9 | Prompt overstates quotation-like mark enforcement | `src/lib/prompts.ts:112` | **real** | Inside a quotation every listed mark is the record's own content, so a faithful quotation containing `«` is released, not stopped. The overstatement is deliberate instruction-writing, but the sentence is false as a statement about the system |
| 10 | Provenance documentation omits the no-citation release path | `README.md:351` | **false alarm** | The sentence says an *unverifiable* quotation stops the answer, and it does: `verifyQuotedSpan` returns `no-citation` only when the words **are** in a passage (`src/lib/voice.ts`, the `inAny()` branch) — otherwise `not-in-any-passage`, which refuses. The critic read the `UnverifiedQuotation` type name as "could not be verified" |

**Trial note.** Findings 1–5 are the same stale block the approach critic reported independently this
round on a different model family, which is corroboration rather than duplication: the approach
critic reached it from the accepted sweep, the shadow critic from the branch's changed names.
Findings 6–9 are four the approach critic did not reach, all in code comments and the wire table.

## Round 26728d4 (2026-09-21)

Base `main`. 5 findings — **5 real, 0 false alarm, 0 cannot tell.** The correctness and hidden-failure
critics were given the branch diff with this file and the shadow's artifacts excluded, so this round's
line-by-line findings were not primed by the shadow's; the loop record still names the artifact path,
so the isolation is partial.

| # | Title | file:line | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Wire table omits provenance text in streamed tokens | `README.md:230` | **real** | Repeat of round 3b101a0's #8, unchanged: `refuse` yields `PROVENANCE_NOTICE` as `streamed_tokens` (`src/lib/chat/orchestrate.ts:361`) |
| 2 | Prompt overstates quotation-like mark enforcement | `src/lib/prompts.ts:111` | **real** | Repeat of #9: inside a quotation the listed marks are content, and a verified quotation is emitted raw (`src/lib/chat/orchestrate.ts:480`) |
| 3 | Frame comment overgeneralizes to every reader-facing notice | `src/lib/voice.ts:23` | **real** | Repeat of #6: `FAILURE_NOTICE` (`src/lib/prompts.ts:153`) does not open with the frame |
| 4 | Reader-facing list comment includes a neutral notice | `src/lib/prompts.ts:191` | **real** | Repeat of #7: `FAILURE_NOTICE`'s own docstring says it is deliberately not in character |
| 5 | Lexer docstring claims totality despite its stated astral limit | `src/lib/voice.ts:217` | **real** | **New.** "the grammar is total over quotation marks rather than letting an unrecognised one through as prose" — false: `🙶🙷🙸` pass as prose, as the comment on `NAMED_QUOTE_MARKS` (`src/lib/voice.ts:133`) now states. The sentence predates this round; the limit written this round is what made the contradiction visible |

**Trial note.** Round 3b101a0's one false alarm (the no-citation path) was not repeated. Finding 5 is
the pattern the round-6 approach review named — a claim corrected in one copy and left standing in
another. Neither line-by-line critic reported it this round; the correctness critic's one finding
was elsewhere.
