Date: 2026-10-03 · Branch: claude/chat-screen · Status: approved · Class: deployed

# chat-screen — the reader's screen: the avatar notice, the streamed answer, and its sources (story 4, first pass)

**Approved 2026-10-03.** Thomas, at the frame consult: "A scope thin; b1 C, b2 B, c1 b, c2 fix,
c3 accept; D accept; E take your suggestions". Scope is the thin first version. The stop notice
becomes its own record kind (B1, option C). Components are tested with Testing Library under jsdom
(B2, option B — Thomas's choice over the recommendation of no new test dependency). Screen copy
lives in its own declared registry (C1, option b). A failure the screen itself meets gets a visible
notice and its own criterion (C2). The rejected parsing library is recorded (C3). The risk list and
the regressions are ratified as recommended (D). Open questions 4–8 take the recommended options
(E). Every disposition is recorded under *Design decisions* below.

## Problem

V-Tina answers questions, but only through `POST /api/chat`, read from a terminal. The home page
(`src/app/page.tsx`) still says "Foundation only — no application code has been built yet", and the
README's Status paragraph says there is no user interface. So the product's central promise — that a
reader can check every claim against its `oregon.gov` original — exists only as a `retrieved_chunks`
record in an event stream. No member of the public can see an answer, a source, or a link.

Thomas chose this story on 2026-10-03 from a three-option menu (the chat screen as a thin first
version; a scheduled keep-alive for the database; fewer cut-off answers), with this scope: the screen
that shows the avatar notice, streams the answer, and lists the sources with links — and the
specification's inline citation badges and side "Verification Panel" as a second pass.

Three things the live run of 2026-09-28 showed bear directly on what the screen must do:

- **A stop notice arrives mid-sentence.** When the quotation screen refuses a quotation, the
  provenance notice is streamed as more text, so a reader of the raw stream saw "…the local
  government As a virtual avatar of the Governor, I stopped this answer…". The stream cannot take
  back text already sent; the screen has to show the notice apart from the answer.
- **The partisan path answers a reworded question.** The README (*How a question is routed*)
  promises the reader is shown the rewording. Nothing shows it yet.
- **Nothing arrives for up to 10 seconds.** Classification's deadline is 10 s before the first
  record. `BACKLOG.md` FEAT-4 asks that the reader be told an answer can take a while; it names
  this story as where that lands.

## In scope

1. **The avatar notice**, shown at the top and the bottom of the screen at all times: V-Tina is a
   virtual AI avatar, not the Governor and not an official state service.
2. **A transcript**: the reader's question, then the answer as it streams in, with a waiting notice
   from the moment the question is sent until the first record arrives (FEAT-4).
3. **Sources after each grounded answer**: one entry per document the answer drew on, its title
   linked to the document's official URL, its as-of date, and the retrieved passage(s) readable in
   place.
4. **The neutral rewording**, shown before the answer on the partisan path.
5. **Notices set apart from the answer** — the provenance stop, the failure notice, and the
   screen's own notice when the stream breaks or a record cannot be read — with the answer visibly
   marked incomplete.
6. **The conversation carried as history**, within the limits the service accepts.
7. **The `notice` record kind** on the wire, emitted where the quotation screen stops an answer
   (Open question 2, option C). Its text is unchanged; only how it travels changes.
8. **A declared registry of screen copy**, held equal to a README list by a test, the pattern the
   prompts, the pillars and the source domains already use (Open question 3 of the design review;
   finding 2).
9. **Testing Library under jsdom** as the way screens are tested, as development dependencies
   (Open question 3, option B).
10. **The README**: the Status paragraph, a *The chat screen* section, a *Screen copy* list, and a
    `notice` row in the record table.
11. **FEAT-4 closed** by this story (its Done row is written at `/close`).

## Non-goals

- **Inline citation badges in the answer text, and the side Verification Panel** they open
  (User Story 4's second half). Second pass. This story's Sources list carries the same documents,
  links and excerpts, below the answer rather than beside it.
- **The "unified system footer" under every response** as a literal fixed line (Open question 4,
  decided: the Sources list is the footer).
- **Any change to how answers are produced**: routing, retrieval, the threshold, the quotation
  screen, the prompts. The one exception is the `notice` record kind: the stop notice travels as
  its own record, with its text unchanged.
- **A "working" record from the server** (FEAT-4's second half; Open question 7, decided: no).
- **Showing the classification label** (`IN-BOUNDS` and the rest) to the reader. Only its visible
  consequence is shown: the rewording, or the deferral.
- **Any audit indicator.** `audit_log_status` is always `recorded: false`; the screen shows nothing
  for it.
- **Accounts, sessions, or keeping a conversation across reloads.** A reload starts a new
  conversation.
- **A component library or a streaming-client library.** Tailwind and `fetch` are already here.
  Testing Library is a development dependency, not a runtime one; `eventsource-parser` was
  considered and rejected (design sketch).
- **Caching (FEAT-5), the audit log, deployment, and the diagnostic suite (User Story 5).**

## Acceptance criteria

Criteria 1–13 are observable in the product and are written as scenarios; 14–15 are bookkeeping
and stay as plain assertions, per `AGENTS.md`. Criterion 10 was added at approval (design review
finding 3); the criteria that were 10–14 moved to 11–15. Criteria 1–9 keep the numbers the consult
ratified.

1. **Given** the page in any state — before a question, while an answer is arriving, after it has
   ended,
   **When** the reader looks at the screen,
   **Then** a notice saying V-Tina is a virtual AI avatar, not the Governor and not an official
   state service, is shown at the top of the screen and again at the bottom.

2. **Given** a transcript longer than the screen,
   **When** the reader scrolls through it,
   **Then** the top and bottom notices stay in view,
   **And** each is legible in high contrast in both the light and the dark colour scheme.

3. **Given** a question typed into the input,
   **When** the reader sends it,
   **Then** the question appears in the transcript and, until the first part of the response
   arrives, the screen says the answer is on its way and may take several seconds.

4. **Given** a question the record can ground,
   **When** the answer arrives,
   **Then** its text appears in the transcript as it is generated, not all at once at the end.

5. **Given** an answer that drew on retrieved passages,
   **When** the answer ends,
   **Then** a Sources list follows it, naming each document once, with its as-of date, its title
   linked to the document's official URL, and the retrieved passage(s) readable.

6. **Given** a question the classifier marks as a partisan trap,
   **When** the response arrives,
   **Then** the reader sees, before the answer, the neutral rewording that was actually answered,
   marked as a rewording.

7. **Given** a question V-Tina declines — out of bounds, or nothing in the record above the
   threshold,
   **When** the response arrives,
   **Then** the reader sees the deferral as the answer and no Sources list.

8. **Given** an answer the quotation screen stops,
   **When** the stop notice arrives,
   **Then** it is shown as a notice set apart from the answer text — not run on as the answer's
   last sentence —
   **And** the answer is marked as stopped before it was complete.

9. **Given** an answer that fails for an infrastructure reason after it began,
   **When** the failure record arrives,
   **Then** its notice is shown set apart from the answer text,
   **And** the answer is marked incomplete.

10. **Given** an answer whose stream breaks before its final record — the connection drops, or a
    record arrives that cannot be read,
    **When** the stream ends,
    **Then** the reader sees a notice, set apart from the answer text, saying the answer may be
    incomplete,
    **And** the answer is marked incomplete.

11. **Given** an answer still arriving,
    **When** the reader tries to send another question — by the button or by the keyboard,
    **Then** nothing is sent and the send control is unavailable until the answer has ended.

12. **Given** a conversation that has already reached the most turns the service accepts in one
    request,
    **When** the reader sends another question,
    **Then** it is answered — the earliest turns are left out of what is sent — rather than
    refused.

13. **Given** a phone-width screen,
    **When** the reader opens the page and asks a question,
    **Then** the notices, the transcript, the sources and the input fit the width without
    horizontal scrolling.

14. The README's Status paragraph no longer says there is no user interface; a *The chat screen*
    section states what the screen shows — the two notices, the waiting state, the sources, the
    rewording, and how a notice is told apart from answer text; a *Screen copy* list names the
    registry's constants and a test holds it equal to the code in both directions; and the record
    table gains a `notice` row.

15. Scope containment: `git diff --name-only main...HEAD -- . ':(exclude)reviews/'` lists only
    `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, files under
    `src/components/`, `src/lib/chat/client.ts`, `src/lib/copy.ts`, `src/lib/chat/events.ts`,
    `src/lib/chat/orchestrate.ts`, files under `__tests__/`, `vitest.config.mts`, `package.json`,
    `package-lock.json`, `README.md`, `BACKLOG.md` (FEAT-4 moved to Done at close), and
    `.claude/launch.json`.

## Test notes

### Risks — the wrong states a person could meet

Ratified as listed at the 2026-10-03 consult; the design review found the list complete.

- **R1 — The reader mistakes who is speaking.** The avatar notice is absent, renders empty, or is
  out of view in some state of the page: after scrolling, on a phone, while an answer streams. A
  reader takes V-Tina's words for the Governor's, or the site for an official state service. This
  is the product's first safety rule, and the screen is where it is kept or lost.
- **R2 — A notice reads as the answer.** The provenance stop or the failure notice runs on from the
  answer's last sentence, so a stopped answer reads as finished and the notice's words read as
  part of what the record says. Seen live on 2026-09-28 in the raw stream.
- **R3 — The sources shown are not the ones that grounded the answer.** A document missing, one
  entry per passage instead of per document, a link to the wrong address, or the previous turn's
  sources shown under this answer. The reader verifies against the wrong document, or cannot
  verify at all — which is the one thing this product exists to make possible.
- **R4 — The screen is silent or stuck.** Nothing shows while classification runs (up to 10 s), so
  the reader leaves. A record split across network chunks is mis-parsed, so the answer garbles or
  the turn never ends. A long conversation sends more turns than the service accepts, and the
  reader gets a failure with no visible cause.
- **R5 — The reader is not told their question was reworded.** On the partisan path the answer
  addresses the neutral rewording. Without seeing it, the reader believes their own words were
  answered — the dishonesty the README says the product avoids by showing the rewording.

### Oracles

Component tests use Testing Library under jsdom (per-file environment; the suite's default stays
node). The one exception is AC1, which renders the real root layout to static markup with
`react-dom/server`, because a document element cannot be mounted inside a jsdom container and the
criterion is about the real layout, not a stand-in.

| AC | Oracle | Mechanism |
|---|---|---|
| 1 | Small | **R1.** The real root layout, with the screen inside it, rendered to static markup in three states: no question asked, a turn mid-answer, a turn ended. Red when the notice's text is missing from the element before the transcript or from the one after it, or when either renders empty. |
| 2 | manual | **R1.** The live checklist, in the in-app browser at desktop and phone widths, in the light and the dark scheme: a question whose answer is longer than the screen, looked at mid-stream and after. Red when either notice scrolls out of view, is clipped or covered by the transcript's own scrolling, or its text is hard to read against its background. The structure that prevents it: the notices are fixed siblings of the transcript, outside the region that scrolls. |
| 3 | Small | **R4.** The transcript rendered from a turn in the waiting state shows the waiting text, outside the answer's element, under its own visible label; rendered from the same turn after the answer's **first words**, the waiting text is gone — and it is still there after the verdict and the passages alone. Red when the text is absent before the first words, persists after them, goes with the first record, sits inside the answer's element, or has no label. Also: the new exchange is scrolled into view when it is sent. Red when nothing is scrolled, or the wrong element is. Its look (type, colour, spacing distinct from answer text) is on the live checklist. *Corrected at the build (2026-10-03): this row said "after its first record". The live run showed the verdict arriving at about one second and the first word after twenty; a wait that ended with the first record left the reader looking at nothing. The check was strengthened, not loosened — see the build note.* |
| 4 | Small | **R4.** Two checks. The stream reader is fed the bytes of a known event sequence split at arbitrary boundaries — inside a multi-byte character, and inside the blank line between records — and must yield exactly the events encoded, each passing the declared schema. Red when an event is dropped, merged, duplicated or mis-decoded. And the reducer, given token records one at a time, holds the answer text as their concatenation after each one with the turn still in progress. Red when text is dropped or reordered, or appears only after the end record. State is set once per record with no buffering; the progressive arrival itself is on the live checklist. |
| 5 | Small | **R3.** The transcript rendered from a turn holding passages from three documents: two of them share a title and differ in URL; one has two passages. Red when a document is listed twice or not at all, when the two same-titled documents collapse into one entry, when a link's target is not that document's URL, when a date is missing, or when any passage's text is absent. A second case renders two turns, the later one holding no passages yet. Red when the earlier turn's sources appear under the later one. |
| 6 | Small | **R5.** One transcript holding a partisan turn and then an in-bounds turn. Red when the rewording is absent or unlabelled, when the label appears more than once, or when it appears on the in-bounds turn. The rewording precedes the first turn's answer text. |
| 7 | Small | **R3.** A turn whose records are the deferral and an empty passage list. Red when the Sources heading text appears at all. |
| 8 | Small | **R2.** The records come from the real orchestrator run with fake collaborators — an answer whose quotation is refused — not from a hand-written copy, so the screen's handling of the notice is tested against the real emitter. Rendered: the notice in its own element with its own visible heading, outside the answer's element; the stopped marking as visible rendered text at the end of the answer text, before the notice. Red when the notice's text is inside the answer's element, when its heading is absent, or when the marking is absent, is not visible text, or is not at the answer's end. Spacing and colour are on the live checklist. |
| 9 | Small | **R2.** The same, for a run whose answer dies mid-stream and ends in a failure record. Red the same way. |
| 10 | Small | **R4.** Two cases through the reader and the reducer: a stream that ends after token records with no final record, and a record whose payload fails the declared schema. Rendered: the screen's own notice in its own element and the incomplete marking at the end of the answer text. Red when either case renders as done, or the notice or the marking is absent. |
| 11 | Small | **R4.** Testing Library mounts the screen with `fetch` replaced by a fake that holds a stream open. A question is sent; a second is submitted by pressing Enter in the input and by clicking the button. Red when the fake receives a second request, when the button is not disabled while the first turn is in progress, or when it stays disabled after the turn ends. One gate, `canSend`, feeds both the button and the handler. |
| 12 | Small | **R4.** The request builder, given more turns than the service accepts, produces a body that the service's own `chatRequestSchema` accepts — imported, so the limit comes from the authority rather than a copy — ending in the new question, with whole turns (question and answer together) dropped oldest first; a prior turn that ended in a notice contributes only its answer text. Red when the schema refuses the body, the new question is not last, the first message sent is an assistant's, two messages of one role are adjacent, a recent turn is dropped before an older one, or a notice's text appears in the body. |
| 13 | manual | **R1, R4.** The in-app browser at the phone preset: a grounded question and a partisan one. Red when a horizontal scrollbar appears or any content is clipped. |
| 14 | reviewer | The reviewer reads the README section against the screen's behaviour and the code. Red when it claims something the screen does not show, omits one of the listed items, or the *Screen copy* list and the registry disagree. |
| 15 | manual | A loop check, run once at the merge fork: the command above, with its output shown to Thomas. Red when any other path appears. |

### Live checklist (step 9)

Visual facts no markup test can see, observed in the in-app browser at the build step and recorded
in the build note, each with what was seen:

1. The two notices stay in view and legible — long answer, mid-stream and after, desktop and phone
   widths, light and dark schemes (AC2).
2. The waiting text looks like a system notice, not like the avatar's first sentence (AC3).
3. The answer arrives progressively, not in a few jumps (AC4).
4. The stop notice and the failure notice read as set apart — heading, spacing, colour (AC8, AC9).
5. Pressing Enter mid-answer sends nothing (AC11, also tested).
6. Phone width: no horizontal scrolling, nothing clipped (AC13).

### Proposed regressions (design review, round 23a18c3)

**Coverage check.** Every risk (R1–R5) and every test-judged criterion (AC1, AC3–AC12) received at
least one regression. AC2, AC13 (manual), AC14 (reviewer) and AC15 (manual) are judged by a person
and owe none. No gap. The reviewer also found the risk list complete as labelled: each risk reaches
a person and none is a scope statement. AC10 postdates the review (it is finding 3's fix); the
reviewer's fourth regression is the case it exists for and is paired with it below.

**A pattern across the list, stated once.** Six of the fourteen (rows 1, 2, 3, 9, 10, 11) attack the
same thing: a criterion whose *intent* is what a person sees, held by a test that can only see the
tree. The answer is in two parts, applied row by row: the markup facts that can be held (visible
text present, one element not inside another, a heading) are made explicit in the Small mechanism,
and the visual facts (spacing, colour, a region clipped by scrolling, the paint arriving
progressively) go on the live checklist above. The criteria the names refer to use the numbering
after approval.

| Names | Oracle | Regression | Disposition (2026-10-03) |
|---|---|---|---|
| R1 / AC1 | Small | The notice text is in the markup above and below the transcript in every state, but on the live page the transcript's scrolling container clips or covers one of them. Presence in the tree holds; a reader in some state never sees it. | **Accepted, as AC2's case.** No static test can see it. AC2's mechanism names it: a long answer, mid-stream and after, at both widths. The sketch states the structure that prevents it: the notices are fixed siblings of the transcript, outside the region that scrolls. |
| AC3 / R4 | Small | The waiting text is rendered in the same type and colour as answer text, so it reads as the avatar's first sentence. Present-then-absent holds; the reader cannot tell a system notice from the avatar's words. | **Amended.** AC3's test also asserts the waiting text is not inside the answer's element and carries its own visible label. Its look is on the live checklist. |
| AC4 / R4 | Small | The reducer holds the exact concatenation after every record, but the paint applies state in batches, so the reader sees the answer land in two or three jumps. | **Accepted, as the live observation.** State is set once per record with no buffering (sketch), and the progressive arrival is on the live checklist. |
| AC4 / R4 → AC10 | Small | The reader yields every encoded record, but treats the stream ending as the end of the turn — so a connection dropped mid-answer renders as a *complete* answer, re-hiding the truncation the always-terminates rule exists to expose. | **Accepted; became AC10.** A stream that ends without its final record, or a record that cannot be read, is incomplete, with a visible notice. Red when the turn renders as done. |
| AC5 / R3 | Small | Grouping de-duplicates by document *title*, so two documents sharing a title collapse into one entry and the second's passages render under the first's link. | **Accepted.** Grouping is by URL (sketch). The fixture holds two documents with one title and different URLs. Red when they collapse. |
| AC5 / R3 | Small | Each document is listed once, but only its first retrieved passage is rendered. | **Accepted.** The fixture holds two passages from one document; the test asserts each passage's text is present. |
| AC6 / R5 | Small | The rewording label is held in state keyed to the screen rather than the turn, so it leaks onto the next, in-bounds turn. Two separate renders both pass. | **Amended.** AC6 renders *one* transcript holding a partisan turn then an in-bounds turn, and asserts the label appears exactly once, under the first. |
| AC7 / R3 | Small | The Sources list is suppressed on a deferral, but an empty Sources *heading* still renders, implying sources failed to load on the one answer that means "the record does not answer this". | **Accepted.** Red when the Sources heading text appears at all. |
| AC8 / R2 | Small | The turn is "marked as stopped" only in machine-readable form — a state flag, an attribute, hidden text — with nothing a sighted reader sees. | **Accepted.** The marking is asserted as visible rendered text, never an attribute. |
| AC8 / R2 | Small | The notice is a separate element but styled like the answer and placed flush against its last line, so it reads as the concluding paragraph — the 2026-09-28 run-on one level down. | **Amended.** The test asserts the notice carries its own visible heading text, distinct from the answer. Its spacing and colour are on the live checklist. |
| AC9 / R2 | Small | On a failure the notice is set apart, but the partial answer keeps its dangling half-sentence with no visible sign it was cut; the "incomplete" marking sits only on the notice, which a reader can scroll past. | **Accepted.** The incomplete marking is visible text placed at the end of the answer text itself, before the notice — for AC8, AC9 and AC10 alike. The test asserts its position. |
| AC11 / R4 | Small | The send *button* is disabled mid-answer, but Enter in the input still submits, so a second question dispatches. | **Amended.** One gate — a pure `canSend(turns)` — feeds both the button's disabled state and the submit handler's early return, and the handler is the form's single submit path. With Testing Library adopted (B2), AC11 tests both the Enter key and the click against a fake `fetch`, not only the rendered state. |
| AC12 / R4 | Small | Trimming drops the oldest *messages* by count, so the cut severs a question from its answer; the schema accepts it (it requires no alternation), and the model receives an orphaned reply. | **Accepted.** Trimming drops whole turns (question and answer together), oldest first. Red when the first message sent is an assistant's, or two of one role are adjacent. |
| AC12 / R4 | Small | A prior assistant turn's content is sent as everything that rendered — including a notice — so the notice's words enter the next answer's context as if the avatar had said them. | **Accepted.** A prior turn contributes its answer text and never a notice; the test's prior turn ends in a notice and asserts the body carries only the answer text. |

## Loop record

- frame/6 — ran (codex on kimi-latest, 4 findings, 14 regressions) → reviews/chat-screen.design.23a18c3.json
- frame/9 — demonstrated red: every ratified regression on a sized criterion (12 cases over AC3, AC5–AC12) plus 4 builder's-own cases for checks added at the build (AC1, AC3, AC4 ×2), each applied on a clean tree, red on its named test, and reverted; the two ratified entries that are live observations (R1/AC1, AC4's paint) were observed and are recorded in the build note; build commits 3809f72 and c7a5657
- review/6 — ran (codex on glm-latest, 3 findings) → reviews/chat-screen.approach.d2e7d11.json
- review/8 — not yet reached
- close/3b — not yet reached
- close/4 — not yet reached

## Open questions

All decided at the 2026-10-03 consult.

1. **Scope: the thin first version, confirmed?** **Decided: (a).** (a) As specified above. (b) The
   whole of User Story 4 now, with inline "Verify Source" badges and the side panel they open.

2. **How does the screen tell a stop notice from answer text?** Today the provenance notice arrives
   as one more `streamed_tokens` record, indistinguishable on the wire from the answer.
   **Decided: C**, the design review's alternative.
   - **A — an additive marker on the record.** `streamed_tokens` gains an optional `notice` field,
     set by the orchestrator where it emits the notice. *Costs:* edits the most-reviewed code in the
     repository; a one-way door on the public record contract. *Gives up:* safety by default — a
     consumer that ignores the optional field shows the notice as answer text, and nothing fails
     (finding 1: "fails open").
   - **B — exact-text match on the client.** The screen compares each record's text to
     `PROVENANCE_NOTICE`. *Costs:* nothing on the server. *Gives up:* the distinction rests on a
     convention nothing declares; a server-side rewording silently brings R2 back.
   - **C — the notice is its own record kind.** `{ type: "notice", kind: "provenance", text }`,
     emitted by the orchestrator's `stop` in place of the token record. *Costs:* the same server
     edit as A, plus the tests that today look for the notice among the token records, and a
     README row; the same one-way door. *Gives up:* nothing visible. An exhaustive client fails
     the typecheck until it handles the new kind; a non-exhaustive one shows nothing rather than
     the wrong thing.

3. **How are the components tested?** **Decided: B** — Thomas's choice over the recommendation.
   - **A — static render plus pure functions, no new dependency.** *Costs:* nothing clicks
     anything in a test; the live wiring is seen, not asserted. *Gives up:* automated interaction
     tests.
   - **B — a browser-like test environment.** `jsdom`, `@testing-library/react` and its
     `@testing-library/dom` peer as development dependencies; component tests declare the jsdom
     environment per file, so the suite's default stays node. *Costs:* three development
     dependencies and a second environment to keep working; the pattern every later UI test
     copies. *Gives up:* nothing in coverage. AC11's keyboard path becomes a real test because of
     it.

4. **The specification's "unified system footer" under every response.** **Decided: (b).** The
   Sources list is the response's footer; a deferral ends in nothing more; the persistent bottom
   notice carries the disclaimer. (a), a literal fixed line under every response, would put the
   same sentence on screen three times.

5. **One question at a time, or a conversation?** **Decided: (a), a conversation.** Earlier turns
   are sent as history, trimmed to the service's limit. The README's accepted hole — a trap
   assembled across turns passes classification, which judges the latest question alone — stays
   open on the screen as it is on the service.

6. **Commit `.claude/launch.json`?** **Decided: (a), commit it.** It is the file that lets the Claude
   desktop app's in-app browser start the dev server, which is how the manual oracles are driven.

7. **Should the server also send an early "working" record** (FEAT-4's second half)? **Decided:
   (a), no.** The screen's waiting state needs nothing from the server, and the first record
   already marks the moment the wait ends. (b) is filed only if a second client ever needs it.

8. **The notice's wording.** **Approved as proposed:** *"V-Tina is a virtual AI avatar. It is not
   Governor Kotek, not a person, and not an official State of Oregon service. It quotes Oregon's
   official record; check every claim against the sources it links."*

## Design sketch — HOW

**One pure module, thin components, the layout owns the notice, one new record kind.** Updated at
approval to the ratified shape; the design review judged the earlier sketch (its artifact holds
that text's substance).

- **`src/lib/chat/events.ts`** — the union gains a member:
  `{ type: "notice", kind: NOTICE_KINDS, text }` with `NOTICE_KINDS = ["provenance"] as const`,
  declared and exported like `FAILURE_REASONS`. **`src/lib/chat/orchestrate.ts`**'s `stop` yields
  it in place of the token record carrying `PROVENANCE_NOTICE`; nothing else there changes. The
  text is unchanged. The README's record table gains the row. The tests that today find the notice
  among the token records (`__tests__/chat-orchestrate.test.ts`, `__tests__/answer-screen.test.ts`)
  read the new kind instead.
- **`src/lib/chat/client.ts`** — pure functions, no React, no DOM:
  - `readChatStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent>` — a
    `TextDecoder` in streaming mode, a buffer carried across chunks, records split at the SSE blank
    line, `data:` lines parsed, and each payload validated with `chatStreamEventSchema` — the
    README's instruction, and the same object the server derives its type from, so there is no
    second parser. A payload that fails the schema throws, which the screen turns into the
    incomplete state and its own notice (AC10). *Considered and rejected:* `eventsource-parser`,
    the de-facto library for `fetch`-streamed SSE. The framing here is about twenty lines; the
    substantive risk is payload validation, which zod owns either way; and AC4's chunk-boundary
    test covers the framing directly. The server side made the same call for its half
    (`reviews/chat-safety-routing.md`, Open question 5). What would change this: a second framing
    edge case the test does not already cover.
  - `Turn` — the screen's state for one exchange: the question, a status (`waiting`, `answering`,
    `done`, `incomplete`), the rewording if any, the answer text, the sources, and an optional
    notice — `provenance` (the server's `notice` record), `failure` (the server's `error` record)
    or `connection` (the screen's own: the stream ended without its final record, or a record
    could not be read) — with its text. `reduceTurn(turn, event)` is one pure function over the
    event union; the union has no catch-all member, so a new record kind fails the typecheck here
    rather than falling through. `endTurn(turn)` closes a turn whose stream ended: `done` only if
    its final record arrived, otherwise `incomplete` with the connection notice.
  - `sourcesOf(chunks)` — groups passages by document URL (never title), keeping title, date and
    kind, passages in retrieval order.
  - `buildRequest(turns, question)` — the request body: each prior turn contributes its question
    and its answer text, never a notice; a prior turn with no answer text is left out entirely so
    the roles alternate; whole turns are dropped oldest first until the body fits
    `MAX_HISTORY_MESSAGES`.
  - `canSend(turns)` — false while any turn is in progress. The one gate for the button and the
    submit handler.
- **`src/lib/copy.ts`** — the screen copy registry: `AVATAR_NOTICE`, `WAITING_NOTICE`,
  `CONNECTION_NOTICE`, `REWORDING_LABEL`, `SOURCES_HEADING`, `INCOMPLETE_MARK`, `NOTICE_HEADINGS`
  (one per notice kind), and the input's labels, each a named constant, with `SCREEN_COPY` listing
  their names. The README's *Screen copy* section lists the same names; `__tests__/readme-copy.test.ts`
  holds the two equal in both directions and requires every export of the module to be in the
  list — the partition `prompts.ts` already keeps. Kept out of `prompts.ts` so the browser bundle
  does not carry the model prompts and the quotation grammar that module imports (finding 2,
  option b).
- **`src/components/`**: `AvatarNotice` (the disclaimer; the layout places it once at the top and
  once at the bottom, each fixed in view as a sibling of the scrolling transcript, never inside
  it); `ChatScreen` (`"use client"`: `useState<Turn[]>`, a form whose single `onSubmit` is the
  path for the button and the Enter key, guarded by `canSend`; the handler `fetch`es
  `POST /api/chat`, iterates `readChatStream` and sets state once per record with no buffering;
  one `AbortController` per turn, aborted on unmount so the server stops work on disconnect; a
  thrown read, a non-2xx response or the stream ending early goes through `endTurn`); and the
  presentational `Transcript`, `Sources`, `Notice` — props in, markup out. `ChatScreen` delegates
  all markup to `Transcript`, so every state the tests need is reachable through props.
- **`src/app/layout.tsx`** wraps `children` in the two notices; **`src/app/page.tsx`** renders
  `ChatScreen`. `globals.css` gains only what Tailwind utilities cannot express.
- **Styling**: Tailwind utilities already configured; explicit colour tokens for the notice in
  both colour schemes. No component library.
- **Tests**: `__tests__/chat-client.test.ts` (reader, reducer, request builder, grouping, the
  gate; node environment), `__tests__/chat-screen.test.tsx` (Testing Library under a per-file
  jsdom environment; AC1's static render of the real layout lives here too),
  `__tests__/readme-copy.test.ts`, and the orchestrator and stream tests extended for the `notice`
  record. `vitest.config.mts`'s `include` widens to admit `.test.tsx`.
- **`package.json`**: `jsdom`, `@testing-library/react`, `@testing-library/dom` as development
  dependencies. Nothing new at runtime.

**Cross-cutting pattern, ratified:** pure state reducers, presentational components, and Testing
Library under jsdom for component tests. Every later screen copies it.

## Codex (kimi-latest) design review (2026-10-03, round 23a18c3)

Artifact: `reviews/chat-screen.design.23a18c3.json`. The reviewer ran 6 read-only commands over the
spec, the surrounding code and the dependency manifest.

**Verdict.** "The shape is sound and modern: one pure client module … that reuses the server's own
zod schema as the parse authority, thin presentational components tested by static render,
cancellation threaded through `AbortController` exactly as the server threads `request.signal`, and
no new dependencies. That is the design I would build from this spec." Two decisions are singled out
for Thomas: how the stop notice travels on the wire (finding 1), and where screen copy lives
(finding 2). On the Regressions rule: the risk list is complete as labelled, the four person-judged
criteria owe no running test, and every named oracle can fail.

### IMPORTANT

**1. The provenance marker is an optional field that fails open, in a codebase whose declared idiom
is exhaustive narrowing** — *one-way · nonstandard*. Locus: Open question 2, option A.
*Claim.* Option A's justification, "every existing consumer still works", protects nobody: this
screen is the first client. The cost is specific: the answer-or-notice distinction becomes a
convention inside one record kind, so any consumer that reads `text` and ignores the optional field
renders the stop as the answer's last sentence — the R2 failure seen live on 2026-09-28, silently
re-enabled with every test green. The repository's own wire idiom (`src/lib/chat/events.ts`'s
header: a discriminated union with no catch-all, so a new kind fails the typecheck rather than
falling through) argues the other way; the sketch's own `reduceTurn` relies on that property.
*Alternative.* A distinct member of the union — `{ type: "notice", kind: "provenance", text }` —
emitted by the orchestrator's `stop` in place of the marked token record. An exhaustive client fails
the typecheck until it handles it; a non-exhaustive one renders nothing rather than misattributing a
safety notice to the record.
*Win.* R2's failure becomes unrepresentable rather than convention-guarded; the guard moves to the
compiler. One optional field and one conditional branch removed.

**2. Screen copy in `src/components/copy.ts` splits the reader-facing prose authority away from its
drift guard** — *two-way · nonstandard*. Locus: the sketch's *Screen copy* bullet.
*Claim.* `src/lib/prompts.ts` declares itself the home of "prose a member of the public reads",
partitions it, and a test holds the README's list equal to the code. The avatar notice is the
product's first safety rule and its wording a ratified product decision (Open question 8), yet the
sketch places it in a new module no registry or drift test covers. The sketch's reason — the module
holds what the service *runs on* — describes what it emits, not what it declares.
*Alternative.* The notice, the waiting text and the labels as named constants in `prompts.ts`,
added to `READER_FACING_PROMPTS` — or to a parallel declared list the same README-equality test
pattern covers. `copy.ts` disappears.
*Win.* One authority for every word the public reads; the safety notice's wording under the
existing drift test instead of being the one reader-facing text nothing watches.

### QUESTION

**3. What does the reader see when client-side parsing fails?** — *two-way · standard*. Locus:
the `readChatStream` bullet.
*Claim.* The sketch says a payload failing the schema "ends the turn as incomplete rather than being
skipped silently" — the right error model — but never says what is *shown*. AC9's notice is a
server record; a client-side failure has no record to display, and `incomplete` has no stated
visible consequence or oracle.
*Alternative.* State the copy a client-side failure shows (the same set-apart notice and incomplete
marking as AC9, with its own sentence in the reader-facing registry) and add a row feeding a
malformed payload to the reader and asserting the rendered notice.
*Win.* The client's only owned failure path gets the same visible treatment as the server's, and
"rather than skipped silently" becomes checkable.

### NIT

**4. Hand-rolled SSE framing reinvents what `eventsource-parser` already does** — *two-way ·
standard*. Locus: the `readChatStream` bullet.
*Claim.* Buffer across chunks, split on the blank line, take `data:` lines — the exact job of
`eventsource-parser`, the de-facto standard for `fetch`-streamed SSE. The reviewer would keep the
rejection (about twenty lines; the substantive risk is payload validation, which zod owns either
way; AC4's chunk-boundary oracle covers the framing) but the candidate should be named so the choice
is a trade, as the server side's SSE-without-a-library decision is recorded
(`reviews/chat-safety-routing.md`, Open question 5).
*Alternative.* Take the dependency, or record the rejection in one sentence.
*Win.* A documented trade against a named candidate; if a second framing edge case appears, "what
would change this" is already written.

## Build note (2026-10-03)

**Commits.** `3809f72` (the build) and `c7a5657` (three fixes the live run found, below). **Gate:**
passed — typecheck, lint (the one warning is pre-existing, in `__tests__/supabase.test.ts`), 426
tests in 30 files. Three test packages added as development dependencies: `jsdom` 30.1.1,
`@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2.

### Where each criterion lives

| AC | Files |
|---|---|
| 1, 2 | `src/app/layout.tsx`, `src/components/AvatarNotice.tsx`, `src/lib/copy.ts` (`AVATAR_NOTICE`); test `__tests__/chat-screen.test.tsx` (AC1), `__tests__/readme-copy.test.ts` (the notice's three facts) |
| 3 | `src/lib/chat/client.ts` (`reduceTurn`: `waiting` until the first words), `src/components/Transcript.tsx` (the waiting line), `src/components/ChatScreen.tsx` (scroll into view); tests `__tests__/chat-screen.test.tsx`, `__tests__/chat-client.test.ts` |
| 4 | `src/lib/chat/client.ts` (`readChatStream`, `reduceTurn`), `src/components/ChatScreen.tsx` (one state update per record); test `__tests__/chat-client.test.ts` |
| 5, 7 | `src/lib/chat/client.ts` (`sourcesOf`), `src/components/Sources.tsx`, `src/components/Transcript.tsx` (shown once the answer has begun); test `__tests__/chat-screen.test.tsx` |
| 6 | `src/components/Transcript.tsx` (the rewording line); test `__tests__/chat-screen.test.tsx` |
| 8 | `src/lib/chat/events.ts` (`NOTICE_KINDS`, the `notice` member), `src/lib/chat/orchestrate.ts` (`stop`), `src/lib/chat/client.ts` (`reduceTurn`), `src/components/Notice.tsx`, `src/components/Transcript.tsx` (`INCOMPLETE_MARK`); tests `__tests__/chat-screen.test.tsx`, `__tests__/chat-orchestrate.test.ts`, `__tests__/answer-screen.test.ts`, `__tests__/chat-stream.test.ts` |
| 9, 10 | `src/lib/chat/client.ts` (`reduceTurn` on `error`, `endTurn`, the reader's refusal of an undeclared record), `src/components/ChatScreen.tsx` (`endTurn` in `finally`), `src/lib/copy.ts` (`CONNECTION_NOTICE`); tests `__tests__/chat-client.test.ts`, `__tests__/chat-screen.test.tsx` |
| 11 | `src/lib/chat/client.ts` (`canSend`), `src/components/ChatScreen.tsx` (the form's single submit path); tests `__tests__/chat-client.test.ts`, `__tests__/chat-screen.test.tsx` |
| 12 | `src/lib/chat/client.ts` (`buildRequest`); test `__tests__/chat-client.test.ts` against `chatRequestSchema` |
| 13 | Tailwind utilities in the components; the live checklist |
| 14 | `README.md` (*Status*, *Repository map*, the `notice` row, *The chat screen*, *Screen copy*); test `__tests__/readme-copy.test.ts` |
| 15 | `vitest.config.mts`, `package.json`, `package-lock.json`, `.claude/launch.json`; the loop check at the merge fork |

### Built as approved, with three things the live run changed

The shape is the ratified sketch: the `notice` record kind in `events.ts`, emitted by the
orchestrator's `stop`; the pure module `src/lib/chat/client.ts`; the copy registry
`src/lib/copy.ts` with its README list and equality test; `AvatarNotice`, `ChatScreen`,
`Transcript`, `Sources`, `Notice`; Testing Library under a per-file jsdom environment, with AC1's
static render of the real layout as the one exception. Driving the screen in the in-app browser
changed three things, all two-way, all recorded here rather than silently:

1. **The waiting line lasts until the answer's first words, not its first record.** The verdict and
   the passages arrived at about one second; the answering model's first word arrived after twenty
   (its time to first token is the README's *Models* section). With the wait ending at the first
   record, the reader looked at a Sources list and no answer for nineteen seconds — R4's failure in
   a window the oracle had not named. The reducer now keeps `waiting` through `safety_status` and
   `retrieved_chunks`; AC3's test holds that, and its oracle row is corrected above. AC3's text
   ("until the first part of the response arrives") is read as the first part the reader can see;
   a record is not that.
2. **The Sources list is not shown before the answer has begun.** Same cause: the passages arrive
   long before the words, and AC5 says the list *follows* the answer. `Transcript` renders it only
   once the answer has text or the turn has ended.
3. **The new exchange is scrolled into view when it is sent.** The second question of a conversation
   rendered below the fold, behind the sticky input, and nothing visibly happened. `ChatScreen`
   scrolls the newest exchange to the top of the view when one is added; a test observes the call
   on the right element (jsdom has no `scrollIntoView`, so the effect itself is seen live).

### Demonstrate-red

Each case applied on a clean tree (checked by path before each), the named test run, the change
reverted; the tree was clean after the last. Every case went red on exactly the test its row names.

| Regression (ratified list) | Applied as | Red on |
|---|---|---|
| AC3 / R4 — waiting text styled as answer text | The waiting line's label removed | AC3, all three tests |
| AC4 → AC10 — the stream ending read as done | `endTurn` marks a cut stream `done` | AC10: both client cases, both mounted-screen cases |
| AC5 / R3 — grouping by title | `sourcesOf` keyed by title | AC5 (client) and AC5 (screen): the amended order's passages collapsed into the original's entry |
| AC5 / R3 — only the first passage | `Sources` renders `passages.slice(0, 1)` | AC5 (screen): "the second passage of the order" absent |
| AC6 / R5 — rewording held screen-wide | `Transcript` reads the rewording from the first turn for every turn | AC6: the label appeared twice |
| AC7 / R3 — an empty Sources heading | `Sources` renders without its empty guard | AC7 |
| AC8 / R2 — the marking machine-readable only | The mark replaced by a `data-incomplete` attribute | AC8, AC9 and both AC10 screen cases |
| AC8 / R2 — a notice without its own heading | `Notice` renders no heading | AC8 |
| AC9 / R2 — the mark only on the notice | The mark moved from the answer's end into `Notice` | AC9 |
| AC11 / R4 — the handler ungated | `onSubmit` sends whenever the box is non-empty; the button still disabled | AC11: Enter mid-answer sent a second request |
| AC12 / R4 — trimming by message count | The history flattened, then the oldest messages dropped | AC12: an assistant message at the head |
| AC12 / R4 — a notice's text in the history | A prior turn's content is its answer plus its notice | AC12: the provenance notice's text in the body |
| **Builder's own, for checks added at the build** | | |
| AC1 — the test can go red | The bottom notice removed from the layout | AC1, all three states |
| AC3 — the wait ends with the first record (the state the live run found) | The reducer's `safety_status` case sets `answering` | AC3 "stays through the verdict"; the client's "verdict" case |
| AC4 — the reader drops a partial record at a chunk end | The buffer cleared after every read | AC4 at one byte per chunk |
| AC4 — the reducer replaces instead of appending | `answer: event.text` | AC4 concatenation |

**Not demonstrated, by decision:** R1/AC1's regression (a notice clipped on the live page) is AC2's
manual case, and AC4's paint-in-batches regression is the live observation; both are in the
checklist below. AC2, AC13 (manual), AC14 (reviewer) and AC15 (manual) are judged by a person.

### Live checklist — what was seen in the in-app browser

Dev server `npm run dev`, desktop width and the 375×812 phone preset, dark and light schemes.

1. **Notices stay in view and legible** — a long grounded answer (about 25 lines) scrolled from top to
   bottom at desktop width: both bars fixed, the transcript scrolling between them, the input
   sticky above the bottom bar. Dark scheme: white on black. Light: black on white. Phone: the same,
   measured — each bar 96 px tall at 375 px wide, the top one at 0–96 and the bottom at 716–812.
   **Stated cost:** on a phone the two bars take 192 of 812 px, a quarter of the screen, for the
   wording Thomas approved. The second pass can shorten the phone wording if that is too much; this
   story does not.
2. **The waiting line reads as the screen's status** — dashed border, italic, its label "Please
   wait." in upright type, visibly unlike the answer's prose below the "V-Tina's answer" label.
   Seen for the full nineteen-second window on the housing question after fix 1.
3. **The answer arrives progressively** — two screenshots three seconds apart during the housing
   answer: four lines, then twenty. The granularity is the network chunk, which is where the server
   releases text; nothing on the screen buffers.
4. **The stop and failure notices** — **not observed live.** The housing question that stopped on
   2026-09-28 completed on both of today's runs, and nothing failed. Their rendering is held by the
   mounted tests against the real orchestrator (AC8, AC9) and the fake service (AC10); their look
   (amber block, left rule, its own heading, the mark in amber at the answer's end) was checked by
   rendering the same fixtures and reading the markup, not on a live stop. Recorded as the gap it is.
5. **Enter mid-answer sends nothing** — a second question typed and entered while the partisan
   answer streamed: it stayed in the box, the Ask button greyed, no new exchange; when the answer
   ended the button returned with the question still waiting.
6. **Phone width** — a grounded question asked at 375 px: no horizontal scrollbar; measured
   `scrollWidth` equal to `clientWidth` (375) for the document and the scrolling region, empty and
   with a full answer; nothing clipped.

**Also seen.** The rewording line on the partisan exchange sits between the question and the
answer, labelled, in smaller type. The Sources list under the partisan answer grouped three
passages under EO 23-02 ("Show the passage (1 of 3)…"), with EO 23-04 and EO 24-02 as their own
entries. Next.js's development badge overlaps the bottom-left of the bottom notice; it is the dev
server's overlay, not the page.

**One finding for Thomas, not this story.** "What help is there for people with mental illness?"
— a question the routing measurement counts as answerable, 20 of 20 — got the deferral. Asked of
the endpoint twice: classified `IN-BOUNDS` both times; retrieval returned **no passage above the
threshold**. Not classifier drift: the corpus and the 0.73 threshold (README, *Retrieval
threshold*, which already calls the margin thin). The routing measurement measures routing only;
nothing measures whether an in-bounds question finds anything. The screen shows the deferral
correctly; whether to measure retrieval coverage is a backlog decision.

## Design decisions (2026-10-03)

Thomas's dispositions at the frame consult, binding on the build.

| Item | Decision | What it binds |
|---|---|---|
| Scope (A) | **(a), the thin first version.** | The criteria above; badges and the side panel are the second pass. |
| Finding 1 — how the stop notice travels (B1) | **Fix: option C**, the notice as its own record kind. | `events.ts` gains the `notice` member; `orchestrate.ts`'s `stop` emits it; the README's record table gains the row; the reducer handles it exhaustively. A one-way door, ratified. |
| How screens are tested (B2) | **Option B: Testing Library under jsdom.** Thomas's choice over the recommendation of no new test dependency. | `jsdom`, `@testing-library/react`, `@testing-library/dom` as development dependencies; per-file environment; AC11 tests the keyboard path for real. The cross-cutting pattern every later screen copies. AC1 alone uses the static render of the real layout, for the reason the Oracles section states. |
| Finding 2 — where screen copy lives (C1) | **Fix, amended: option (b)**, a declared registry in `src/lib/copy.ts` held equal to a README list by the same test pattern. | Not in `prompts.ts`, so the browser bundle does not carry the model prompts and the quotation grammar. |
| Finding 3 — a failure the screen itself meets (C2) | **Fix.** | AC10, the `connection` notice kind, `endTurn`, and the `CONNECTION_NOTICE` copy. |
| Finding 4 — the rejected parsing library (C3) | **Accept: record it.** | The sentence in the sketch's `readChatStream` bullet. No dependency. |
| Risk list (D) | **Ratified as listed.** | R1–R5. |
| Regressions (D) | **Ten accepted, four amended, none rejected**, as the table's Disposition column records. | The amended mechanisms of AC3, AC6, AC8 and AC11; the live checklist. |
| Open questions 4–8 (E) | **The recommended options:** the Sources list is the footer; a conversation; commit `.claude/launch.json`; no "working" record; the notice wording as proposed. | As recorded under *Open questions*. |

## Codex (glm-latest) approach review (2026-10-03, base main, HEAD d2e7d11)

Artifact: `reviews/chat-screen.approach.d2e7d11.json`. The reviewer ran 20 read-only commands over
the spec, the whole changed files and the dependency manifest. PR #10's check was green on this
HEAD.

**Verdict.** "If I built this from the approved spec, I would keep the ratified shape: a pure
client module validated by the shared zod event schema, thin presentational components, no runtime
dependency, and an AbortController threaded to the endpoint. I would not ship the history builder
as-is, because it enforces only the message-count half of the request schema and can therefore
turn a normal long answer into a refused follow-up. I would also close the fetch when a
client-side failure ends a turn, and use real landmark semantics for the repeated question and
answer labels."

### IMPORTANT

**1. History trimming enforces the message count but not the per-message length limit** —
*two-way · kludgy*. Locus: `src/lib/chat/client.ts`, `buildRequest`.
*Claim.* The loop trims only while the message count exceeds `MAX_HISTORY_MESSAGES`, but
`chatRequestSchema` also limits every message to 2000 characters, assistant messages included. An
answer may run to several thousand characters, so the follow-up after one long answer carries an
assistant message the service refuses with 400 — and the screen then shows the connection notice
for the reader's next question. That misses "within the limits the service accepts" and AC12's
claim that the schema accepts the built body; the test used short answers and could not see it.
*Alternative.* Let the request schema be the single authority: build from whole turns, validate
with `chatRequestSchema.safeParse`, and drop or shorten until it accepts; or apply the per-message
limit, imported from the authority, to the prior answers before the count loop.
*Win.* One schema owns every acceptance limit; a normal long answer no longer turns the next
question into a connection notice.

**2. A locally unreadable stream is shown as lost but never disconnected** — *two-way ·
nonstandard*. Locus: `src/components/ChatScreen.tsx`, the submit handler; `src/lib/chat/client.ts`,
`readChatStream`.
*Claim.* On a malformed record `readChatStream` throws and releases its reader lock but does not
cancel the body; `ChatScreen` catches, marks the turn incomplete, and never aborts the request —
the only abort is unmount. So the one failure path the client owns can end the exchange on screen
while the fetch stays open and the server keeps generating for nobody, which undercuts the
cancellation design the rest of the screen follows.
*Alternative.* Make cancellation part of every terminal path: after `endTurn` on a client-side
failure, abort the controller (or cancel the body); keep the unmount abort and its
"do not update after an unmount" rule separate.
*Win.* One abort call closes the only client-owned path that can orphan model work and billing.

**3. Question and answer labels are `aria-label`s on generic `div`s** — *two-way · nonstandard*.
Locus: `src/components/Transcript.tsx`, the question and answer containers.
*Claim.* The containers are generic `div`s carrying `aria-label`, with the visible labels in
separate, unassociated `p` elements. Generic roles do not reliably expose an accessible name, so a
screen-reader user may not hear where the question ends and the answer begins. Testing Library
finds the attribute, so the tests pass while the who-is-speaking distinction is weaker for
non-visual readers.
*Alternative.* `section` elements (landmark regions) labelled by their visible label through
`aria-labelledby`, with ids derived per turn; keep the visible labels exactly as they are.
*Win.* The labels become regions assistive technology actually exposes, and the oracle checks a
name the browser exposes; a few lines, no dependency.

## Decisions (2026-10-04, round d2e7d11)

**Approach pass.** Thomas: "fix all three, proceed". None is a redesign, so the correctness pass
runs in the same round and the fixes land at `/close`.

| Finding | Decision | What `/close` applies |
|---|---|---|
| 1 — history trimmed by count, not length | **Fix.** | Prior answers shortened to the service's per-message limit (imported from `request.ts`, not copied); the built body validated with `chatRequestSchema` before sending, dropping the oldest turn while it refuses; a test with an answer longer than the limit. |
| 2 — a client-side failure leaves the request open | **Fix.** | The request aborted on the client-side failure path, after `endTurn`; the unmount abort and its no-update rule unchanged; the AC10 test asserts the request's signal is aborted. |
| 3 — labels on generic containers | **Fix.** | The question and answer containers become labelled regions tied to their visible labels (`aria-labelledby`, ids per turn); the tests query regions by name. |
