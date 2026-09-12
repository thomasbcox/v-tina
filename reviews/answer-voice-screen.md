Date: 2026-09-11 · Branch: claude/answer-voice-screen · Status: proposed · Class: deployed

# answer-voice-screen — the answering register, and the preamble screen (story 3)

## Problem

User Story 3 is the voice. V-Tina currently answers correctly and sounds like nothing in
particular: `chat-safety-routing` shipped the router with a **deliberately plain** answering prompt,
marked three prompts `PROVISIONAL`, and left the register to this story. That was the right call —
a plausible-sounding placeholder would have been inherited and ratified — but it means the product
today reads like an assistant wearing a governor's name.

**The specification's own lexicon cannot be sourced, and its showcase answer cannot be grounded.**
Checked against this repository on 2026-09-11, before any of this was framed:

| The spec calls this one of her "lexical anchors" | Corpus documents containing it |
|---|---|
| "True North" | **0** |
| "mission-focused" | **0** |
| "not a blank check" | **0** |
| "accountability" | 6 — but as ordinary legislative vocabulary, not personal idiom |
| "deflection" | 1 — and there it is a **legal diversion programme** ("refer a person to a deflection program … before referral to the district attorney"), not a rhetorical move |

The corpus is five executive orders and six bills. **There is no speech, press-conference or
interview material in it at all**, so the repository holds no record of how she actually talks. The
specification's illustrative four-step answer cites "a 13% rise in unsheltered homelessness"; that
figure appears in **no** corpus document, and "MAC team" appears in none either.

**Taken literally, this story contradicts what story 2 shipped and Thomas verified.** The answering
prompt instructs the model to use only retrieved passages, invent no figures, and take nothing from
outside knowledge — and a real answer was read end to end confirming it holds. A prompt that also
demanded a 13% figure and three unsourced catchphrases would force the model to satisfy one rule or
the other, never both.

**Decided at intake, 2026-09-11.** Thomas was given four readings and chose **"the register, not the
catchphrases"**: build the *manner* — direct, urgent, impatient with process, focused on
accountability, never an assistant's preamble, and structured in four moves — while every factual
step still rests on a retrieved passage and **no phrase is attributed to the Governor that the
repository cannot support**. Sourcing her real idiom from actual speech material is a later story if
he wants it; it is a corpus-gathering effort on the scale of `seed-corpus-ingest`.

He also chose how the screen behaves: **screen the opening, then stream.** The agent contract says
the validator checks text "before output", which read literally means buffering the whole answer and
destroying the streaming that story 2 spent a round getting right. The opening is where assistant
preambles live, so only the opening is held.

## In scope

1. **`ANSWER_SYSTEM_PROMPT` rewritten for the register** — the four moves (the situation as people
   meet it; what the record shows; what was done; what is required next), plain declarative
   sentences, no throat-clearing, **and the source-only rule story 2 verified carried through
   unweakened**.
2. **`GROUNDED_DEFERRAL` and `FAILURE_NOTICE` rewritten in the same register** — both are read by
   the public and both are currently `PROVISIONAL`.
3. **`BANNED_OPENINGS`** — one declared vocabulary of assistant preambles, read by **both** the
   prompt (which forbids them) and the screen (which catches them), so the two cannot name
   different sets.
4. **The screen** — a pure function over text, deciding whether an opening carries a banned
   preamble and what to do with it. No I/O, no model call.
5. **Wiring it into the answer path** — the opening is buffered only until the screen can judge it,
   then released; the rest streams as it does today.
6. **`PROVISIONAL_PROMPTS` emptied**, with the partition check and the README pairing still holding
   over an empty list.
7. **A live verification run**, recorded: openings read for preambles, one complex answer read for
   the four moves, and the same grounded question story 2 verified re-read under the new prompt.
8. **README** — the register, the banned vocabulary, and what the screen does.

## Non-goals

- **Her actual idiom.** No catchphrase is attributed to her. Sourcing one needs speech material the
  repository does not have; that is a later story with its own corpus work.
- **The specification's "at least two lexical anchors" criterion.** Not met, and not quietly
  reworded: it asks for phrases nothing here can source. Recorded in Open questions.
- **Regenerating an answer that fails the screen.** See Open question 2.
- **A new stream event for screen violations.** The wire contract is not changed; violations are
  reported server-side. See Open question 3.
- **The diagnostic stress suite** (User Story 5) and **the chat screen** (User Story 4).
- **Changing the classifier or rewrite prompts.** They produce a label and a question, carry no
  voice, and story 2 classified them as such.

## Acceptance criteria

Criteria 1–6 are observable by a person using the product; 7–10 are workflow bookkeeping and stay as
numbered property assertions, per `AGENTS.md`.

1. **Given** an in-bounds question the corpus can ground,
   **When** V-Tina answers,
   **Then** the answer opens on the substance — no self-introduction, no naming of its own sources
   as "my sources", no assistant throat-clearing before the first real sentence.

2. **Given** a complex policy question with several retrieved passages,
   **When** V-Tina answers,
   **Then** the answer moves through the situation as people meet it, what the record shows, what was
   done about it, and what is required next,
   **And** every factual step rests on a retrieved passage, with no figure, programme or date that no
   passage supplies.

3. **Given** generated text whose opening carries a banned preamble,
   **When** it passes through the screen,
   **Then** that preamble never reaches the reader.

4. **Given** an ordinary well-formed answer with no banned opening,
   **When** it passes through the screen,
   **Then** the reader receives it complete and unaltered,
   **And** it still arrives progressively rather than as one block at the end.

5. **Given** the grounded housing-production question story 2 verified,
   **When** V-Tina answers it under the new register,
   **Then** every factual claim is still supported by a retrieved passage — the voice costs nothing
   in grounding.

6. **Given** a question V-Tina declines,
   **When** the reader sees the deferral,
   **Then** it reads in the same voice as an answer rather than as boilerplate from another system,
   **And** it still names Oregon's official state portal.

7. The banned-preamble vocabulary is a single declared constant that **both** the answering prompt
   and the screen read, and the README documents that same list, equal in both directions.

8. No prompt this story ships attributes a phrase, slogan or stance to the Governor that no corpus
   document supports.

9. `PROVISIONAL_PROMPTS` is empty, and the checks that ride on it — the exhaustive partition over
   every exported prompt, and the README pairing — still hold over an empty list rather than
   passing vacuously.

10. Scope containment: run
    `git diff --name-only main...HEAD -- . ':(exclude)reviews/'`
    and verify no files appear beyond `src/lib/prompts.ts`, `src/lib/voice.ts`,
    `src/lib/chat/orchestrate.ts`, `src/lib/chat/deps.ts`, `__tests__/`, and `README.md`.

## Test notes

### Risks — the wrong states a person could meet

- **R1 — The avatar asserts something about the Governor that no record supports.** A reader takes
  a generated turn of phrase for her actual position. This is the risk the whole intake decision
  turned on, and the one that does not announce itself: a confident register makes an unsourced
  stance *more* believable, not less.
- **R2 — A fabricated fact arrives dressed in a confident voice.** The four-move structure has a
  slot — "what the record shows" — that invites a number whether or not a passage supplies one. The
  specification's own example fills it with a figure the corpus does not contain.
- **R3 — A legitimate answer is suppressed, truncated or delayed.** The screen holds the opening; a
  false positive eats a good answer, or the buffering turns a streaming reply into a long silence.
- **R4 — An assistant preamble reaches the reader anyway.** The prompt forbids a phrase the screen
  does not catch, or a path exists that skips the screen entirely.
- **R5 — Grounding quietly loosens.** The new prompt is longer and about style; the source-only rule
  story 2 verified gets diluted, and answers start drifting from their passages.

### Oracles

| AC | Oracle | Mechanism |
|---|---|---|
| 1 | `manual` | **R4.** A live run over several in-bounds questions across the three pillars, with every answer's first two sentences quoted in this file and read for self-introduction, source-naming and throat-clearing. No offline oracle can judge this — the suite drives a fake model that returns whatever the test wrote. Red when a recorded opening introduces the speaker or the system instead of answering. |
| 2 | `manual` | **R2.** One complex question, live, with the retrieved passages captured alongside the answer; each factual step traced back to a passage the way story 2's grounding read was done, and the four moves identified in order or their absence recorded. Red when a step names a figure, programme or date no captured passage contains, or when the moves cannot be found. |
| 3 | `Small` | **R4.** The screen over a table of openings built from `BANNED_OPENINGS` itself — the extent comes from the constant, not a retyped list — plus real-shaped variants (leading whitespace, markdown emphasis, differing case, the phrase mid-first-sentence). Red when a banned opening passes the screen unflagged. |
| 4 | `Small` | **R3.** Two halves. The screen over well-formed answers returns them byte-identical, including ones that merely *mention* a banned phrase later in the body rather than opening with it. And the answer path, driven with a fake generator, still emits more than one token record for a multi-part answer and emits the first before the last arrives. Red when a clean answer is altered, or when the whole answer arrives as a single record. |
| 5 | `manual` | **R5.** The same housing-production question story 2 read, run again under the new prompt, with passages and answer captured and every claim traced. Red when a claim appears that no captured passage supports — the comparison is against story 2's recorded result, so a regression is visible rather than judged afresh. |
| 6 | `manual` | **R1.** Read the deferral aloud against an answer. Red when it reads as system boilerplate, or when it no longer names the portal. A person judges register; dressing that up as an assertion is the dishonesty this column exists to prevent. |
| 7 | `Small` | **R4.** Assert the prompt text contains every member of `BANNED_OPENINGS` (so the prompt forbids exactly what the screen catches), and compare the README's documented list against the constant in both directions, each extent parsed from its own source. Red when a phrase is added to the screen and not the prompt, or to either and not the README. |
| 8 | `reviewer` | **R1.** The reviewer reads every prompt this story ships and looks for any phrase, slogan or stance attributed to the Governor, then checks each against the corpus. **No mechanical oracle exists** — a grep for the five phrases the specification names would pass the moment a sixth is invented, which is precisely the failure. Red when the reviewer finds an attributed phrase the corpus does not support. |
| 9 | `Small` | **R1.** Assert `PROVISIONAL_PROMPTS` is empty **and** that the partition still covers every exported prompt — the emptiness must not be achieved by removing the list or the check. Includes the vacuity case: the partition test must still fail when a new unclassified prompt is added. Red when a voice-bearing prompt ships unclassified, or when emptiness was reached by deleting the guard. |
| 10 | `reviewer` | Loop check, run once: the enumerated diff command, compared against the AC's paths, plus a read of what landed in each. Catches no product risk — it is a workflow property, which is why it is not a suite test. |

### Regressions (ratified list — sourced from the step-6 design review)

Proposed by the independent reviewer against the labelled risks and the sized criteria,
before any implementation existed. **Every risk R1–R5 and every sized criterion (3, 4, 7, 9)
received one; there is no coverage gap.** The tenth entry is a critique of the risk list
itself and is presented at the consult as its own decision.

**R1**

- Every recorded check passes — no named catchphrase, no attributed slogan — while the register
  instructions themselves become the unsourced stance: the 'what is required next' move
  instructs the model to state a requirement, and a confident prescriptive demand ('Oregon must
  now fund X') is a position attributed to the Governor that no passage supports. The letter (no
  lexical anchor appears) holds; the intent (nothing asserted about her that the record cannot
  support) is violated by the structure the prompt mandates, and a claim-by-claim trace that
  only checks facts waves a normative demand through as 'structure'.

**R2**

- The answer's 'what the record shows' slot is filled with a figure that genuinely appears in a
  captured passage — but attached to a different subject, year, or programme than the passage
  attaches it to. A step-by-step trace that asks 'does this number appear in a passage' passes
  every step while the assembled claim is false. Letter: each token is sourced; intent: the
  CLAIM is supported, which requires the figure's referent to match, not merely its digits.

**R3**

- Clean answers pass byte-identical and the multi-record streaming test passes, while every
  single exchange now waits for a complete first sentence (or the cap) before the first record
  is emitted — on a slow generation that is several added seconds of dead silence per answer,
  forever, even when nothing is ever flagged. The letter ('arrives progressively rather than as
  one block') holds; the intent (the streaming experience story 2 measured and chose a model for
  — 1.5s to first word) is quietly taxed on every reader, and no oracle measures the delay's
  size.

**R4**

- The buffer releases at the character cap before a long first sentence completes, and once
  released the screen never sees later text — so a banned phrase sitting past the cap in a
  rambling opening sails through on the live path while the suite's table (which never exercises
  a banned phrase beyond the cap) stays green. A second, independent letter/intent gap: the
  prompt honestly forbids and the screen honestly catches every LISTED phrase, while the model
  opens with an unlisted preamble ('Certainly! Great question.') — list complete, both halves
  honest, preamble reaches the reader. The intent is 'no assistant preamble'; the letter is 'no
  listed preamble', and only AC1's manual read stands between them.

**R5**

- The source-only rule text survives verbatim in the new prompt — the letter everyone will check
  — while the surrounding register instructions ('be direct, be urgent, never hedge, say what is
  required') push the model to resolve passage ambiguity confidently: answers stay loosely
  'supported' but overstate direction, the precise failure story 2's prompt explicitly forbids
  ('do not overstate... do not reverse its direction') and the register actively invites. And
  AC5's oracle is one question read once: the model can happen to behave on that single question
  while the register systematically loosens grounding everywhere else — a sample of one cannot
  carry a claim about the register's cost.

**AC3** *(oracle: `Small`)*

- The screen is validated over openings built from BANNED_OPENINGS plus the named variants, and
  all pass — while a banned preamble that opens the SECOND sentence ('Housing is the defining
  crisis of our time. As your Governor, I have always said...') is never examined, because the
  screen judges only the first-sentence buffer and the variant table covers 'mid-first-sentence'
  but nothing later. A reader meets a preamble; the letter ('an opening carrying a banned
  preamble never reaches the reader') is satisfied by defining 'opening' as whatever the buffer
  happened to hold.

**AC4** *(oracle: `Small`)*

- The streaming half passes with exactly two records — the held opening, then the entire
  remainder as one block — satisfying 'more than one token record' and 'first before last' while
  a multi-paragraph real answer reaches the reader as a pause followed by a wall of text. The
  fake generator also supplies conveniently pre-chunked tokens, so re-segmentation on release
  (whitespace re-joined differently than it arrived) is never challenged. Letter: progressive,
  plural records; intent: token-by-token delivery as it is generated, the thing story 2 built
  the pull-based stream to get.

**AC7** *(oracle: `Small`)*

- The assertion 'the prompt text contains every member of BANNED_OPENINGS' passes with the list
  interpolated under a heading that never forbids it — 'Vocabulary:' — or even in a context that
  presents the phrases neutrally, so prompt and screen provably name the same set while the
  prompt does not tell the model to avoid any of them. The containment test cannot distinguish
  'forbidden' from 'mentioned', which is the criterion's entire intent. (See the NIT finding on
  the priming hazard this also entrenches.)

**AC9** *(oracle: `Small`)*

- PROVISIONAL_PROMPTS is empty and the partition verifiably covers every exported prompt — the
  letter — because a genuinely voice-bearing prompt (say, a new reader-facing notice added in
  this or a later change) was classified into ROUTING_PROMPTS. The partition test checks
  coverage, never correctness of classification: a prompt a reader hears sits in the 'no voice'
  bucket, every test green, which is precisely the misclassification the partition exists to
  catch. The vacuity case the author names proves the list isn't empty-by-deletion; it does not
  prove the lists mean what they claim.

**Risk list (missing risk)**

- R1–R5 are all genuine wrong-states a person can meet — none is a scope statement in risk's
  clothing — but one real wrong-state is missing: the FAILURE_NOTICE register rewrite. A reader
  mid-answer on a failed stream reads the notice; rewritten for voice it could perform the
  Governor's persona during an infrastructure failure (an avatar apologising in-character for a
  system error asserts something false about the situation) or dilute its one load-bearing
  disclosure — 'the answer is incomplete' — in favour of sounding right. R1 covers positions
  about the Governor, R5 covers answer grounding; neither covers a failure notice that trades
  honesty for register. Add an R6, or extend R1 to cover it, and give the notice's disclosure
  the same Small pin recommended for AC6's portal.

## Loop record

- frame/6 — ran (codex on kimi-latest, 4 findings, 10 regressions) -> reviews/answer-voice-screen.design.fdc04f4.json
- frame/9 — not yet reached
- review/6 — not yet reached
- review/8 — not yet reached
- close/3b — not yet reached
- close/4 — not yet reached

## Open questions

1. **The specification's "at least two lexical anchors" criterion is not met.** The intake decision
   makes it unmeetable: three of the five have no corpus evidence and one means something else
   entirely. Proposed: record it as a stated non-goal with the evidence above, and let a later
   sourcing story meet it properly. The alternative is to meet it with invented idiom, which is the
   option Thomas already declined. Flagged because it leaves a written acceptance criterion of the
   product specification unsatisfied, and that should be a decision rather than a silence.

2. **What happens to an answer whose opening is banned?** Three options. **(a) Proposed: strip the
   matched preamble and stream the remainder** — surgical, costs nothing, and the answer survives;
   the risk is a mangled first sentence when the match is sloppy. **(b) Regenerate once** — a
   cleaner result when it works, at the cost of a second full generation (measured 3–12 s before the
   first word) and no guarantee the retry is different. **(c) Let it through and record the
   violation** — never mangles anything, and fails R4 by design.

3. **Should a screen violation reach the client?** Proposed: **no** — report it server-side and
   leave the wire contract alone. Adding an event member changes a contract User Story 4 is about to
   build against, for information a reader cannot act on. Two-way, recorded so the reviewer can
   challenge it.

4. **How much of the opening is held?** The screen needs enough text to judge and no more. Proposed:
   hold until the first sentence boundary or a small character cap, whichever comes first, then
   release. Named because it is the knob that trades R3 (delay) against R4 (a preamble slipping
   past), and the reviewer should see it stated rather than buried in the implementation.

5. **Does the four-move structure apply to every answer, or only complex ones?** The specification
   says "for complex answers" without defining complex. Proposed: instruct the structure as the
   shape for a substantive policy answer and let a one-line factual question be answered in a line —
   forcing four moves onto a simple question produces padding, which reads as evasion. Two-way.

## Design sketch — HOW

**Three pieces, and only one of them is new code.**

```
src/lib/prompts.ts        ANSWER_SYSTEM_PROMPT rewritten for the register; GROUNDED_DEFERRAL and
                          FAILURE_NOTICE rewritten to match; BANNED_OPENINGS declared here, beside
                          the prompt that forbids them; PROVISIONAL_PROMPTS empties.
src/lib/voice.ts          NEW. The screen: a pure function over text. No I/O, no model, no
                          dependency — the whole point is that it is decidable offline, unlike
                          everything else this story touches.
src/lib/chat/orchestrate.ts  Holds the opening until the screen can judge it, then releases and
                          streams the rest unchanged.
```

**Why the vocabulary is one constant.** The prompt must forbid exactly what the screen catches. Two
lists drift the moment someone adds a phrase to one — and the failure is silent, because the prompt
still reads as if it forbids the phrase while nothing enforces it. `BANNED_OPENINGS` is interpolated
into the prompt the way `SAFETY_CLASSIFICATIONS` is already interpolated into the classifier prompt,
which is this repository's existing answer to the same problem.

**The screen is deliberately dumb.** Normalised comparison against a declared list, anchored to the
opening — not a model call, not a classifier, not a regex language. A screen that needs judgement is
a screen that needs testing against judgement, and this story already has more unfalsifiable surface
than any before it. What it can do, it does completely and offline.

**Holding the opening without breaking the stream.** The answer path already pulls one record at a
time (story 2's pull-based stream). The change is to accumulate the first tokens into a buffer
rather than emitting them, stop as soon as the screen can decide, and then emit — after which every
subsequent token passes straight through. The delay is the time to generate a sentence, not the
whole answer, and the streaming shape story 2 built is otherwise untouched.

**What this story cannot prove, said plainly.** Six of its ten criteria are judged by a person or by
the reviewer, and that is not a gap to be engineered away: a prompt's effect on prose is not
decidable by a test, and the one previous story that tried to check prompt quality offline learned
that the fake model returns whatever the test author wrote. The mechanically-checkable parts — the
screen, the shared vocabulary, the partition — are checked completely. The rest is read, and
recorded in this file so it can be re-read.

## Codex (kimi-latest) design review (2026-09-11)

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
