Date: 2026-09-11 · Branch: claude/answer-voice-screen · Status: proposed · Class: deployed

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
   question, naming the document; use the avatar frame for everything that is not a quote; never
   write first person as the Governor. The source-only rule story 2 verified is carried through
   unweakened.
2. **`AVATAR_FRAME`** — the declared self-identification the answer must carry, and
   **`IMPERSONATION_FORMS`** — the declared set of first-person-as-Governor openings that must not.
   Both read by the prompt and by the screen, so the two cannot name different sets.
3. **The opening screen** — a pure function deciding whether an opening carries the avatar frame and
   whether it impersonates. No I/O, no model call.
4. **Quote verification** — a pure function over an answer and the passages retrieved for it,
   reporting every quoted span that is **not** verbatim in any passage. This is the story's strongest
   check and the reason the direction above is worth building to.
5. **Wiring the opening screen into the answer path** — the opening is held only until the screen can
   judge it, then released; the rest streams as today.
6. **`GROUNDED_DEFERRAL` and `FAILURE_NOTICE` rewritten in the avatar's voice**, both currently
   `PROVISIONAL`, and both read by the public.
7. **`PROVISIONAL_PROMPTS` emptied**, with the partition check and the README pairing still holding.
8. **A live verification run**, recorded: openings read for the frame and for impersonation, one
   complex answer read with its passages for quote fidelity and citation, and the grounded question
   story 2 verified re-read under the new prompt.
9. **README** — the provenance rule, the declared vocabularies, and what the screen does.

## Non-goals

- **Her idiom, and the spec's "at least two lexical anchors" criterion.** Not met, and not quietly
  reworded — it asks for phrases nothing here can source. See Open question 1.
- **A style corpus.** Sourcing her real speech is a later story with its own corpus work.
- **Gating the stream on quote verification.** See Open question 2.
- **A new stream event for screen findings.** The wire contract is unchanged. See Open question 3.
- **The chat screen (User Story 4) and the diagnostic suite (User Story 5).**
- **The classifier and rewrite prompts** — they produce a label and a question, carry no voice.

## Acceptance criteria

Criteria 1–7 are observable by a person using the product; 8–11 are workflow bookkeeping and stay as
numbered property assertions, per `AGENTS.md`.

1. **Given** an in-bounds question the corpus can ground,
   **When** V-Tina answers,
   **Then** the answer identifies its speaker as a virtual avatar of the Governor rather than as the
   Governor.

2. **Given** any answer V-Tina generates,
   **When** a reader reads it,
   **Then** nothing in it is written in the Governor's first person — the avatar never says "I" as her.

3. **Given** an answer containing quoted material,
   **When** each quotation is compared against the passages retrieved for that answer,
   **Then** every quoted span appears verbatim in one of them,
   **And** each is attributed to the document it came from.

4. **Given** an in-bounds question whose passages contain language that answers it,
   **When** V-Tina answers,
   **Then** the answer quotes the record rather than only paraphrasing it,
   **And** any statement that is not a quotation is framed as the avatar's own.

5. **Given** generated text whose opening impersonates the Governor,
   **When** it passes through the screen,
   **Then** that opening never reaches the reader.

6. **Given** an ordinary well-formed answer,
   **When** it passes through the screen,
   **Then** the reader receives it complete and unaltered,
   **And** it still arrives progressively rather than as one block at the end.

7. **Given** a question V-Tina declines, or an answer that fails part-way,
   **When** the reader sees the deferral or the failure notice,
   **Then** it speaks as the avatar, not as the Governor,
   **And** the deferral still names Oregon's official state portal while the failure notice still
   discloses that the answer is incomplete.

8. The avatar-frame vocabulary and the impersonation-form vocabulary are single declared constants
   that **both** the answering prompt and the screen read, and the README documents the same lists,
   equal in both directions.

9. No prompt this story ships attributes a phrase, slogan or stance to the Governor that no corpus
   document supports.

10. `PROVISIONAL_PROMPTS` is empty, and the checks riding on it — the exhaustive partition over every
    exported prompt, and the README pairing — still hold over an empty list rather than passing
    vacuously.

11. Scope containment: run
    `git diff --name-only main...HEAD -- . \':(exclude)reviews/\''
    and verify no files appear beyond `src/lib/prompts.ts`, `src/lib/voice.ts`,
    `src/lib/chat/orchestrate.ts`, `__tests__/`, and `README.md`.

## Test notes

### Risks — the wrong states a person could meet

- **R1 — A reader takes generated prose for the Governor's own words.** The avatar writes a
  characterisation, a stance, or a turn of phrase that reads as hers. This is the risk the whole
  direction exists to remove, and the one that does not announce itself.
- **R2 — A quotation is presented as the record and is not.** Quotation marks and a document name
  make a span look verifiable; if the words are not actually in the passage, the citation makes a
  fabrication *more* credible rather than less.
- **R3 — A legitimate answer is suppressed, truncated or delayed.** The screen holds the opening; a
  false positive eats a good answer, or the buffering turns a streaming reply into a long silence.
- **R4 — An impersonation reaches the reader.** The prompt forbids a form the screen does not catch,
  or a path skips the screen entirely.
- **R5 — Grounding quietly loosens.** The new prompt is longer and about provenance; the source-only
  rule story 2 verified gets diluted and answers drift from their passages.
- **R6 — The failure notice performs the persona during an infrastructure failure.** An avatar
  apologising in character for a server error asserts something false about what happened, or dilutes
  its one load-bearing disclosure — that the answer is incomplete — in favour of sounding right.
  *(Added from the round-1 design review, which argued R1 and R5 leave it uncovered.)*

### Oracles

| AC | Oracle | Mechanism |
|---|---|---|
| 1 | `Small` | **R1.** The screen over an answer opening, driven from `AVATAR_FRAME` itself so the extent comes from the constant. Red when an opening carrying no avatar identification is judged acceptable. The live half is AC4's read; this pins the mechanical half the repo's convention already pins. |
| 2 | `manual` | **R1.** A live run across the three pillars, every answer read for first-person-as-Governor. No offline oracle exists: the suite drives a fake model returning whatever the test wrote, so it can prove the screen catches a listed form and never that the model avoided an unlisted one. Red when a recorded answer says "I" as her. |
| 3 | `Small` | **R2.** The quote-verification function over an answer and its passages: quoted spans present verbatim pass; a span altered by a word, a span attributed to a document it is not in, and a span in no passage at all each fail. Whitespace is normalised; nothing else is. Red when a quotation absent from every passage is reported as verified. |
| 4 | `manual` | **R2.** One complex question, live, with its retrieved passages captured beside the answer. Read for whether the record is quoted rather than only paraphrased, and whether every non-quoted statement is framed as the avatar's. Red when the answer paraphrases throughout while passages offered quotable language, or when a characterisation appears unframed. |
| 5 | `Small` | **R4.** The screen over openings built from `IMPERSONATION_FORMS` itself, plus real-shaped variants (leading whitespace, markdown emphasis, differing case, the form past the first clause). Red when an impersonating opening passes unflagged. |
| 6 | `Small` | **R3.** Two halves. The screen returns a clean answer byte-identical, including one that merely *mentions* an impersonation form later in the body. And the answer path, driven with a fake generator, emits the first token record before the last arrives and emits more than two records for a multi-part answer — so a held opening followed by one block fails. Red when a clean answer is altered, or when delivery collapses to a pause and a wall of text. |
| 7 | `Small` | **R6.** Assert `GROUNDED_DEFERRAL` contains `OREGON_PORTAL_URL`, and that `FAILURE_NOTICE` still discloses the answer is incomplete — both pinned against constants that already exist rather than left to a live read. *(From the round-1 review, which showed this half was mechanically pinnable and had been assigned to a human.)* The register half of the criterion is read live and recorded. Red when a rewrite drops the portal or the incompleteness disclosure. |
| 8 | `Small` | **R4.** Assert the prompt forbids each member of `IMPERSONATION_FORMS` — the assertion is over the forbidding scaffold, not bare containment, so a list under a neutral heading fails — and compare the README's documented lists against the constants in both directions, each extent parsed from its own source. Red when a form is added to the screen and not the prompt, or to either and not the README. |
| 9 | `reviewer` | **R1.** The reviewer reads every prompt this story ships, looks for any phrase, slogan or stance attributed to the Governor, and checks each against the corpus. **No mechanical oracle exists** — a grep for the five phrases the specification names passes the moment a sixth is invented, which is the failure. Red when the reviewer finds an attributed phrase the corpus does not support. |
| 10 | `Small` | **R1.** Assert `PROVISIONAL_PROMPTS` is empty **and** that the partition still covers every exported prompt, so emptiness cannot be reached by deleting the list or the check. Includes the vacuity case: the partition must still fail when an unclassified prompt is added. Red when a voice-bearing prompt ships unclassified, or when the guard was removed. |
| 11 | `reviewer` | Loop check, run once: the enumerated diff command compared against the AC's paths, plus a read of what landed in each. Catches no product risk — it is a workflow property, which is why it is not a suite test. |

### Regressions (ratified list — sourced from the step-6 design review)

*(Round 2 pending. The round-1 list below was written against the superseded design and is kept only
as a record.)*

## Loop record

- frame/6 — not yet reached
- frame/9 — not yet reached
- review/6 — not yet reached
- review/8 — not yet reached
- close/3b — not yet reached
- close/4 — not yet reached

## Open questions

1. **The specification's "at least two lexical anchors" criterion is not met.** Three of the five
   have no corpus evidence and one means something else entirely. Proposed: record it unmet, with the
   evidence in Problem, and let a later sourcing story meet it properly. Flagged because it leaves a
   written criterion of the product specification unsatisfied, and that should be a decision rather
   than a silence.

2. **How often must the avatar frame appear?** Thomas's direction — "use that sort of language
   whenever saying something that is not a quote" — reads two ways, and they produce very different
   prose. **(a) Proposed: once at the top, plus attributed language throughout** — the answer opens
   as the avatar, and every non-quoted statement uses attributing constructions ("the order states",
   "under EO 23-04") rather than bare assertion. Readable, and it never speaks as her. **(b) The
   frame repeated at each non-quoted assertion** — maximally explicit about provenance, and
   repetitive enough that readers may stop reading it. Named because it shapes the texture of every
   answer and only Thomas can say which he meant.

3. **Does quote verification gate the stream, or only report?** A quotation is only complete when its
   closing mark arrives, so gating means holding the answer. **Proposed: not a runtime gate** — it is
   a pure function exercised by the suite and run over the live verification answers, with findings
   recorded server-side. **The cost is stated rather than hidden:** an unverifiable quotation can
   reach a reader at runtime, and only the prompt stands between. The alternative is to buffer the
   whole answer, which is the thing story 2 spent a round making unnecessary.

4. **What happens to an opening that impersonates?** **(a) Proposed: strip to a clean sentence
   boundary, and if what remains does not start cleanly, fail the answer rather than emit wreckage.**
   **(b) Pass it through and record** — never mangles, and lets an impersonation reach a reader, which
   for this product is the worse failure. **(c) Regenerate once** — 3–12 s before the first word,
   doubled, with no guarantee the retry differs.

5. **Should a screen finding reach the client?** Proposed: **no** — report server-side, leave the wire
   contract alone. Adding an event member changes a contract User Story 4 is about to build against,
   for information a reader cannot act on. Two-way; recorded so the reviewer can challenge it.

6. **How much of the opening is held?** Proposed: until the first sentence boundary or a small
   character cap, whichever comes first. Named because it is the knob trading R3 (delay) against R4
   (an impersonation slipping past the cap), and it should be stated rather than buried.

## Design sketch — HOW

**Three pieces; one of them is new code.**

```
src/lib/prompts.ts           ANSWER_SYSTEM_PROMPT rewritten around provenance. AVATAR_FRAME (the
                             required self-identification) and IMPERSONATION_FORMS (the forbidden
                             first-person-as-Governor openings) declared here, beside the prompt
                             that uses them. GROUNDED_DEFERRAL and FAILURE_NOTICE rewritten in the
                             avatar's voice. PROVISIONAL_PROMPTS empties.
src/lib/voice.ts             NEW, and entirely pure. `screenOpening(text)` — does this opening carry
                             the avatar frame, and does it impersonate? `verifyQuotations(answer,
                             chunks)` — which quoted spans are NOT verbatim in any passage?
src/lib/chat/orchestrate.ts  Holds the opening until `screenOpening` can judge it, then releases;
                             everything after streams unchanged.
```

**Quote verification is the reason this design is worth building.** It takes the answer text and the
chunks already retrieved for it, extracts quoted spans (straight and typographic marks), normalises
whitespace only, and reports every span that is not a substring of some passage. No model, no
network, no judgement — the strongest guarantee in the story, and the one the previous sketch could
not offer at all, because when the avatar characterises rather than quotes there is nothing to
compare against.

**The screen is deliberately dumb.** Normalised comparison against declared lists, anchored to the
opening. A screen needing judgement would need testing against judgement, and this story already
carries person-judged surface. What it can decide, it decides completely and offline.

**One vocabulary, two consumers.** The prompt must require exactly the frame the screen looks for and
forbid exactly the forms it catches. Two lists drift the moment someone edits one — silently, because
the prompt still reads as though it forbids the phrase while nothing enforces it. The constants are
interpolated into the prompt the way `SAFETY_CLASSIFICATIONS` already is into the classifier's.
**Under an explicit forbidding instruction, not a bare list** — the round-1 review showed that
containment alone proves the phrases are present, not that they are prohibited, and that handing a
generative model a neutral list of phrases primes it with them.

**Holding the opening without breaking the stream.** The answer path already pulls one record at a
time. The change is to accumulate the first tokens rather than emitting them, stop as soon as the
screen can decide, then emit — after which every token passes straight through. The delay is a
sentence, not an answer.

**What this story still cannot prove.** Whether the model actually quotes rather than paraphrases,
and whether it ever slips into her first person, are read by a person: the suite drives a fake model
that returns whatever the test wrote. But the direction Thomas set moved the biggest risk — words put
in a real person's mouth — from "read it and hope" to a function that either finds the span in a
passage or does not.


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
