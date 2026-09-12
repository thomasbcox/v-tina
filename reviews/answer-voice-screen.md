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

*(Not yet written. The design review proposes these against the labelled risks and the sized
criteria before any implementation exists; step 7 ratifies them and step 9 demonstrates red against
the ratified list.)*

## Loop record

- frame/6 — not yet reached
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
