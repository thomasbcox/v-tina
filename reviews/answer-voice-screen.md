Date: 2026-09-11 · Branch: claude/answer-voice-screen · Status: approved · Class: deployed

# answer-voice-screen — the answering register, and the preamble screen (story 3)

## Problem

User Story 3 is the voice. V-Tina currently answers correctly and sounds like nothing in
particular: `chat-safety-routing` shipped the router with a **deliberately plain** answering prompt,
marked three prompts `PROVISIONAL`, and left the register to this story.

**The specification's lexicon cannot be sourced, and its showcase answer cannot be grounded.**
Checked against this repository on 2026-09-11, before anything was framed:

| The spec calls this one of her "lexical anchors" | Corpus documents containing it |
|---|---|
| "True North" | **0** |
| "mission-focused" | **0** |
| "not a blank check" | **0** |
| "accountability" | 6 — ordinary legislative vocabulary, not personal idiom |
| "deflection" | 1 — and there a **legal diversion programme** ("refer a person to a deflection program … before referral to the district attorney"), not a rhetorical move |

The corpus is five executive orders and six bills. **There is no speech, press-conference or
interview material in it**, so nothing here records how she talks. The spec's illustrative answer
cites "a 13% rise in unsheltered homelessness"; that figure is in **no** corpus document, and "MAC
team" in none either. Taken literally the story would force the model to choose between the spec's
style and the grounding rule story 2 shipped and verified.

**Thomas's direction, 2026-09-11, and it resolves the problem rather than routing around it:**

> "have virtual tina say 'As a virtual avatar of the Governor, I…' and use that sort of language
> whenever saying something that is not a quote. Most answers can be, or can include, quotes with
> citations."

**V-Tina never speaks as the Governor. She speaks as an avatar of her.** What the record says is
**quoted, with its citation** — and executive orders and bills are exactly the kind of text that
quotes well. Everything else — the connective summary, the characterisation, the "what this means" —
is marked as the avatar's own words.

This inverts the first sketch, which banned self-introduction as assistant throat-clearing. It is
the opposite: self-identification is the **attribution frame**, and what is banned is the
impersonation form — first person *as her*. It also turns the story's central risk into something a
machine can check: **whether a quoted span appears verbatim in a retrieved passage is a pure
function**, which is a far stronger guarantee than reading prose and hoping.

Also settled at intake: the screen holds only the **opening** and then streams, rather than
buffering a whole answer and destroying the streaming story 2 spent a round getting right.

## In scope

1. **`ANSWER_SYSTEM_PROMPT` rewritten around provenance** — quote the record wherever it answers the
   question, naming the document; frame everything that is not a quote as the avatar's own; never
   write first person as the Governor outside an attributed quotation. **The quoting contract is
   stated in the prompt**: quote contiguously from one passage, no elision, no quoting across
   passages — so a verification failure means something. The source-only rule story 2 verified is
   carried through unweakened.
2. **`AVATAR_FRAME`** (the declared self-identification) and **`IMPERSONATION_FORMS`** (the declared
   first-person-as-Governor forms). Both read by the prompt and by the screen, so the two cannot name
   different sets, and the list reaches the prompt **under an explicit forbidding instruction**
   rather than as a bare vocabulary.
3. **The opening screen** — a pure function deciding whether an opening carries the avatar frame and
   whether it impersonates, **ignoring text inside quotation marks**, because the corpus's executive
   orders carry `I, TINA KOTEK, Governor of the State of Oregon` as operative text and quoting them
   is the shape this story asks for.
4. **Quote verification** — a pure function over an answer and the passages retrieved for it,
   reporting every quoted span that is not verbatim in a passage **of the document it is cited to**.
   Set membership alone is not enough: orders quote statutes and bills share boilerplate, so a span
   can be genuine and still be attributed to a document that does not contain it.
5. **Frame cadence** — a pure function reporting any run of non-quoted prose longer than the declared
   bound that carries no re-identification.
6. **Runtime wiring, two holds.** The **opening** is held until the screen can judge it. Each
   **quotation** is held from its opening mark to its closing mark, verified, and then released;
   prose outside quotations streams unimpeded.
7. **The three screen outcomes and the two failure vocabularies.** An opening that impersonates, an
   opening merely missing the frame, and an unverifiable quotation each have named behaviour — and a
   refusal caused by any of them is **never** reported to the reader as an infrastructure failure.
8. **`GROUNDED_DEFERRAL` and `FAILURE_NOTICE` rewritten in the avatar's voice**, plus a distinct
   notice for a provenance refusal.
9. **`PROVISIONAL_PROMPTS` emptied**, with the partition check and the README pairing still holding.
10. **A live verification run**, recorded: openings read for frame and impersonation, one complex
    answer read with its passages for quote fidelity, citation and cadence, and the grounded question
    story 2 verified re-read under the new prompt.
11. **README** — the provenance rule, the declared vocabularies, the cadence bound, and what the
    screen does.

## Non-goals

- **Her idiom, and the spec's "at least two lexical anchors" criterion.** Not met, and not quietly
  reworded — it asks for phrases nothing here can source. See Open question 1.
- **A style corpus.** Sourcing her real speech is a later story with its own corpus work.
- **A new stream event for screen findings.** The wire contract is unchanged; a refusal reaches the
  reader as text, not as a new event kind.
- **The chat screen (User Story 4) and the diagnostic suite (User Story 5).**
- **The classifier and rewrite prompts** — they produce a label and a question, carry no voice.

## Acceptance criteria

Criteria 1–8 are observable by a person using the product; 9–13 are workflow bookkeeping and stay as
numbered property assertions, per `AGENTS.md`.

1. **Given** an in-bounds question the corpus can ground,
   **When** V-Tina answers,
   **Then** the answer identifies its speaker as a virtual avatar of the Governor rather than as the
   Governor.

2. **Given** any answer V-Tina generates,
   **When** a reader reads it,
   **Then** nothing **outside an attributed quotation** is written in the Governor's first person —
   the avatar never says "I" as her, while the record's own operative language ("I, Tina Kotek …")
   may be quoted as the record.

3. **Given** an answer containing quoted material,
   **When** each quotation is compared against the passages retrieved for that answer,
   **Then** every quoted span appears verbatim in a passage **of the document it is attributed to**.

4. **Given** a quotation that cannot be verified against the passages,
   **When** V-Tina is answering,
   **Then** that quotation never reaches the reader.

5. **Given** an in-bounds question whose passages contain language that answers it,
   **When** V-Tina answers,
   **Then** the answer quotes the record rather than only paraphrasing it,
   **And** any statement that is not a quotation is framed as the avatar's own.

6. **Given** an answer with a long stretch of the avatar's own prose,
   **When** a reader reads it,
   **Then** the avatar re-identifies itself before that stretch exceeds the declared bound of
   non-quoted words, so a reader arriving mid-answer is never told at length who is speaking only far
   above.

7. **Given** generated text whose opening impersonates the Governor outside a quotation,
   **When** it passes through the screen,
   **Then** that opening never reaches the reader.

8. **Given** an ordinary well-formed answer,
   **When** it passes through the screen,
   **Then** the reader receives it complete and unaltered,
   **And** it still arrives progressively, with prose outside quotations flowing as it is generated,
   **And** when V-Tina refuses for a provenance reason the reader is told that, not that something
   went wrong.

9. A question V-Tina declines still names Oregon's official state portal, the infrastructure failure
   notice still discloses that the answer is incomplete, and neither speaks as the Governor.

10. The avatar-frame vocabulary, the impersonation-form vocabulary and the cadence bound are single
    declared constants that **both** the answering prompt and the screen read, and the README
    documents them, equal in both directions.

11. No prompt this story ships attributes a phrase, slogan or stance to the Governor that no corpus
    document supports.

12. `PROVISIONAL_PROMPTS` is empty, and the checks riding on it — the exhaustive partition over every
    exported prompt, and the README pairing — still hold over an empty list rather than passing
    vacuously.

13. Scope containment: run
    `git diff --name-only main...HEAD -- . ':(exclude)reviews/'`
    and verify no files appear beyond `src/lib/prompts.ts`, `src/lib/voice.ts`,
    `src/lib/chat/orchestrate.ts`, `__tests__/`, and `README.md`.

## Test notes

### Risks — the wrong states a person could meet

- **R1 — A reader takes generated prose for the Governor's own words.** The avatar writes a
  characterisation, stance or turn of phrase that reads as hers. The risk the whole direction exists
  to remove, and the one that does not announce itself.
- **R2 — A quotation is presented as the record and is not.** Quotation marks and a document name
  make a span look verifiable; if the words are not in that document, the citation makes a
  fabrication *more* credible, not less.
- **R3 — A legitimate answer is suppressed, truncated or delayed.** A false positive eats a good
  answer, or the holds turn a streaming reply into a long silence.
- **R4 — An impersonation reaches the reader.** The prompt forbids a form the screen does not catch,
  or a path skips the screen.
- **R5 — Grounding quietly loosens.** The prompt grows longer and is about provenance; the
  source-only rule story 2 verified gets diluted and answers drift from their passages.
- **R6 — The failure notice performs the persona during an infrastructure failure**, asserting
  something false about what happened, or diluting its one load-bearing disclosure — that the answer
  is incomplete. *(From the round-1 review.)*
- **R7 — A refusal is reported to the reader as the wrong kind of failure.** A provenance veto — an
  unverified quotation, a missing frame — surfaces as "something went wrong", telling the reader
  infrastructure failed when nothing did. *(From the round-2 review, which showed R3 and R6 leave it
  uncovered.)*

### Oracles

| AC | Oracle | Mechanism |
|---|---|---|
| 1 | `Small` | **R1.** The screen over openings, driven from `AVATAR_FRAME` itself so the extent comes from the constant. Red when an opening carrying no avatar identification is judged acceptable. |
| 2 | `manual` | **R1.** A live run across the three pillars, every answer read for first-person-as-Governor outside quotation. No offline oracle exists — the suite drives a fake model returning whatever the test wrote, and the corpus legitimately contains her first person inside quotable text, so a pronoun check would false-positive on correct answers. Red when a recorded answer says "I" as her in the avatar's own prose. |
| 3 | `Small` | **R2.** The verifier over an answer plus its passages. Verbatim span in the cited document passes. Each of these fails: a span altered by one word; a span verbatim in **some** passage but not in the document it is cited to; a span in no passage at all; a span assembled across two passages; a span elided with an ellipsis. Whitespace is normalised; nothing else is. Red when any of those is reported verified. |
| 4 | `Small` | **R2.** The answer path driven with a fake generator emitting an unverifiable quotation: assert the quotation's text never appears in any emitted record, and that the exchange ends in a provenance refusal. Red when the bad quotation reaches the output, or when the hold silently drops the whole answer instead. |
| 5 | `manual` | **R2.** One complex question, live, with its retrieved passages captured beside the answer. Read for whether the record is quoted rather than only paraphrased, and whether every non-quoted statement is framed as the avatar's. Red when the answer paraphrases throughout while passages offered quotable language. |
| 6 | `Small` | **R1.** The cadence function over answers built around the declared bound: prose exceeding it with no re-identification fails; prose under it passes; a long **quoted** stretch does not count toward the bound, because the reader is being shown the record, not the avatar's assertions. Red when an over-long unframed stretch is reported compliant. |
| 7 | `Small` | **R4.** The screen over openings built from `IMPERSONATION_FORMS` itself, plus real-shaped variants: leading whitespace, markdown emphasis, differing case, the form past the first clause — **and the form inside an attributed quotation, which must pass**, since two corpus documents open exactly that way. Red when an impersonating opening passes, or when a quoted one is flagged. |
| 8 | `Small` | **R3, R7.** Three halves. A clean answer returns byte-identical, including one merely *mentioning* an impersonation form in its body. The answer path emits its first record before its last and emits more than two records for a multi-part answer, so a held opening followed by one block fails. And a provenance refusal emits the provenance notice, never `FAILURE_NOTICE`. Red when a clean answer is altered, when delivery collapses to a pause and a wall of text, or when a veto is dressed as an infrastructure failure. |
| 9 | `Small` | **R6.** Assert `GROUNDED_DEFERRAL` contains `OREGON_PORTAL_URL`; that `FAILURE_NOTICE` still discloses the answer is incomplete; and that neither contains an `IMPERSONATION_FORMS` member. Pinned against constants that already exist rather than left to a live read. The register half is read live and recorded. |
| 10 | `Small` | **R4.** Assert the prompt forbids each member of `IMPERSONATION_FORMS` — the assertion is over the forbidding scaffold, not bare containment, so a list under a neutral heading fails — requires the frame and states the cadence bound, and compare the README's documented lists against the constants in both directions, each extent parsed from its own source. Red when a form is added to the screen and not the prompt, or to either and not the README. |
| 11 | `reviewer` | **R1.** The reviewer reads every prompt this story ships, looks for any phrase, slogan or stance attributed to the Governor, and checks each against the corpus. **No mechanical oracle exists** — a grep for the five phrases the specification names passes the moment a sixth is invented, which is the failure. |
| 12 | `Small` | **R1.** Assert `PROVISIONAL_PROMPTS` is empty **and** that the partition still covers every exported prompt, so emptiness cannot be reached by deleting the list or the check. Includes the vacuity case: the partition must still fail when an unclassified prompt is added. |
| 13 | `reviewer` | Loop check, run once: the enumerated diff command compared against the AC's paths, plus a read of what landed in each. Catches no product risk — a workflow property, which is why it is not a suite test. |

### Regressions (ratified list — sourced from the step-6 design review)

Round 2, against the binding design. **Every risk R1–R6 and every sized criterion
(1, 3, 5, 6, 7, 8, 10) received at least one; there is no coverage gap.** Criteria 2, 4 and 9
are person-judged and owe none.

**R1**

- An answer opens with the required avatar frame — the screen passes it — and the body then
  characterises the Governor's motives and record in confident unattributed prose ('She has
  always put housing first', 'her commitment to accountability'), so every mechanical check is
  green while a reader still meets prose that reads as her voice and her stances. Letter (frame
  carried, no listed impersonation form) met; intent (nothing a reader would take for her own
  words) violated.

**R2**

- A quotation is verbatim in a retrieved passage but from a different document than the one
  cited — shared bill boilerplate or an order quoting a statute — so substring verification
  passes it, the answer carries a confident document name, and a reader who follows the citation
  finds the words are not there. The fidelity letter is met while the citation makes an error
  MORE credible, which is the exact harm R2 names.

**R3**

- A correct answer opens by quoting the record's own first person — 'The order states: "I, Tina
  Kotek… hereby direct…"' — and the screen's quotation-blind form matching reads the opening as
  impersonation, stripping or failing a faithful answer. The form-catcher's letter (a listed
  form appeared in the held prefix) is met; the intent (the avatar must not pose as her) was
  never engaged, because the words are the record's, attributed — and the reader loses a good
  answer.

**R4**

- An opening carries the avatar frame AND impersonates later in the same held prefix — 'As a
  virtual avatar of the Governor, I can tell you I am proud of what I have done' — so the frame
  check passes, the mid-opening first person matches no listed opening form, and an
  impersonation reaches the reader while both of the screen's checks pass their letter.

**R5**

- The rewritten prompt retains the source-only rule word-for-word (its pin passes), but the new
  provenance machinery creates an 'avatar's own words' category the model uses for unsupported
  factual assertions — every such sentence correctly FRAMED as the avatar's own, so framing and
  screen checks pass while the answer asserts numbers and programme details no passage contains.
  The letter (grounding rule present, framing rule satisfied) holds; the intent (factual claims
  come from the passages or nowhere) is gone.

**R6**

- FAILURE_NOTICE keeps the exact incompleteness disclosure, so the containment pin passes, but
  wraps it in in-character apology — 'As the Governor's avatar, I'm so sorry — something went
  wrong…' — performing a someone who erred during what may be a database outage, and diluting
  the one load-bearing fact the notice exists to deliver. Letter (the disclosure string is
  present) met; intent (no persona during infrastructure failure, disclosure undiluted)
  violated.

**AC1** *(sized criterion)*

- The test's openings are generated from AVATAR_FRAME itself, so if the constant is later
  weakened to something vacuous — 'As a virtual avatar', naming no Governor — every derived case
  still passes: a test whose extent comes from the constant under test can never catch a bad
  constant. The letter (the screen judges by the declared frame, driven from the constant) is
  met; the intent (a reader can tell a virtual avatar of the Governor is speaking) is guarded
  only by the live read.

**AC3** *(sized criterion)*

- A faithful quotation that elides a clause with '…', or one whose sentence spans a chunk
  boundary so no single passage contains it, fails verbatim-substring verification although
  every word is the record's — the check reports a fabrication that did not happen. The letter
  (the span is not a substring of any passage) is met; the intent (flag words NOT in the record)
  is inverted, and the diagnostic's signal degrades exactly as R2's guard becomes necessary.

**AC5** *(sized criterion)*

- Every listed form and its declared variants (leading whitespace, emphasis, case, past the
  first clause) are correctly caught, but a form with interposed punctuation or markdown INSIDE
  it — 'As your Governor — and I say this plainly — I…' — normalises away from every listed
  entry and passes the screen to the reader. The variant list's letter is met; the intent (no
  first-person-as-Governor opening reaches the reader) is defeated by a shape no variant
  enumerated.

**AC6** *(sized criterion)*

- The screen returns clean text byte-identical and the fake-generator path emits progressively,
  but an answer whose opening needed stripping sits outside AC6's guarantee entirely: the strip
  path can alter the retained remainder (trimmed lead-in, rejoined whitespace, a sentence
  fragment) and no criterion asserts what then reaches the reader is well-formed. Both pinned
  properties' letters are met while the criterion's 'complete and unaltered' intent is scoped so
  the one path that alters is the one path unexamined.

**AC7** *(sized criterion)*

- GROUNDED_DEFERRAL contains OREGON_PORTAL_URL and FAILURE_NOTICE contains its incompleteness
  clause — both pins pass — while the sentences around them stop performing: the deferral
  mentions the portal without directing the reader to it ('the portal exists, though you may
  find your answer here another time'), and the notice buries the disclosure mid-paragraph.
  Containment's letter met; 'names the portal' as a direction and 'discloses' as an act are both
  intent the pin cannot see.

**AC8** *(sized criterion)*

- Prompt and screen share both constants and the README matches in both directions, but the two
  consumers apply the same list with different semantics — the prompt's forbidding scaffold
  presents the forms as exact openings to never write, while the screen applies them as
  normalised patterns over a held prefix — so a mid-prefix occurrence is 'forbidden' in a sense
  the prompt never states and caught in a sense the scaffold assertion never checks. Single-
  source letter met; the no-drift intent quietly covers wording while semantics drift underneath
  it.

**AC10** *(sized criterion)*

- PROVISIONAL_PROMPTS is empty and the partition provably still covers every prompt exported
  from prompts.ts, vacuity case included — but the partition's universe is that one module, so a
  future voice-bearing prompt exported from a new module (a prompts/voice.ts, a route-local
  constant) escapes both lists while the test stays green. The letter (no unclassified prompt IN
  THIS MODULE) is met; the intent (no voice-bearing prompt ships unclassified) is bounded in a
  way the criterion does not state and no check names.

## Loop record

- frame/6 — ran twice. Round 1 (superseded design) -> reviews/answer-voice-screen.design.fdc04f4.json. Round 2, the binding pass, after Thomas inverted the design at the consult: codex on kimi-latest, 6 findings, 13 regressions -> reviews/answer-voice-screen.design.896817f.json
- frame/9 — demonstrated red for all nine sized criteria against the ratified regressions (two sabotages were incomplete on the first attempt, reported as such and redone). Plus four defects the live runs found that the suite could not, each now covered by a red-able test.
- review/6 — ran (codex on glm-latest, 3 findings) -> reviews/answer-voice-screen.approach.f8eda18.json
- review/8 — n/a — the approach pass gated it: finding 1 (a BLOCKER) reshapes the quote layer both critics would read, so they run next round against the new grammar.
- close/3b — no activation. No guard-hook block; the reviewer harness promoted the round's only pass on its first attempt; this repo ships no install.sh to drift.
- close/4 — presented: re-review only. The approved set includes a BLOCKER that reshapes the quote layer (finding 1), so merge was not offered.

## Build note (2026-09-15)

| AC | Where it is satisfied |
|---|---|
| 1 | `AVATAR_FRAME` + `screenOpening` in `src/lib/voice.ts`; tests `__tests__/voice.test.ts` |
| 2 | `ANSWER_SYSTEM_PROMPT` in `src/lib/prompts.ts`; read live |
| 3 | `verifyQuotations` / `verifyOneQuotation` — verbatim in the **cited** document |
| 4 | `screenedAnswer` in `src/lib/chat/orchestrate.ts` — each quotation held and verified before release |
| 5 | The prompt's quote-first rule; read live |
| 6 | `CADENCE_MAX_UNQUOTED_WORDS` + `checkCadence` |
| 7 | `IMPERSONATION_FORMS` + `IMPERSONATION_ANCHORS`, matched outside quotations |
| 8 | `screenedAnswer`'s release points and `PROVENANCE_NOTICE` |
| 9 | Pins in `__tests__/answer-screen.test.ts` |
| 10 | One set of constants in `voice.ts`, interpolated into the prompt; README pairing |
| 11 | Reviewer |
| 12 | Three lists in `prompts.ts` + `__tests__/readme-prompts.test.ts` |
| 13 | Scope containment |

## Build note (2026-09-16, round 2)

Re-review after the round-f8eda18 redesign. Base `f8eda18`. Only what the approved fixes moved.

| AC | Where it is satisfied now |
|---|---|
| 3, 4, 7 | `lex` in `src/lib/voice.ts` is the one grammar; `verifyQuotedSpan` the one verifier; `screenOpening` reads prose tokens from it |
| 6 | `CADENCE_TARGET_WORDS` (injection trigger) and `CADENCE_MAX_UNQUOTED_WORDS` (reader ceiling) in `voice.ts`; injection in `screenedAnswer` via `DISPLAY_FRAME` |
| 8 | `screenedAnswer` in `src/lib/chat/orchestrate.ts`, rebuilt to release only what `lex` calls stable |

Also: `CITATION_KINDS`, `citationAliases` and `citedDocument` in `voice.ts` replace bare-number
citation matching; `quotedSpans`, `unquoted`, `verifyOneQuotation` and the merged-span fallback are
deleted.

## Step-9 verification (2026-09-15)

Gate green at **328 tests**. Production build clean.

### Demonstrate red — the ratified regressions

| Sabotage (ratified regression) | Result |
|---|---|
| **AC1** — the frame constant weakened to name nobody | **RED** |
| **AC3** — set membership instead of the cited document | **RED** |
| **AC7** — exact matching, so an interposed clause escapes | **RED** |
| **AC7** — the screen stops skipping quoted text | **RED** |
| **AC8** — a provenance refusal dressed as an infrastructure failure | **RED** |
| **AC12** — a voice-bearing prompt exported from another module | **RED** |
| **AC9** — the deferral loses the portal | **RED** |
| AC4 *(mine — criterion added after the review)* — verification disabled | **RED** |
| AC6 *(mine)* — the cadence bound disabled | **RED** |

**Two sabotages first reported "dead assertion" and were wrong to.** Each had a second code path
untouched — verification runs at two call sites, and cadence checks both inter-mark and trailing
runs. Redone completely, both went red. A sabotage that does not fully apply proves nothing, and
saying so beats recording a false clean.

**Criterion numbering.** The ratified regressions name the criteria as they stood at the round-2
review; criteria 4 and 6 were added afterwards at the consult, shifting the later numbers. The
mapping is: review AC1→1, AC3→3, AC5→7, AC6→8, AC7→9, AC8→10, AC10→12.

### Four defects the live runs found that the suite could not

The suite drives a fake model, so it only ever sees the cases its author imagined. Every one of
these came from running the real thing.

1. **A document's own title read as a fabrication.** The model quoted the title the system itself
   hands it; the verifier knew only passage bodies and stopped a correct answer. Titles are now
   verifiable text.
2. **Citations written the way a reader writes them were invisible.** The model cited "Executive
   Order 23-04" where the metadata reads "EO 23-04", so no citation was detected and a faithful
   quotation was refused. Matching now also uses the identifier the two spellings share.
3. **Every quotation after the first was mis-extracted.** The held span was re-derived from
   `emitted + span`, and the retained text ends with the *previous* quotation's closing mark — so
   mark-pairing returned the prose *between* two quotations. Faithful quotes failed as fabrications.
   The streaming path now verifies the span it is actually holding.
4. **The opening hold swallowed whole answers.** It waited for the entire accumulation to balance,
   which a quote-heavy answer rarely does at a token boundary — so one bad quotation late in an
   answer discarded every good one before it. It now releases at the earliest sentence end where no
   quotation is open.

Each is covered by a test that goes red without the fix. **Refusal was also made proportionate**: a
quotation whose words are genuinely in the record but whose citation this code failed to recognise
is reported, not refused — no reader is misdirected to a specific document by a missing citation,
and refusing it suppressed correct answers.

### The live answer, and what it shows

Question: *"What has Oregon done to increase housing production?"*

The avatar identified itself at the top, **re-identified itself mid-answer**, made **seven
quotations — all released**, each attributed to a named document, never wrote in the Governor's first
person, and closed with *"These passages do not describe other measures, so I cannot speak to
anything beyond them."* Six quoted spans were checked by hand against the corpus afterwards: **all
six are verbatim in the documents they cite** (five in `eo-23-04.md`, one in `sb-1537.md`).

**The screen caught a real fabrication before the fixes, and it is worth recording.** Asked about
early literacy, the model quoted a legislative title as *"An Act relating to early literacy; creating
new provisions;"* — the record reads *"An Act relating to early literacy (Oregon Laws 2023, chapter
534)"*. The clause **"; creating new provisions;" appears nowhere in the corpus.** A plausible,
confidently-cited invention, stopped before a reader saw it. That is the risk this whole story was
built for, caught in the wild on its first day. The prompt now also forbids quoting titles at all —
they carry no policy content and are where invention crept in.

### Still true, and stated rather than engineered away

Whether the model quotes rather than paraphrases, and whether it slips into her first person in its
own prose, remain read by a person. The suite cannot judge either: it drives a fake model, and the
corpus legitimately contains her first person inside quotable text.

## Open questions

**All six resolved at the step-7 consult (2026-09-11).** Q1 = **recorded unmet**; Q2 = **once at the
top, then every 100–200 non-quoted words**; Q3 = **hold each quotation**; Q4 = **strip to a clean
boundary, refuse rather than mangle**; Q5 = **no new event kind**; Q6 = **sentence boundary or small
cap**.

1. **The specification's "at least two lexical anchors" criterion is not met.** Three of the five have
   no corpus evidence and one means something else entirely. **RESOLVED: recorded unmet**, with the
   evidence in Problem, for a later sourcing story to meet properly. Raised rather than left silent
   because it leaves a written criterion of the product specification unsatisfied.

2. **How often must the avatar frame appear?** **RESOLVED — and more precisely than either option
   offered.** Thomas: *"once at the top then repeated every few paragraphs or every roughly 100–200
   non-quoted words."* That is better than both options put to him: a frame at every assertion is
   noise readers stop seeing, and a frame only at the top leaves a reader arriving mid-answer with no
   idea who is speaking. **It is also mechanically checkable**, which neither option was — a declared
   bound over non-quoted words is a pure function, so criterion 6 is `Small` rather than a hoped-for
   read. Quoted stretches do not count toward it: the reader is being shown the record, not the
   avatar's assertions.

3. **Does quote verification gate the stream, or only report?** **RESOLVED: hold each quotation.** The
   round-2 review was right that the original framing was a false dichotomy — a quotation is
   unverifiable only between its marks, so prose streams and only quotations pause. The cost is
   stated: under this design most answers are quote-heavy, so delivery is choppier than story 2's.
   The ground for paying it: a citation makes a claim *more* credible, so an unverifiable quotation
   attributed to a governor is the failure this whole direction was chosen to prevent, and a
   report-only check had no consumer before Story 5.

4. **What happens to an opening that impersonates?** **RESOLVED: strip to a clean sentence boundary;
   if what remains does not start cleanly, refuse rather than emit wreckage.** The alternative — pass
   it through and record — lets an impersonation claim reach the public, which for this product is
   the worse failure.

5. **Should a screen finding reach the client?** **RESOLVED: no new event kind.** A refusal reaches
   the reader as text, in the provenance notice; the wire contract User Story 4 is about to build
   against is unchanged.

6. **How much of the opening is held?** **RESOLVED: until the first sentence boundary or a small
   character cap, whichever comes first** — the knob trading R3 (delay) against R4 (an impersonation
   past the cap), stated rather than buried.

## Design sketch — HOW

**Three pieces; one is new code, and all of its logic is pure.**

```
src/lib/prompts.ts           ANSWER_SYSTEM_PROMPT rewritten around provenance, carrying the quoting
                             contract (quote contiguously from one passage; no elision; no quoting
                             across passages) so a verification failure means something rather than
                             reporting a faithful quotation as a fabrication. AVATAR_FRAME,
                             IMPERSONATION_FORMS and the cadence bound declared here, interpolated
                             into the prompt UNDER AN EXPLICIT FORBIDDING INSTRUCTION. Deferral,
                             infrastructure notice and a distinct provenance notice.
                             PROVISIONAL_PROMPTS empties.
src/lib/voice.ts             NEW, entirely pure, three functions:
                               screenOpening(text)              — frame present? impersonation?
                                                                  QUOTATION-AWARE: quoted spans are
                                                                  skipped before matching.
                               verifyQuotations(answer, chunks) — every quoted span verbatim in a
                                                                  passage OF THE DOCUMENT IT CITES.
                               checkCadence(answer)             — any run of non-quoted prose past
                                                                  the bound with no re-identification.
src/lib/chat/orchestrate.ts  Two holds. The opening, until screenOpening can judge. Each quotation,
                             from its opening mark to its closing mark, verified before release.
                             Everything else streams as today.
```

**Why the screen must ignore quotations, verified rather than assumed.** Two corpus documents carry
`I, TINA KOTEK, Governor of the State of Oregon` as operative text, and quoting an order's operative
clause is exactly the shape this story asks for. A quotation-blind screen would fire on the answer
the prompt is written to produce — the two mechanisms fighting each other as a routine event, not a
tail case.

**Why membership is not enough.** Executive orders quote statutes and bills share boilerplate, so a
span can be verbatim in *some* passage and absent from the document it is cited to. Set membership
would pass it, the reader would follow a citation to a document that does not contain the words, and
the citation would have made the error more credible. The verifier resolves the span against the
cited document's passages; where shared boilerplate appears in several, containing the cited one is
enough.

**Three screen outcomes, two refusal vocabularies, and one thing never said.** An opening that
impersonates is stripped, or refused if stripping would mangle it. An opening merely missing the
frame is prefixed with it rather than refused — the likeliest slip should not cost the answer. An
unverifiable quotation refuses. **A refusal for any of these reasons is reported as a provenance
refusal, never as the infrastructure notice** — telling a reader something went wrong when a style
gate fired is a false statement about what happened (R7).

**Holding without breaking the stream.** The answer path already pulls one record at a time. Prose
passes straight through; a quotation accumulates from its opening mark and releases at its closing
one. The delay is a quotation, not an answer — but under this design answers are quote-heavy, so
delivery is visibly choppier than today, and that is the accepted cost of the guarantee.

**What this story still cannot prove.** Whether the model quotes rather than paraphrases, and whether
it slips into her first person in its own prose, are read by a person: the suite drives a fake model
returning whatever the test wrote, and the corpus legitimately contains her first person inside
quotable text, so a pronoun check would flag correct answers. Everything else — the frame, the
cadence, the verbatim-and-cited-correctly guarantee, the impersonation screen, the refusal
vocabularies — is decided offline and completely.


## Design decisions (2026-09-11)

**Scope approved at the step-7 consult.** Thomas: **"decision 1 A; decision 2 yes fix all six;
decision 3 once at the top then repeated every few paragraphs or every roughly 100-200 non-quoted
words."**

The story's direction was set earlier the same day, mid-consult, and it is the reason this file has
two design reviews:

> "have virtual tina say 'As a virtual avatar of the Governor, I…' and use that sort of language
> whenever saying something that is not a quote. Most answers can be, or can include, quotes with
> citations."

That inverted the first sketch, in which V-Tina spoke in the Governor's register and the screen
*banned* self-introduction. The round-1 design review had already run against that sketch; it is kept
above, marked superseded, and round 2 is the binding pass. **The inversion is what made the story's
central risk mechanically checkable** — whether a quoted span is verbatim in the document it cites is
a function, where "does this prose sound like something she would say" never was.

**Disposition per round-2 finding.** The approved shape below is binding on step 9 and is not
re-litigated while building.

| # | Finding | Disposition |
|---|---|---|
| 1 | AC3's attribution clause has no mechanism (IMPORTANT, two-way, standard) | **FIX.** The verifier resolves each span against **the document it is cited to**, not set membership over all passages. The finding's concrete ground holds in this corpus: orders quote statutes and bills share boilerplate, so a span can be genuine and still cited to a document that does not contain it — the citation then makes the error more credible, which is R2 in its exact form. The oracle claimed that case failed while nothing could have made it fail. |
| 2 | Whitespace-only matching false-fails faithful quotations (IMPORTANT, two-way, standard) | **FIX, both halves.** The prompt states the quoting contract — contiguous from one passage, no elision, no quoting across passages — so a violation is a real finding rather than a known false positive; and the verifier splits on ellipsis anyway, so a slip is diagnosed rather than mis-reported. Taken because a diagnostic with a known false-positive class trains its reader to discount it. |
| 3 | The screen is quotation-blind and vetoes the design's own preferred answer shape (IMPORTANT, two-way, standard) | **FIX.** Verified against the corpus before presenting, not taken on the reviewer's word: two documents carry `I, TINA KOTEK, Governor of the State of Oregon` as operative text. A quotation-blind screen fires on the answer the prompt is written to produce. Quoted spans are skipped before impersonation matching. |
| 4 | Open question 3 was a false dichotomy, and the diagnostic had no consumer (IMPORTANT, two-way, standard) | **FIX — and the third option is the one chosen.** The reviewer was right that "gate" did not have to mean holding the whole answer: a quotation is unverifiable only between its marks. Thomas chose **hold each quotation**. The cost is stated rather than assumed away: answers here are quote-heavy, so delivery is choppier than story 2's. The ground is that report-only had no reader before Story 5, and a check nothing consumes cannot fail in the way that matters. |
| 5 | The screen's third outcome has no specified behaviour (NIT, two-way, standard) | **FIX, and the risk list grows.** All three outcomes are named — impersonation strips or refuses, a missing frame is prefixed rather than refused, an unverifiable quotation refuses — and **R7 is added**: a provenance veto reported to the reader as an infrastructure failure tells them something false about what happened. A distinct provenance notice exists so the two are never confused. |
| 6 | AC2's letter fails legitimate quotations of the record (NIT, two-way, standard) | **FIX.** The criterion now carries the exemption in its own sentence — first person as the Governor is forbidden *outside attributed quotation* — so the manual reader is not asked to silently repair the text. |

**Regressions: all thirteen accepted, none amended or rejected.** Coverage was complete — every risk
R1–R6 and every sized criterion received at least one, and criteria 2, 5 and 11 are person-judged and
owe none. R7 arrives with finding 5 and is covered by criterion 8's oracle, which asserts a provenance
refusal never emits the infrastructure notice.

**One decision was better than anything put to Thomas.** Both options offered for the frame's cadence
were weak: at every assertion it becomes noise a reader stops seeing, and once at the top leaves
anyone arriving mid-answer with no idea who is speaking. His answer — a bound in non-quoted words —
is the only one of the three that is **mechanically checkable**, so criterion 6 became a `Small` test
rather than another thing someone has to read for.

## Codex (kimi-latest) design review — round 1, SUPERSEDED DESIGN (2026-09-11)

**This pass judged a design that no longer exists.** It reviewed a sketch in which V-Tina
spoke in the Governor's register and a screen BANNED self-introduction. At the step-7 consult
Thomas inverted that: the avatar identifies itself as an avatar, quotes the record with
citations, and marks everything else as its own words. Kept as a record — several of its
findings survive the change and are carried into the round-2 sketch — but its regressions were
written against risks the story no longer runs. The round-2 pass below is the binding one.

**Verdict.** Fundamentally a sound, right-sized shape: one new pure module, one rewritten prompt file, one
  buffering seam in the orchestrator, no new dependency. On the four questions posed: (a) the
  dumb normalised-comparison screen is the right instrument GIVEN the story's own honest framing
  — it is a tripwire over a declared list, not a preamble detector, and AC1's live read carries
  the general case; the design earns its dumbness because a screen needing judgement would add
  unfalsifiable surface to a story that already has six person-judged criteria. (b)
  Interpolating BANNED_OPENINGS into the prompt follows the repo's own SAFETY_CLASSIFICATIONS
  precedent and keeps prompt and screen from drifting, but the precedent is a parser-constrained
  closed vocabulary while this hands a generative model an enumerated list of forbidden phrases
  — a mild priming hazard, and the proposed AC7 test pins bare containment rather than
  prohibition (NIT finding). (c) The orchestrator is unambiguously the right seam: stream.ts is
  pure framing, fireworks.ts is transport, and buffering inside the pull-based generator
  composes naturally with the backpressure story 2 built; nothing belongs lower. (d) The 6-of-10
  manual/reviewer split is mostly honest — a prompt's effect on prose is genuinely not decidable
  against a fake model — but it is not COMPLETELY honest: AC6's portal-naming half is
  mechanically pinnable today and the repo's own convention pins exactly this kind of invariant
  (IMPORTANT finding). (e) Nothing is over-built; the under-built spots are the AC6 pin and a
  missing risk for the FAILURE_NOTICE rewrite. Ship-shaped, subject to the findings and the
  consult decisions already queued.

### IMPORTANT

**The screen's on-violation behaviour is the load-bearing decision and the proposed one can emit a mangled sentence** — reversibility: two-way · standing: standard

- **Claim:** The screen's entire value lives in what happens on a hit, yet the sketch leaves it
  to an open question and names strip-and-stream as the proposal. On a product wearing a sitting
  governor's name, a sloppy strip emits a grammatically broken opening directly to a public
  reader — trading R4 (a preamble reaches the reader) for a new wrong state no risk or criterion
  names: a mutilated first sentence reaches the reader. AC3's Then says only that the preamble
  'never reaches the reader'; nothing asserts that what DOES reach the reader is well-formed, so
  the suite can go green while the reader meets wreckage. The choice also interacts with AC4's
  byte-identical guarantee, which covers only clean answers.
- **Alternative:** Prefer option (c) — pass the answer through and record the violation server-
  side — on the ground that the prompt is the primary control and the screen is a tripwire
  measuring how well it holds; a tripwire that edits prose is a second author. If Thomas keeps
  strip-and-stream, add a companion assertion to AC4's oracle that stripped output is itself a
  complete, well-formed opening, so the mangling mode has a red.
- **Win:** Eliminates an entire class of reader-visible mangling (or gives it a failing check),
  and the screen shrinks to a reporter — fewer states, no editing logic, no second-author risk.

**AC6's portal-naming half is assigned to a manual oracle although it is mechanically pinnable today** — reversibility: two-way · standing: nonstandard

- **Claim:** AC6 has two halves: the deferral reads in register (genuinely manual) and it 'still
  names Oregon's official state portal' (a string containment against OREGON_PORTAL_URL, a
  constant that already exists and is already interpolated into GROUNDED_DEFERRAL). The repo's
  own convention pins exactly this class of invariant offline — the README pairing tests, the
  partition test, the domain-allowlist tests. Assigning the whole criterion to a live manual
  read hides an achievable check, contradicts the sketch's own claim that 'the mechanically-
  checkable parts are checked completely', and means a rewrite that drops the portal fails only
  when someone happens to read a deferral aloud.
- **Alternative:** Split the oracle: a Small test asserting GROUNDED_DEFERRAL contains
  OREGON_PORTAL_URL (and, while there, that FAILURE_NOTICE still discloses the answer is
  incomplete), with the register half staying manual. The oracle table row names both.
- **Win:** A real regression moves from a hoped-for live read to a deterministic suite failure,
  one short test added, and the story's honesty claim about mechanical coverage becomes true.

### NIT

**Interpolating the banned list into the prompt primes the model with the phrases it bans, and the AC7 test pins presence rather than prohibition** — reversibility: two-way · standing: standard

- **Claim:** The SAFETY_CLASSIFICATIONS precedent this cites is a parser-constrained closed
  vocabulary: the classifier's reply is exact-matched against the list, so the interpolation is
  load-bearing. Here the list is shown to a generative model, where enumerating forbidden
  phrases is a known priming hazard. The proposed AC7 mechanism — assert the prompt contains
  every member of BANNED_OPENINGS — then locks the shape in: it proves the phrases are present,
  not that they are forbidden. A prompt carrying the list under a neutral heading passes while
  teaching rather than banning; the intent (the model is TOLD not to open this way) is exactly
  what the containment check cannot see.
- **Alternative:** Keep the shared constant (the single-source discipline is right and the
  screen needs the closed list) but have the prompt state the rule in prose — open on the
  substance; no self-introduction, apology, or source-naming — with the list interpolated under
  an explicit forbidding instruction, and extend the AC7 assertion to require the forbidding
  scaffold around the list, not bare containment.
- **Win:** Same single-source coupling, less priming surface, and the test asserts intent-
  adjacent structure instead of a substring count.

**AC10's scope names src/lib/chat/deps.ts, which the sketch never changes** — reversibility: two-way · standing: kludgy

- **Claim:** The sketch's file map covers prompts.ts, voice.ts, and orchestrate.ts; deps.ts
  appears only in the scope-containment list with no stated reason. The screen is a pure
  function consumed inside the orchestrator, so no collaborator wiring changes. A scope entry
  with no planned change is slack: it pre-authorises a diff nobody described, and the merge-time
  veto reads the header against exactly this list.
- **Alternative:** Either name the deps.ts change in the sketch (if the screen is to be injected
  as a dependency, say so and why) or drop deps.ts from the enumerated set.
- **Win:** The scope check Thomas runs at merge judges only real, described changes — no pre-
  authorised slack.

## Codex (kimi-latest) design review — round 2, BINDING (2026-09-11)

**Verdict.** Round-2's shape is fundamentally sound and right-sized: one pure module (`voice.ts`), one
  prompt-file rewrite, one bounded buffering seam in the orchestrator, no new dependency, and
  the single-source constants pattern follows the repo's own SAFETY_CLASSIFICATIONS precedent.
  On the questions posed: (a) `verifyQuotations` as sketched — extract spans, whitespace-
  normalise, substring-per-passage — is sound as a core but has BOTH a false-positive shape
  (ellipsis elision, quotes crossing chunk boundaries, nested quotation inside EO passages) and
  a missing half (AC3's attribution clause has no mechanism: substring-over-any-passage cannot
  detect a span cited to the wrong document, and the AC3 oracle explicitly claims that case
  fails). (b) The orchestrator is the right seam for holding the opening — stream.ts is pure
  framing, the generator composes with pull-based backpressure, and a mid-hold abort unwinds
  cleanly through the existing cancel path. (c) Diagnostic-only quote verification is defensible
  given R2 ONLY because gating's cost is real — but Open question 3 frames a false dichotomy
  (gate = hold the whole answer); a quotation is unverifiable only between its marks, so hold-
  each-quote is a third option the consult should see, and the diagnostic currently has no named
  consumer before Story 5. (d) The oracle split is honest: AC2 must stay manual because
  executive orders legitimately contain the Governor's own first person inside quotations,
  making any offline pronoun check false-positive; AC4 and AC9 carry correct arguments for their
  person-judged oracles. The risk list is genuine — R1–R6 are all states a reader can meet, none
  is a scope statement — but one wrong state is missing: a screen veto surfaces through the
  infrastructure FAILURE_NOTICE, telling the reader a false cause. Ship-shaped subject to the
  findings.

### IMPORTANT

**AC3's attribution clause has no mechanism — the sketched function cannot detect a span cited to the wrong document** — reversibility: two-way · standing: standard

- **Claim:** The sketch's verifyQuotations reports spans 'not verbatim in ANY passage' — a set-
  membership check. But AC3's Then requires each quotation 'attributed to the document it came
  from', and the AC3 oracle explicitly claims 'a span attributed to a document it is not in'
  fails. Nothing in the sketched function reads the answer's citations or maps spans to
  documents, so that red cannot fire. The corpus makes this concrete rather than paranoid:
  executive orders quote statutes, and bills share boilerplate, so a span can be verbatim in a
  passage of a DIFFERENT document than the one cited — verification passes, the reader is sent
  to a document that does not contain the words, and R2's harm (a citation making an error more
  credible) lands in its exact form. The suite would go green claiming a guarantee the code does
  not provide.
- **Alternative:** Either extend the sketched function so it also extracts each span's attached
  citation and checks membership in THAT document's passages (defining how shared boilerplate
  resolves), or narrow AC3's Then and its oracle to verbatim-fidelity only and move attribution
  to the manual AC4 read. Say which in the sketch, because the test author will otherwise write
  the attribution red against an implementation shape nobody designed.
- **Win:** Criterion, oracle and function agree; eliminates a claimed check that cannot fail,
  and forces the shared-boilerplate ambiguity to be decided rather than discovered.

**Whitespace-only verbatim matching false-fails faithful quotations, which poisons the diagnostic it exists to provide** — reversibility: two-way · standing: standard

- **Claim:** Real model quotations routinely elide with '…', and chunking splits sentences mid-
  quote, so a span assembled across two adjacent passages is not a substring of either. Nested
  quotation compounds it: an EO passage can itself contain quoted statute text, so span
  extraction pairs the wrong marks. The sketch acknowledges only 'normalise whitespace, nothing
  else'. Every one of these cases reports a faithful quotation as a fabrication. For a
  diagnostic whose entire value is that a finding means something, a known false-positive class
  trains whoever reads the server-side findings to discount them — and if the check is ever
  promoted to a gate (Open question 3), the same class eats good answers.
- **Alternative:** Define the quoting contract the check verifies, in the prompt and in the
  sketch: either the prompt forbids elision and cross-passage quotation outright (making
  'verbatim contiguous span from one passage' a property the model is TOLD to satisfy, so a
  violation is a real finding), or the verifier splits spans on ellipsis and requires each
  segment verbatim in one passage. Either is cheap; shipping neither leaves the check's
  semantics to whoever writes the test.
- **Win:** The diagnostic's findings stay meaningful (no wolf-crying class), AC3's Small test
  asserts behaviour that matches real model output, and the prompt gains a concretely statable
  rule instead of an implicit one.

**The screen is quotation-blind, so it can veto the design's own preferred answer shape** — reversibility: two-way · standing: standard

- **Claim:** The settled direction says most answers 'can be, or can include, quotes with
  citations' — and executive orders open in the Governor's own first person ('I, Tina Kotek…
  hereby order'). A well-formed answer that OPENS with an attributed quotation of the record
  therefore contains exactly the first-person-as-Governor strings IMPERSONATION_FORMS will list,
  inside quotation marks, in the held prefix. 'Normalised comparison against declared lists,
  anchored to the opening' contains no notion of quotation, so the screen's impersonation half
  can fire on the answer shape the prompt is written to encourage — converting R3 from a tail
  risk into a routine collision between the story's two mechanisms.
- **Alternative:** Sketch the screen as quotation-aware: strip (or skip) quoted spans before
  matching the impersonation forms, so the forms match only the avatar's own prose. This is a
  few lines in a pure function and belongs in the design, because it determines what
  IMPERSONATION_FORMS may safely contain.
- **Win:** Removes a structural false-positive class that pits the screen against the prompt;
  AC5's 'real-shaped variants' gain the variant that matters most; R3's false-positive leg stops
  being a routine event.

**Open question 3 presents a false dichotomy, and the diagnostic half has no consumer** — reversibility: two-way · standing: standard

- **Claim:** The question frames the trade as 'gate the stream (hold the whole answer) vs report
  only', but that overstates gating's cost: a quotation is unverifiable only between its opening
  and closing marks, so a gate can hold EACH QUOTATION rather than the answer — everything
  outside quotation marks streams unimpeded. Under this design's intended style (most of the
  answer quoted) the practical delay may approach full buffering, which is exactly why the
  honest comparison belongs in the consult rather than being pre-empted by the framing.
  Separately, the proposed diagnostic records findings server-side with no named reader until
  User Story 5 — a check whose output nothing consumes is a check that cannot fail in the way
  that matters, whatever the suite proves about the function.
- **Alternative:** Present three options at the consult — report-only / hold-each-quotation /
  hold-the-answer — with the delay for a quote-heavy answer honestly estimated rather than
  assumed maximal. For the report-only option, name the consumer of server-side findings (even
  if it is Story 5's suite reading a recorded log), so 'recorded' means 'read'.
- **Win:** Thomas decides R2's disposition among the real options instead of two; the diagnostic
  either gains a consumer or the story stops claiming it as mitigation.

### NIT

**The screen's third state — a clean opening that merely lacks the frame — has no specified behaviour** — reversibility: two-way · standing: standard

- **Claim:** screenOpening answers two questions (carries the frame? impersonates?) which yields
  three outcomes, but Open question 4 defines behaviour only for impersonation (strip / pass /
  regenerate). A non-impersonating opening that simply omits the avatar frame — the most likely
  prompt-slip — has nothing to strip, and 'fail the answer' would spend R3 on a benign miss
  while emitting FAILURE_NOTICE's 'something went wrong', a false statement about cause (a wrong
  state the risk list does not name — R3 covers suppression and R6 covers persona performance,
  neither covers the reader being told infrastructure failed when a style gate vetoed).
- **Alternative:** Name the behaviour for all three screen outcomes in the sketch — including
  whether missing-frame fails, passes-with-record, or triggers a prefixed correction — and add
  the veto-presented-as-infrastructure-failure state to the risk list (or state why
  FAILURE_NOTICE's wording is honest for it).
- **Win:** The orchestrator wiring, AC1's oracle and AC5's oracle partition the same state
  space, and the reader-facing failure vocabulary stays truthful about what happened.

**AC2's Then, read by its letter, fails legitimate quotations of the record** — reversibility: two-way · standing: standard

- **Claim:** 'Nothing in it is written in the Governor's first person' is true of well-formed
  answers only because quoted material is the record's words, not the avatar's — but the
  corpus's executive orders contain 'I, Tina Kotek' as operative text, and this design WANTS
  those quoted. The qualifying clause ('the avatar never says I as her') carries the
  distinction, but the criterion's main clause states the absolute form, so the manual reader it
  assigns owes a judgement the text half-contradicts.
- **Alternative:** One clause in AC2 making the exemption explicit — first person as the
  Governor outside attributed quotation — so the letter and the intent are the same sentence.
- **Win:** The manual oracle stops depending on the reader silently repairing the criterion; AC2
  and AC3 stop being in tension over the same quoted sentence.

### Verified against the corpus before presenting

- **The screen/quotation collision is real and routine, not hypothetical.** Two corpus
  documents carry `I, TINA KOTEK, Governor of the State of Oregon` as operative text, plus
  "the power and authority vested in me". An answer that correctly quotes an order's operative
  clause therefore contains the exact string `IMPERSONATION_FORMS` would list.
- **Nested quotation is present too**: EO passages contain their own quoted terms (for example
  `"unsheltered homelessness"`), so naive mark-pairing will mis-extract spans.

## Codex (glm-latest) approach review (2026-09-16, base main, HEAD f8eda18)

**Verdict.** 2026-09-16 06:56:27 PDT — The macro shape is sound and I would keep it: pure policy in voice.ts,
  an injectable async-generator orchestrator, shared prompt/screen constants, and no new
  dependency. A TransformStream would add transport coupling without removing the necessary
  opening and quotation state. I would not build the textual provenance layer as shipped: the
  quote grammar is duplicated and partly forgiving, citation attribution is an unanchored
  numeric-substring heuristic, and cadence is documented as enforced but has no runtime
  consumer. Those three shapes need correction before merge.

### BLOCKER

**The quote contract has three parsers and no single grammar** — reversibility: one-way · standing: kludgy

- **Claim:** The async-generator seam is right, but quotation tokenization is implemented
  independently by quotedSpans, verifyQuotations, and screenedAnswer's character scanner. The
  copies already diverge: offline verification has a merged-span fallback for nested quotes,
  while the streaming scanner closes at the first matching mark, so a straight-quoted outer span
  containing a straight inner quote emits the inner term as unverified prose. Single-quoted
  model output is not recognized at all and bypasses AC4. Apostrophes inside double quotes are
  harmless, but single-quote delimiters and nested same-mark quotes are realistic model output.
  The verifier also splits on ellipsis and passes when each segment is found, although AC3 and
  the prompt both forbid elision; a segmented quotation can even combine passages. This is the
  same class of live bug that motivated verifyOneQuotation, now encoded as two verifiers that
  can drift again.
- **Alternative:** Keep the hold-each-quotation design, but define one explicit quote grammar
  and implement one small pure lexer that emits prose and quotation tokens across chunk
  boundaries. Have both offline and streaming paths call the same verifyQuotedSpan(span,
  precedingContext, chunks). Either reject ellipses to match AC3, or change the spec and prompt
  to permit segmented quotations. For marks, require unambiguous curly outer quotes in the
  prompt and treat any other outer delimiter as a provenance violation; do not add a parser
  dependency for this.
- **Win:** One quote grammar replaces three ad hoc paths, closes the single-quote and nested-
  mark bypasses, makes elision behavior match AC3, removes the merged-span fallback and
  duplicate verifier, and lets tests exercise the same tokenization the runtime uses.

### IMPORTANT

**Bare numeric citation matching can attribute a quote to the wrong document** — reversibility: two-way · standing: kludgy

- **Claim:** Citation detection reduces a title to a bare identifier and then uses unanchored
  substring matching. Ballot Measure 110 becomes the bare string 110, and the corpus itself
  contains 110% in EO 24-02, so an unrelated statistic in the preceding window can make a
  following quotation appear cited to Ballot Measure 110. A year such as 2024 is usually
  shielded only because citationKey happens to take the first number in a title such as SB 1537
  (2024); that is incidental rather than a designed rule. titles.find also selects retrieval
  order rather than the nearest citation, and the offline and streaming paths use different
  context windows of 180 and 240 characters. The result is false wrong-document attribution,
  false refusals of faithful quotations, and ambiguous behaviour when several documents are
  named nearby.
- **Alternative:** Derive a small declarative citation alias table from source metadata—for
  example EO/Executive Order 23-02, SB 1537, and Ballot Measure/Measure 110—and match those
  aliases with word-boundary patterns immediately before each quote. Select the nearest match
  and share one context-window constant. Alternatively, require a canonical citation prefix in
  the answering prompt. No dependency is needed.
- **Win:** Eliminates incidental-number attribution and retrieval-order ambiguity, centralizes
  the citation contract, and reduces false refusals while preserving the wrong-document check.

**Cadence is test-only while documented as enforced** — reversibility: two-way · standing: nonstandard

- **Claim:** checkCadence has no production caller. screenedAnswer enforces only the opening and
  quotation holds; after the opening is released, an arbitrarily long run of unquoted prose
  streams to the reader regardless of the declared 150-word bound. Meanwhile README says all
  three voice rules are enforced by voice.ts, and AC6 is a reader-observable outcome. The
  exported function and its tests therefore create an appearance of runtime enforcement that the
  answer path does not provide, which is over-built relative to R1-R7 unless a later story is
  its named consumer.
- **Alternative:** Either wire cadence into the same token stream by counting unquoted words
  since the last frame and enforcing a defined boundary behavior, or narrow AC6 and README to
  prompt-plus-manual/live verification and make checkCadence an explicitly named Story 5
  diagnostic rather than present it as current enforcement. The choice should be recorded
  because it changes reader-visible behaviour.
- **Win:** Makes the shipped behaviour, documentation, and tests agree; either gives AC6 a real
  gate or removes dead production surface and an unsupported enforcement claim.

### Verified by running the claims, not by reading them

A throwaway probe drove the real `screenedAnswer` and `verifyQuotations` (removed afterwards):

| Claim | Result |
|---|---|
| A **single-quoted** fabrication bypasses the hold | **CONFIRMED.** `'a 13% rise in unsheltered homelessness'` — the specification's own invented statistic — **reached the reader**. No mark is recognised, so nothing is held or verified. The central guarantee of this story is bypassed by a punctuation choice. |
| A faithful elision is accepted, contradicting AC3's approved oracle | **CONFIRMED.** The oracle ratified at the consult says a span elided with an ellipsis fails; the verifier splits on the ellipsis and passes it, and the story's own test asserts that it passes. Implementation and test agree with each other and disagree with the approved criterion. |
| An elided span can stitch passages | **PARTLY.** Across two *documents* it is caught — the cited-document check rejects the half from the other document. Within one document's several passages it would pass, because each segment is checked against the whole pool independently. |
| Bare numeric citation keys misattribute | **CONFIRMED in the corpus.** `EO 24-02` contains `Springfield/Lane County (110%)`; the key for Ballot Measure 110 is `110`. |
| `checkCadence` has no production caller | **CONFIRMED.** Zero callers under `src/`. AC6 describes reader-observable behaviour, and the README says the rule is enforced; only the prompt enforces it. |

## Decisions (2026-09-16, approach round f8eda18)

Round `f8eda18`, base `main`. Three findings, **all three dispositioned FIX**. Finding 1 changes the
shape of the quote layer, so the correctness and hidden-failure passes do not run this round.

**Approach (glm-latest)**

- **The quote contract has three parsers and no single grammar** (BLOCKER, one-way, kludgy):
  **FIX.** Verified by running the claims against the real code, not by reading them. **A fabricated
  quotation in single quotes reaches the reader** — the specification's own invented statistic,
  `'a 13% rise in unsheltered homelessness'`, streamed through unheld and unverified, because no mark
  is recognised. And a faithful elision is accepted, contradicting AC3's approved oracle, with the
  story's own test asserting the wrong behaviour. The fix is one small lexer that both the streaming
  path and the offline checker call; the prompt requires curly quotes and any other outer delimiter is
  a provenance refusal; elision is rejected as the criterion says. It **deletes** the duplicate
  verifier and the merged-span fallback. Tagged one-way because every future quote rule is written
  against whichever grammar exists, and there were three.

- **Bare numeric citation matching can attribute a quote to the wrong document** (IMPORTANT, two-way,
  kludgy): **FIX.** Verified in the corpus: `EO 24-02` contains `Springfield/Lane County (110%)`, and
  Ballot Measure 110's key is `110`. Citation aliases are derived from each document's metadata,
  matched on word boundaries, the nearest citation wins, and both paths share one window.

- **Cadence is test-only while documented as enforced** (IMPORTANT, two-way, nonstandard): **FIX —
  option A, enforce it in the stream.** Verified: `checkCadence` has zero production callers, and the
  README claimed enforcement that did not exist. Thomas was told the options were genuinely balanced
  — narrowing the criterion to "the prompt asks, verified live" versus injecting the frame at the
  bound — and that injection may read as an awkward mid-paragraph interjection. He chose to make the
  rule real. The ground: he set a number, and a number nothing enforces is exactly the kind of claim
  this story exists to stop making.

**Correctness and hidden-failure: not run this round.** Finding 1 reshapes the code both critics
would read.

## Fixes (2026-09-16, approach round f8eda18)

Gate green at **334 tests**; commit `583ff72`. Production build clean.

### Finding 1 (BLOCKER) — one grammar

`lex(text, final)` in `src/lib/voice.ts` is now the only definition of what a quotation is. The
streaming answer path, `verifyQuotations`, `screenOpening` and `checkCadence` all derive from it.
**Deleted**: `quotedSpans`, `unquoted`, `verifyOneQuotation`, the merged-span fallback, and the
character scanner inside `screenedAnswer`. One verifier remains, `verifyQuotedSpan`, called by both
paths.

**The approved design needed a refinement that only the corpus could show, checked before a line was
written.** "Require curly quotes" assumed curly marks would be unambiguous delimiters. The corpus
contains **710 curly marks** — bills quote their own defined terms, `“Deflection program” means…` — so
a faithful quotation of that text carries curly marks inside it, and a grammar closing at the first
inner `”` would refuse it. Curly marks are *directional*, so the grammar **tracks nesting depth**
instead: 249 of 261 paragraphs containing them are balanced. The corpus also has **286 curly
apostrophes** (`’`, the same glyph as a closing single mark) and **no opening single mark at all**, so
a single-quoted span is recognised by its *opener* and `’` alone is always prose.

**One extension to the approved verification rule, stated rather than slipped in.** AC3's oracle said
"whitespace is normalised; nothing else is." `normalise` now also folds quote-mark *glyphs* (`“”` →
`"`, `‘’` → `'`), because a model reproducing a passage's `“` as `"` inside a quotation has not changed
a word. Case, digits and every other character remain the record's — the test that an all-caps copy
of a lower-case passage is refused still passes.

### Finding 2 — declared citation kinds

`CITATION_KINDS` declares each document kind's spellings once (`EO` → "Executive Order", "Order"; `SB`
→ "Senate Bill"; `HB` → "House Bill"; `Ballot Measure` → "Measure"). `citationAliases` derives every
spelling from a document's own title, a number is **never** matched without its kind, matches are
word-bounded, the citation **nearest** the quotation wins, and both paths share `CITATION_WINDOW`.

### Finding 3 — cadence enforced in the stream

`screenedAnswer` counts the avatar's own words and injects `DISPLAY_FRAME` at the next sentence start
when the model has not re-identified itself. A test asserts `DISPLAY_FRAME` matches a declared frame —
otherwise the counter would never see its own injection and would inject again forever.

**The single bound had to become two, and a test is what showed it.** The first streaming run produced
stretches of **151 and 157 words** against a bound of 150: the frame is only ever placed at a sentence
start, never splitting a sentence, so the sentence in progress when the count crossed had to finish
first. Now `CADENCE_TARGET_WORDS = 150` is when injection triggers and `CADENCE_MAX_UNQUOTED_WORDS =
200` is the ceiling a reader is guaranteed — **both inside Thomas's "roughly 100–200"**. The README
previously promised 150 as a hard bound; it now describes the target and the ceiling. **Stated
limit:** a single sentence longer than the gap can still overshoot.

## Post-fix verification (2026-09-16)

### A flawed test of mine

The cadence test "does not count quoted text toward the bound" used made-up words as its long
quotation. Those are in no passage, so the answer was (correctly) **refused** — and the refusal notice
itself speaks as the avatar, so the test counted a second frame and failed for a reason unrelated to
cadence. It was measuring a refusal. It now quotes a passage that actually contains the text, and
asserts the quotation is released before counting frames.

### Demonstrate red

| Sabotage | Result |
|---|---|
| Single-quoted spans no longer recognised — **the confirmed bypass** | **RED** |
| Elision accepted again | **RED** *(the first attempt did not apply; the helper reported it vacuous rather than counting it, and it was redone)* |
| Curly nesting not tracked — close at the first inner mark | **RED** — a bill quoting its own defined term is refused |
| Straight double quotes accepted as a delimiter | **RED** |
| A bare number cites a document again | **RED** — `110%` cites Ballot Measure 110 |
| First-retrieved citation wins instead of nearest | **RED** |
| Cadence no longer enforced at runtime — **the confirmed gap** | **RED** |

### Live, through the running endpoint

Three questions across the three pillars. **No refusals and no cadence injections** — the server log
is empty of both, because the model complied on its own: it used curly marks throughout and repeated
the frame mid-answer unprompted by the runtime.

- **The case the grammar was rebuilt for happened in the wild.** The early-literacy answer quoted
  HB 3198's defined term with its own curly marks inside the avatar's quotation —
  `““Early elementary grades” means any grade from prekindergarten through grade three.”` — and it was
  verified and released. Without nesting it would have been refused.
- **Six precise figures and phrasings checked by hand** — `$567,593`, `more than 8,000 people`,
  `443,566 homes`, and three quoted sentences — **all verbatim in the documents cited.** One first read
  `NOT FOUND`, and it was run down rather than assumed: the corpus line-wraps that sentence mid-phrase,
  which the literal `grep` could not match and the verifier's normalisation correctly did. The screen
  was right and the check tool was too strict.
- Every answer closed by naming what its passages do **not** cover.
