# Backlog

## Open

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

### FEAT-4 — Tell the reader an answer can take a while

**Want (Thomas, 2026-09-24).** A reader is told that an answer can take a while to begin.

**Why it is needed.** Classification may now take up to 10 seconds before anything streams (raised
from 3 s in `reviews/oregon-default-jurisdiction.md`, because a missed deadline turns the reader
away). Silence that long reads as a broken page.

**Shape to consider — not decided.** A notice or progress indicator on the chat screen, shown from
the moment a question is sent until the first record arrives. The screen is User Story 4 and does not
exist yet, so this is a requirement on that story. Whether the stream should also send an early
"working" record is part of the same decision.

**Sequencing.** With or after User Story 4's chat screen.

### FEAT-5 — Consider caching answers to common questions

**Want (Thomas, 2026-09-24).** Contemplate caching responses for common questions, so a frequently
asked question does not pay the classification and answer time every time.

**Shape to consider — not decided.** Two levels, with different costs. Caching the classifier's
verdict by exact question text removes the slowest, least predictable step for repeats and changes
nothing a reader sees. Caching whole answers saves more but is harder to keep honest: an answer must
be invalidated when the corpus changes, it freezes one sample of a varying model, and it must still
pass the quotation screen as served.

**Owed by the story that builds it.** A cache stores the public's questions, which is the privacy
decision deliberately left open (`reviews/answer-voice-screen.md` → Non-goals, the audit-log stub;
FEAT-3 keeps the two apart). Decide that first. Measure how often questions actually repeat before
building: exact-text repeats may be rare. A cached verdict also sidesteps the drift the routing
measurement watches for, so the cache's lifetime must be shorter than the re-measure interval (OPS-3).

**Sequencing.** After FEAT-4 and User Story 4; there are no readers to repeat questions yet.

### OPS-3 — Re-run the classifier measurement on a schedule

**Want (Thomas, 2026-09-24).** The routing measurement FEAT-1 built runs on a schedule as well as by
hand, so drift with no code change is seen.

**Why it is needed.** The classifier's verdict on the same question has changed within a day with no
code change (`reviews/backlog-oregon-context.md`). The gate catches a changed instruction, model or
question set; it cannot catch the provider's model behaving differently under the same name.

**Shape to consider — not decided.** A scheduled job that runs `npm run eval:classifier` and reports
a failed receipt. It needs a hosted runner holding the Fireworks key, which this repository does not
have, and a decision on where a scheduled run's receipt is committed.

**Sequencing.** After FEAT-1 (`reviews/oregon-default-jurisdiction.md`) merges.

### OPS-4 — Reword the text that still promises tests deleted on 2026-10-20

**Want (Thomas, 2026-10-20).** The test cleanup that day (the `delete:` merges from
`delete-doc-sync-tests` to `delete-dead-code`) removed tests that comments and README sentences
still name: "a test holds the two equal". Those sentences now describe checks that do not exist.
Reword each to say what is true, and remove the leftovers the cleanup could not remove by deletion
alone.

**Why it needs a story.** Every fix edits a line that stays, so none of it fits the deletion quick
route.

**What it covers.**
- Sentences that promise a deleted test: the comments on `EMBEDDING_DIMENSIONS` in
  `src/lib/embeddings.ts`, on the classification deadline in `src/lib/safety.ts`, on
  `DEFAULT_MATCH_THRESHOLD` in `src/lib/supabase.ts`, on `REQUIRED_ENV_KEYS` in `src/lib/env.ts`, on
  `POLICY_PILLARS` in `src/lib/ingest/pillars.ts` and on `ALLOWED_SOURCE_HOSTS` in
  `src/lib/ingest/metadata.ts`; and the README's "Policy pillars", "Retrieval threshold",
  "Classification latency" and "Ingesting the corpus" sections, plus the repository map's "nothing is
  provisional now".
- **Absorbs OPS-1.** The same `pillars.ts` comment calls the pillars "Governor Kotek's three stated
  priorities". Name the kind instead — "Governor Kotek's stated priorities" — and leave the list as
  the only statement of how many there are (`workflow-protocol.md` → *Counts are copies*).
- Import names left unused on lines that keep others (lint warnings, not failures):
  `SAFETY_CLASSIFICATIONS` in `__tests__/chat-orchestrate.test.ts`; `nodeEnvSchema` and
  `EnvValidationError` in `__tests__/chat-route.test.ts`; `SSE_CONTENT_TYPE` and `encodeEvent` in
  `__tests__/chat-stream.test.ts`; `vi` in `__tests__/fireworks.test.ts`.
- Code nothing uses that needs an edit to remove: the `pillar` parameter of `queryPolicyChunks` (its
  one caller passes `undefined`); the Edge branch of `register()` in `src/instrumentation.ts`; the
  `onCleanupError` option of `createChatStream`; the `maxAttempts` option of
  `createFireworksEmbedder` and its `EMBEDDING_MAX_ATTEMPTS` alias; and `FRONTMATTER_KEYS` in
  `src/lib/ingest/parse.ts`, which only tests read.

**Not in scope.** The two comments in the applied SQL migration that name a unit test stay as they
are: an applied migration is not edited.

**Sequencing.** Independent of the FEAT items.

## Done

- **FEAT-1** — Read a question that names no jurisdiction as being about Oregon — PR #8 / merge: oregon-default-jurisdiction (story: `reviews/oregon-default-jurisdiction.md`).
- **FEAT-3** — Keep enough of a refused quotation to diagnose it — PR #9 / merge: refusal-diagnostics (story: `reviews/refusal-diagnostics.md`).

## Closed — won't do

- **OPS-1** — The policy-pillars comment still counts the pillars — folded into OPS-4, which edits the same comment (Thomas, 2026-10-20).
- **OPS-2** — Catch counts in living text mechanically — closed 2026-10-20 (Thomas): it governs how this repository writes its own documentation, and no reader has met a stale count.
- **AAR-1** — Recover a partial correctness refusal by re-running only the refused critic — closed 2026-10-20 (Thomas): its subject is the review workflow, not V-Tina. The lesson stays on record in `reviews/answer-voice-screen.md` and `reviews/answer-voice-screen.lesson.26728d4.json`.
