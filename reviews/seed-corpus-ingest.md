Date: 2026-09-08 · Branch: claude/seed-corpus-ingest · Status: approved · Class: deployed

# seed-corpus-ingest — a real seed corpus, the operator ingest script, and live ingestion (story 1b)

## Problem

`policy-chunks-ingest` (story 1a) shipped the schema, the retrieval function and the ingestion
pipeline, proven against three synthetic fixture documents. The database on the hosted project is
empty. Nothing downstream can be built or judged against an empty store: the safety router has no
retrieval to route to, the styling prompt has no verified chunks to write from, the verification
panel has no citations to render, and the diagnostic suite has nothing to assert. **Story 1b is
what puts real words in.**

Three decisions were taken at intake on 2026-09-08, after reconnaissance showed the specification
could not settle them:

- **Where the documents come from.** The executive orders are PDF files listed on a page that only
  renders under JavaScript, so a plain fetch enumerates nothing. Thomas chose: **Claude assembles
  a seed corpus** with one-off tooling and commits the markdown as reviewed data. A reusable
  fetcher is a later story, not this one.
- **How large.** **A seed set of roughly twelve documents** — the four the specification names by
  identifier plus the major orders across the pillars.
- **The pillars.** The specification never defines the taxonomy, though every document must carry
  one and `match_policy_chunks` filters on it. Thomas chose **her three stated priorities**:
  housing and homelessness, behavioral health, education.

**The central risk of this story is faithfulness, not mechanism.** The pipeline is built and
reviewed. What is new is that a person's actual words enter a system that answers in her voice, so
a garbled extraction becomes a misquote attributed to a sitting governor. Two things hold that
down and both are acceptance criteria: every chunk keeps the source URL a reader can check, and
the committed text is compared against the official source document by hand, per document,
recorded.

## In scope

1. **The seed corpus** — roughly twelve real documents under `corpus/`, as markdown with the
   frontmatter story 1a defined, covering all three pillars and both document kinds. Includes the
   four the specification names: EO 23-02, HB 4002, SB 1537 and Measure 110.
2. **A provenance manifest** — `CORPUS.md` at the repository root: one row per document giving its
   file, title, source URL, the date retrieved, and the SHA-256 of the source file as retrieved, so
   anyone can re-fetch and check what was read. *(Moved out of `corpus/` at the step-7 consult, per
   design finding 1: a manifest living inside the directory that is defined as "every markdown file
   is a policy document" would be parsed as one. Moving it removes the special case rather than
   documenting an exception every future corpus tool would have to honour.)*
3. **The pillar taxonomy** — one runtime constant, `POLICY_PILLARS`, with the parser validating
   against it and the README documenting the same list, held equal by a test (the pattern the
   domain allowlist already uses).
4. **`scripts/ingest-corpus.ts`** — the operator ingest script Open question 2 of story 1a
   deferred here. Reads `corpus/`, ingests each document through `ingestDocument` with a real
   Fireworks embedder and the service-role Supabase store, reports per-document chunk counts and a
   total, and exits non-zero if any document fails. A `--dry-run` flag parses and chunks with no
   network; a `--file` flag ingests one document.
5. **The live ingestion run** against the hosted Supabase project, and retrieval checked with real
   questions.
6. **README** — the pillar list, how to run ingestion, and what the manifest is for.
7. **A bounded retry on transient embedding failures.** *(Added 2026-09-10, mid-close, at Thomas's
   instruction. Not part of the original scope: it was carried for three rounds as an observation,
   then promoted when it stopped being cosmetic and started preventing criterion 5's companion
   checks from being verified at all — see the diagnosis under Fixes, round 3.)*

## Non-goals

- **A reusable fetcher.** No product code enumerates oregon.gov, downloads PDFs, or extracts text.
  The fetching for this story is one-off and is not committed. A fetcher is its own story if the
  corpus later needs to scale or refresh.
- **Press statements and the newsroom.** The specification's diagnostic scenarios include a direct
  quote from a May 2024 statement, which is a press release rather than an order. Out of scope
  here by the intake decision; the scenario that needs it cannot pass until a later story adds
  that source.
- **Comprehensive coverage.** Roughly twelve documents is a seed, not the corpus. Real questions
  outside the seeded material will legitimately find no grounding.
- **`/api/chat`, the safety router, prompts, the UI, and the stress-test runner** — later
  workstreams, all of which this story unblocks.
- **Schema changes.** The migration story 1a shipped is not amended.
- **Ingestion in CI or the gate.** The gate stays network-free.

## Acceptance criteria

Criteria 1–5 are observable by a person using the corpus or the product; 6–9 are workflow
bookkeeping and stay as numbered property assertions, per `AGENTS.md`.

1. **Given** the committed seed corpus,
   **When** the parser processes every document in `corpus/`,
   **Then** each is accepted with complete metadata, every pillar is one of the declared pillars,
   every URL host is on the official-domain allowlist,
   **And** each document carries enough substantive text to ground a question, yielding at least
   three chunks,
   **And** the corpus as a whole covers all three pillars and both document kinds.

2. **Given** a committed corpus document and the official source it names,
   **When** a reader compares the two,
   **Then** the title, as-of date, source URL and document kind match the official document,
   **And** the committed body reproduces the official text in order, with no passage dropped,
   duplicated, or reordered, and no extraction artifact standing in for real text.

3. **Given** a populated corpus directory and valid credentials,
   **When** the operator runs the ingest command,
   **Then** every document is embedded and stored, the command reports each document's chunk count
   and a total, and it exits non-zero naming the document at fault if any fails.

4. **Given** a corpus already ingested,
   **When** the operator runs the same command again,
   **Then** the stored chunk count is unchanged and no document's chunks are duplicated.

5. **Given** the ingested corpus,
   **When** a real policy question is embedded and passed to the retrieval boundary function,
   **Then** the chunks returned are topically relevant to the question and each carries a source
   URL that resolves to the official document,
   **And** a genuine policy question on a subject the seed does not cover — Oregon transportation
   funding, which is real state policy and outside all three pillars — returns nothing at the
   project's declared retrieval threshold, rather than an unrelated chunk. *(Amended again
   2026-09-08 after measurement: the specification's 0.7 was tried first and FAILED this criterion,
   returning an unrelated chunk at 0.718. The threshold is now `DEFAULT_MATCH_THRESHOLD`, measured
   at 0.73 — Thomas chose option 1 at the threshold consult.)* *(Amended at the step-7 consult, per design finding 3: the original wording asked for a
   pillar absent from the seed while criterion 1 requires all three to be present, so the negative
   case could only have been satisfied by passing a nonsense pillar filter — which tests database
   filtering, not whether the product refuses to answer when it lacks grounding.)*

6. The declared pillar list is a single runtime constant; every corpus document's pillar is a
   member of it; and the README documents that same list, equal in both directions.

7. Every committed corpus document appears in `CORPUS.md` with a source URL, a retrieval date and
   a SHA-256 checksum of the retrieved source, and every manifest row names a committed document —
   equal in both directions. *(The checksum requirement was added at the step-7 consult, per design
   finding 2: the scope promised one while nothing required it, so a blank or malformed value would
   have passed.)*

8. The ingest script reads configuration only through `src/lib/env.ts`'s accessors, so it needs no
   environment variable that is not already declared and documented.

9. Scope containment: run
   `git diff --name-only main...HEAD -- . ':(exclude)reviews/'`
   and verify no files appear beyond `corpus/` (policy documents only), `CORPUS.md`,
   `src/lib/ingest/pillars.ts`, `src/lib/ingest/corpus.ts`, `src/lib/ingest/parse.ts`,
   `src/lib/supabase.ts`, `src/lib/embeddings.ts`, `scripts/ingest-corpus.ts`, `__tests__/`,
   `package.json`, `package-lock.json`, and `README.md`. *(`src/lib/ingest/corpus.ts` was added during
   implementation so the ingest script and the corpus tests share one rule for what counts as a
   document — design finding 1 was about exactly those two extents drifting. `src/lib/supabase.ts`
   was added when Thomas adopted a measured retrieval threshold, which lives beside the result-count
   ceiling it belongs with.)* *(`src/lib/ingest/corpus.ts` was added to this list during implementation: the
   ingest script and the corpus tests must agree on which files are documents, and design finding
   1 was precisely about those two extents drifting. One exported rule, two consumers.)*

10. The retrieval threshold is a single declared constant, and the README documents that same
    number, equal in both directions. *(Added 2026-09-08 when Thomas adopted a measured threshold;
    it is the same hold-the-docs-equal pattern the domain allowlist and the pillar list already
    use, applied to the number that decides when the product refuses to answer.)*

11. Transient embedding failures are retried a bounded number of times and each retry is
    reported; a deterministic failure is not retried. *(Added 2026-09-10 with the scope addition
    above.)*

## Test notes

| AC | Oracle mode | Mechanism |
|---|---|---|
| 1 | `Small` | A test that reads **every** `.md` file in `corpus/` — the extent comes from the directory, not a typed list, so a document added without validating fails without editing the test — and runs the real `parseDocument` over each. Asserts acceptance, pillar membership, host membership, and that the union of pillars equals the declared list while the union of kinds equals both declared kinds. Also runs `prepareDocument` over each and asserts at least three chunks, which a one-line stub cannot satisfy. Includes the empty case: the test fails if the directory yields no documents at all. |
| 2 | `manual` | Per document, open the official source named in the manifest and compare against the committed markdown: the four metadata fields, then the body read through for dropped, duplicated or reordered passages and for extraction artifacts (page furniture, joined or split words, mangled ligatures, lost list structure). **No automated oracle can judge faithfulness to a source PDF** — a checksum proves what was downloaded, not what the extraction produced — so this is a person reading, recorded per document in the story file with what was compared and what was found. |
| 3 | `manual` | Run the command against the hosted project with the real corpus. Read the reported per-document counts and total, and confirm the total equals the row count in the database. Then force a failure (a deliberately malformed document in a scratch copy of the corpus) and confirm a non-zero exit naming that document. Cannot be judged locally: it needs live Fireworks and Supabase. |
| 4 | `manual` | Record the row count after the first run, run the command again unchanged, and confirm the count is identical and that no `(url, chunk_index)` pair appears twice. |
| 5 | `manual` | Embed several real questions whose answers are in the seed, one per pillar, **paraphrased rather than quoting the target passage** so an easy verbatim match cannot stand in for retrieval quality. Retrieve with no pillar filter, then read the returned chunks for topical relevance and correct citation, following each source URL to confirm it resolves to the official document. **Relevance is a human judgment and is named as one rather than dressed up as an assertion.** The negative case is a real transportation-funding question, embedded the same way with no pillar filter, which must return zero rows at threshold 0.7. |
| 6 | `Small` | Two comparisons, both directions: every corpus document's pillar against the constant, and the README's documented list against the constant, parsed from the README's own text rather than read from the constant it is compared to. Includes the empty case: the test fails if the README section yields no pillars. |
| 7 | `Small` | Compare the set of `.md` files in `corpus/` against the set of rows parsed from `CORPUS.md`, in both directions. Assert each row carries a retrieval date and a checksum of exactly 64 lowercase hex characters, and that its source URL is a document URL on an allowed host rather than a bare origin or a directory root. The extents come from the directory and the manifest, never from one another. Includes the empty case: the test fails if the manifest parses to no rows. |
| 8 | `reviewer` | Read every configuration read in the script — literal `process.env`, the `env.ts` accessors, and any dynamic or indexed access — and confirm each key is already declared. The existing `.env.example` completeness test fails if `env.ts` grows an undocumented key. |
| 10 | `Small` | Parse the bolded figure from the README's own retrieval-threshold section and compare it to `DEFAULT_MATCH_THRESHOLD`, plus assert the constant sits above the measured out-of-scope noise ceiling of 0.718, so reverting to the specification's 0.7 fails. Includes the empty case: the test fails if the section yields no figure. |
| 11 | `Small` | Unit tests over `createFireworksEmbedder` with an injected `fetch` and an injected `sleep`, so nothing waits: a transient failure then success returns the real vectors; every retry is announced through `onRetry`; the backoff doubles; the attempt budget is bounded and the exhaustion error names the count; a `4xx` is attempted exactly **once**; a transport failure that produced no response is retried; `Retry-After` is honoured when supplied; and a malformed 200 response is **not** retried, being deterministic. |
| 9 | `reviewer` | Run the enumerated diff command and compare against the listed paths, and read what landed in each allowed directory to confirm it is this story's work and nothing else's. |

### Regressions (ratified list — sourced from the step-6 design review)

Proposed by the independent reviewer from the criteria, before any implementation existed.
**Every criterion received at least one; there is no coverage gap.**
Criteria 1, 6 and 7 name a size, so step 9 must demonstrate red against their entries here.

**AC1** (oracle: `Small`)

- The corpus contains one minimal file per pillar and kind with correct frontmatter, an allowed URL, and only a generic sentence or repeated title as its body. Every document parses, every vocabulary is covered, and the union tests pass, but the seed has no substantive policy text to ground real questions.

**AC2** (oracle: `manual`)

- The reviewer treats footnotes, section notes, signatures, or appendix passages as disposable page furniture and records the body as compared after checking only the main narrative. Title, date, URL, kind, and the order of the retained passages match, but committed material is silently incomplete.

**AC3** (oracle: `manual`)

- The command prints locally parsed chunk counts rather than the store-confirmed counts, and reports a failed document as zero chunks in the per-document table. It still prints a total, exits non-zero, and names the failed file, but a store shortcount or failure is presented as if it were a document with no chunks.

**AC4** (oracle: `manual`)

- The script recognizes a URL already present in the database and skips that document, reporting a cached count without parsing, embedding, or replacing it. On the unchanged corpus the row count and uniqueness checks pass, but the run never exercises replacement and would leave stale chunks after a source revision.

**AC5** (oracle: `manual`)

- The manual check uses questions that quote a target passage nearly verbatim, guaranteeing easy similarity hits, and satisfies the negative case by supplying an arbitrary unknown pillar filter. The letter is met, while ordinary paraphrased questions and unfiltered out-of-scope questions remain untested.

**AC6** (oracle: `Small`)

- The README contains the same three slugs as a bare comma-separated fragment under an unrelated heading. The bidirectional comparison passes, but operators cannot discover or understand the taxonomy, so the documentation requirement is satisfied only mechanically.

**AC7** (oracle: `Small`)

- Each manifest row names a real corpus file and carries a date, but its source URL is a generic official-domain homepage rather than the exact document. The bidirectional file comparison and nonempty URL/date assertions pass, while the manifest no longer identifies what was actually retrieved or checked.

**AC8** (oracle: `reviewer`)

- The script itself calls the env accessors, but passes the whole environment or a subprocess an ambient environment in which an undocumented variable controls logging, batching, or target selection. A direct read audit of the script passes while a hidden configuration dependency remains.

**AC9** (oracle: `reviewer`)

- Unrelated runtime logic or an extra package script is placed inside an allowed path such as __tests__/ or package.json. Every changed path appears on the allowlist, so the diff command passes despite work outside the story's scope.

## Build note (2026-09-09)

| AC | Where it is satisfied |
|---|---|
| 1 | `corpus/*.md` (11 documents), enumerated by `src/lib/ingest/corpus.ts`; test `__tests__/corpus.test.ts` |
| 2 | The committed bodies themselves, plus `CORPUS.md`'s extraction column; verified by hand — see Step-9 verification |
| 3 | `scripts/ingest-corpus.ts`; verified live against the hosted project |
| 4 | `src/lib/supabase.ts` `createSupabaseChunkStore` over story 1a's transactional `replace_document_chunks`; verified live |
| 5 | `src/lib/embeddings.ts` query-task embedding plus `queryPolicyChunks`, at `DEFAULT_MATCH_THRESHOLD`; verified live |
| 6 | `src/lib/ingest/pillars.ts`, enforced in `src/lib/ingest/parse.ts`; tests `__tests__/corpus.test.ts`, `__tests__/readme-pillars.test.ts` |
| 7 | `CORPUS.md`; test `__tests__/corpus-manifest.test.ts` |
| 8 | `scripts/ingest-corpus.ts` reads only through `src/lib/env.ts`, plus a `.env.local` loader that never overrides the shell |
| 9 | Scope containment — see Step-9 verification |
| 10 | `DEFAULT_MATCH_THRESHOLD` in `src/lib/supabase.ts` and the README's retrieval-threshold section; test `__tests__/readme-threshold.test.ts` |

Also: `package.json` gains `tsx` as a dev dependency and an `ingest` script.

## Build note (2026-09-09, round 2)

Re-review after the round-1 redesign. Base `21c3d53`; both approved fixes plus their tests.

| Approved fix | Where |
|---|---|
| Corpus reconciliation — the deletion rule | `src/lib/ingest/corpus.ts` `documentsToRemove`, pure; test `__tests__/corpus-reconcile.test.ts` |
| Corpus reconciliation — the store read | `src/lib/supabase.ts` `listDocumentUrls` over `TableClient`, paged by `URL_PAGE_SIZE`; tests in `__tests__/supabase.test.ts` |
| Corpus reconciliation — the boundary | `src/lib/ingest/pipeline.ts` `ChunkStore.listDocumentUrls` |
| Corpus reconciliation — the command | `scripts/ingest-corpus.ts` `--prune`, its flag refusals, and the refuse-on-failure guard |
| Standard environment loading | `scripts/ingest-corpus.ts` `loadLocalEnv` via `process.loadEnvFile`; `package.json` `engines.node` |
| Documentation of both | `README.md` — prune section and the Node-version floor |

## Build note (2026-09-09, round 3)

Re-review after the round-2 redesign. Base `ec832be`.

| Approved fix | Where |
|---|---|
| Keyset pagination for the deletion-driving catalogue | `src/lib/supabase.ts` `listDocumentUrls` and `TableClient`; tests in `__tests__/supabase.test.ts` |
| Completeness as a type, not a habit | `src/lib/ingest/corpus.ts` `CompleteCorpus` (private constructor), `documentsToRemove`, `reconcileCorpus`; tests `__tests__/corpus-reconcile.test.ts` |
| Validation moved before the work | `scripts/ingest-corpus.ts` — the whole corpus is validated at the start of every full run |
| One authoritative Node floor | `package-lock.json` root metadata regenerated to match `package.json` |

## Build note (2026-09-10, round 4)

Re-review after the round-3 redesign plus the approved scope addition. Base `012dba3`.

| Change | Where |
|---|---|
| Corpus loading owns the destructive precondition | `src/lib/ingest/corpus.ts` `loadCompleteCorpus`, private `CompleteCorpus` construction, module-private `documentsToRemove`; tests `__tests__/corpus-reconcile.test.ts` |
| Removals reported as each is confirmed | `src/lib/ingest/corpus.ts` `reconcileCorpus` `onRemoved`; `scripts/ingest-corpus.ts` prints per removal |
| Loader reads and parses once; the script ingests what it read | `scripts/ingest-corpus.ts` |
| **Scope addition:** bounded retry on transient embedding failures | `src/lib/embeddings.ts`; tests `__tests__/embeddings.test.ts`; reported by `scripts/ingest-corpus.ts` |

## Loop record

- frame/6 — ran (codex on glm-latest, 3 findings, 9 regressions) → reviews/seed-corpus-ingest.design.c246570.json
- frame/9 — demonstrated red for every ratified regression on the size-bearing criteria (AC1, AC6, AC7) and for the added AC10; baseline green, each regression red, restored green. AC2 faithfulness verified by hand; AC3, AC4 and AC5 verified live against the hosted project after Thomas supplied a working Fireworks key. AC5 failed first at the specification's 0.7 threshold and passes at the measured 0.73 he adopted. **Scope addition 2026-09-10:** criterion 11 (bounded retry) demonstrated red three ways against author-written regressions; baseline green, each red, restored green.
- review/6 — round 4: ran (codex on glm-latest, 3 findings) → reviews/seed-corpus-ingest.approach.851aacf.json. First attempt was **refused, not promoted**: the reply carried two top-level JSON objects, which is the format category of stop, not a fabricated review; codex also logged an internal `exec_command` failure. Rerun once with an explicit single-object instruction and it completed with 15 commands executed, 0 REACH-reported.
- review/8 — not yet reached
- close/3b — no activation (round 3: no guard-hook block and no `review_runner.py` refusal to promote; the repo has no `install.sh` to drift-check, no `BACKLOG.md` and no `.aar/` register).
- close/4 — round 3: presented re-review only. Both approved fixes were approach/redesign changes, so merge is not offered. (Rounds 1 and 2: Thomas chose re-review each time.)

**Earlier rounds of this story** (kept as prose: the record holds one line per step by design):

- round 3 (`012dba3`, base `ec832be`): review/6 — round 3: ran (codex on glm-latest, 2 findings) → reviews/seed-corpus-ingest.approach.012dba3.json; review/8 — n/a, the approach gate
  short-circuited on two approved shape-changing fixes; close/3b — no activation; close/4 —
  presented re-review only, and he took it. A bounded retry was added mid-close on his
  instruction, as a recorded scope addition.
- round 2 (`ec832be`, base `21c3d53`): review/6 — round 2: ran (codex on glm-latest, 3 findings) → reviews/seed-corpus-ingest.approach.ec832be.json; review/8 — n/a, the approach gate
  short-circuited again on three approved shape-changing fixes; close/3b — no activation;
  close/4 — presented re-review only, and he took it.
- round 1 (`21c3d53`, base `main`): review/6 — ran (codex on glm-latest, 2 findings) → reviews/seed-corpus-ingest.approach.21c3d53.json; review/8 — n/a, the approach gate short-circuited the
  round because Thomas approved two shape-changing fixes; close/3b — no activation; close/4 —
  presented re-review only, and he took it.

## Open questions

**All four resolved at the step-7 consult (2026-09-08):** Q1 = **`tsx`** (ratified one-way door);
Q2 = **no database constraint on `pillar`**, logged not asked; Q3 = **yes, `pillar` becomes an
enum** (ratified one-way door); Q4 = **yes, the documents are committed**, logged not asked.

1. **A TypeScript runner for scripts.** `scripts/ingest-corpus.ts` must import the library modules
   under `src/lib/`. Node 26 runs TypeScript natively, but **only with explicit `.ts` extensions in
   every import**, and this project's source uses extensionless imports throughout under Next.js's
   bundler resolution — verified on this machine 2026-09-08. So native execution would mean
   rewriting every import in `src/`, which is invasive and fights the framework. **Proposed:
   `tsx` as a dev dependency**, the standard runner for exactly this job, wired as `npm run
   ingest`. Alternative rejected: running the script as a Vitest file, which works with no new
   dependency but makes an operator tool a test. This is a new dependency and the pattern every
   future script copies, so it is a one-way door for Thomas to ratify.

2. **Should `pillar` gain a database check constraint, as `document_kind` has?** **Proposed: no.**
   The two are different in kind. `document_kind` is a closed, two-value vocabulary wired into the
   ranking rule, so the database enforces it. Pillars are an open classification expected to grow
   as the corpus does, and a migration per new pillar is friction with no safety gain given that
   only the service role writes. Enforced at ingest instead. Flagged because the asymmetry will
   otherwise read as an oversight.

3. **Tightening `pillar` from free text to an enum in the parser.** Story 1a accepted any non-empty
   pillar. This story constrains it to the declared list, which is a contract change to a boundary
   already shipped. Nothing else consumes it yet, so the cost is zero today. Proposed: yes.

4. **Committing the documents to git.** Proposed: yes, under `corpus/`. They are public records,
   the set is small, and committing them is what makes ingestion reproducible and the faithfulness
   check reviewable. Two-way; recorded so the reviewer can challenge.

## Design sketch — HOW

- **`corpus/`** — flat, one markdown file per document, named for its identifier and subject
  (`eo-23-02-homelessness-emergency.md`). Flat rather than foldered by pillar: the pillar is
  already in the frontmatter, and a directory hierarchy would be a second place for it to disagree.
- **`CORPUS.md`** (repository root, not inside `corpus/`) — a markdown table: file, title, source
  URL, retrieved date, SHA-256 of the retrieved source file. At the root because `corpus/` is
  defined as "every markdown file here is a policy document", and a manifest inside it would be
  parsed as one. The checksum records **what was downloaded**, honestly not a stable
  identity (a re-publish changes bytes without changing content) and not evidence about the
  extraction. Its job is to let a later reader fetch the same thing and re-do the comparison.
- **`src/lib/ingest/pillars.ts`** — `POLICY_PILLARS = ["housing-and-homelessness",
  "behavioral-health", "education"] as const` plus the derived type, in a runtime module so a test
  can compare it against the README, exactly as `ALLOWED_SOURCE_HOSTS` already does. The type
  barrel stays declaration-only.
- **`src/lib/ingest/parse.ts`** — the `pillar` field becomes `z.enum(POLICY_PILLARS)`, so an
  unknown pillar is refused by name alongside every other faulty field, through the existing
  all-offenders-at-once error.
- **`scripts/ingest-corpus.ts`** — reads the directory, then for each document calls the existing
  `ingestDocument` with `createFireworksEmbedder({ task: "document" })` and
  `createSupabaseChunkStore`, both built from `getNodeEnv()`. Documents are processed in sequence,
  not in parallel: the failure story is simpler and twelve documents do not need the throughput.
  Accumulates results and prints a per-document line plus a total; on any failure it reports every
  document's outcome and exits non-zero, rather than dying on the first. `--dry-run` stops after
  parse and chunk with no network, which is what makes the corpus checkable offline. Nothing is
  caught and swallowed: a failure is reported and reflected in the exit code.
- **Assembling the corpus (one-off, not committed).** Fetch each source with a browser-capable
  fetcher, convert to markdown, hand-write the frontmatter, then read the result against the
  official document and fix the extraction by hand. The deliverable is the reviewed markdown, not
  the tooling.
- **Cross-cutting patterns kept from story 1a**: injected I/O, vocabularies as runtime constants
  held equal to their documentation by a test, errors that name every fault, and the extent of a
  test derived from the authoritative source rather than retyped.

## Design decisions (2026-09-08)

Thomas's disposition at the step-7 consult: *"scope is good; take all recommendations."* The
approved shape is binding on step 9.

- **Scope: APPROVED as written.**
- **Door 1 — `tsx` as a dev dependency** (one-way): **RATIFIED.** Node 26's native TypeScript
  execution requires explicit `.ts` extensions on every import, which this project does not use
  under Next.js's bundler resolution; adopting it would mean rewriting every import in `src/`.
  Wired as `npm run ingest`. This is the runner every future script copies.
- **Door 2 — `pillar` becomes a closed enum at ingest** (one-way): **RATIFIED.** Tightens the
  contract story 1a shipped as free text. Nothing else consumes the field yet.
- **Logged, not asked:** no database check constraint on `pillar` (it is an open, growing
  classification, unlike the two-value `document_kind` wired into ranking); the corpus documents
  are committed to git (public records, small, and it makes both ingestion and the faithfulness
  check reproducible).
- **Finding 1 — the manifest collides with the corpus extent** (IMPORTANT, two-way, kludgy):
  **FIX**, by the alternative Claude recommended over the reviewer's: move the manifest to
  `CORPUS.md` at the repository root rather than keeping it in `corpus/` behind a reserved-name
  exception. Removes the special case instead of documenting it; the two-directional test in
  criterion 7 already supplies the coupling that adjacency was meant to provide.
- **Finding 2 — the checksum has no criterion** (IMPORTANT, two-way, nonstandard): **FIX** —
  criterion 7 now requires a checksum on every row and checks its shape.
- **Finding 3 — the negative retrieval case is undefined** (QUESTION, one-way, nonstandard):
  **ANSWERED — test real grounding.** A genuine transportation-funding question, no pillar filter,
  must return zero rows at the production threshold of 0.7. The weaker reading, an unknown pillar
  filter, was rejected: it exercises database filtering rather than the product's promise to refuse
  when it has no grounding.
- **Regression list:** all **9 ratified** with one amendment — criterion 1 now requires at least
  three chunks per document, so the "stub documents that pass every check" regression has something
  that can fail. The criterion-5 mechanism also takes the paraphrase requirement from its own
  regression.

## Codex (glm-latest) design review (2026-09-08)

Artifact: `reviews/seed-corpus-ingest.design.c246570.json` · round `c246570` · 7 commands executed, 0 REACH-reported.

**Verdict.** 2026-09-08 10:26:33 PDT — The core shape is sound and modern: committing reviewed markdown as the corpus, deriving the pillar contract from one runtime constant and enforcing it with zod, reusing the already transactional document replacement, running the operator script sequentially with explicit per-document outcomes, and adding tsx as the purpose-built TypeScript runner are all the right choices. The main weaknesses are in the acceptance design rather than the architecture: the manifest collides with the corpus-document enumeration, the promised source checksum has no falsifiable criterion, and AC 5's absent-pillar negative case is undefined because AC 1 requires all three declared pillars to be present.

### IMPORTANT

**The manifest collides with the every-.md corpus extent** — reversibility: two-way · standing: kludgy

- **Locus:** Test notes — AC 1 and AC 7; Design sketch — corpus/MANIFEST.md
- **Claim:** AC 1 defines the corpus extent as every .md file in corpus/, and AC 7 compares the set of .md files in corpus/ to manifest rows, but the design also places MANIFEST.md inside that directory. As written, AC 1 would try to parse the manifest as a policy document and AC 7 would count the manifest as an unmatched document. The sketch never defines a reserved-name exception, so both Small oracles are incoherent rather than merely weak.
- **Alternative:** Define one corpus-document enumeration rule: list .md files in corpus/ while excluding exactly MANIFEST.md, and assert that MANIFEST.md is the sole exclusion. Use that same rule for AC 1 and AC 7 so document membership cannot drift between the two tests, while keeping the file and manifest extents independent.
- **Win:** Removes a guaranteed false failure, prevents the manifest from masquerading as a source document, and centralizes the one rule that defines what counts as a corpus document.

**The manifest checksum has no acceptance criterion or oracle** — reversibility: two-way · standing: nonstandard

- **Locus:** In scope — provenance manifest; Test notes — AC 7
- **Claim:** The scope promises a SHA-256 of each retrieved source file, and the story calls provenance central to its faithfulness risk, but AC 7 and its test require only a source URL and retrieval date. A manifest row can omit the checksum, leave it blank, or carry a malformed value and still pass every named check. AC 2's manual source comparison does not validate the manifest's checksum field either.
- **Alternative:** Extend AC 7 to require a checksum on every row and have the Small test validate the 64-character lowercase-hex shape. A later refresh story can additionally re-fetch the named source and compare the digest, but the current story should at least make presence and format falsifiable.
- **Win:** Makes the provenance contract testable and catches a missing or corrupted manifest row before it undermines the hand comparison and later re-fetch workflow.

### QUESTION

**AC 5's absent-pillar case is undefined** — reversibility: one-way · standing: nonstandard

- **Locus:** Acceptance criteria — AC 5; Test notes — AC 5
- **Claim:** AC 1 requires the corpus to cover all three declared pillars, so there is no declared pillar absent from the seed. AC 5 nevertheless asks for a question about a pillar absent from the seed. Without a concrete absent topic, an implementation could satisfy the negative case by supplying an arbitrary unknown pillar filter, which tests SQL filtering rather than the intended product behavior: an ungrounded question returning nothing at the production threshold. Alternatively, an unfiltered out-of-scope question could return a loosely related chunk. Thomas needs to define which behavior is intended.
- **Alternative:** Either name a concrete out-of-scope policy topic, embed it as a real query without a pillar filter, and require zero results at the documented production threshold; or narrow the negative case explicitly to an unknown filter_pillar value and test that SQL filtering returns none. Record the chosen threshold in the story.
- **Win:** Turns the negative case into a reproducible, falsifiable check instead of an ambiguous instruction that can be satisfied by a mechanism unrelated to semantic grounding.

## Step-9 verification (2026-09-08)

### Demonstrate red — criteria 1, 6 and 7

Each ratified regression was applied to the committed work, the gate run, the failure observed,
and the change reverted. Baseline green before and after, 178 tests.

| Ratified regression | Gate | What failed |
|---|---|---|
| baseline, nothing modified | green | — |
| AC1 — stub documents with correct frontmatter and no substance | **red** | `corpus/eo-25-09.md carries enough text to ground a question` |
| AC6 — the pillar slugs present as prose under an unrelated heading | **red** | the README pillar section is no longer found, so its whole suite fails |
| AC7 — a manifest row citing a site root instead of the document | **red** | `cites a specific document on an allowed host`, and the frontmatter-agreement check |
| restored | green | — |

The AC6 regression fails at collection rather than inside one named test, because the section
parser is at module scope. The failure is real and specific to that file; it is recorded here
rather than smoothed over.

### AC2 — faithfulness (manual)

**The finding that shaped this story: every Governor's executive order is published as a scanned
image with no text layer.** Confirmed independently twice, across orders from 2023 to 2026. The
legislative documents are the opposite — proper digital text that extracts exactly. One executive
order, EO 24-07, also has an official text-only companion, and that is the source used for it.

So four of the eleven documents required optical character recognition. macOS's built-in Vision
engine was used, which needs no privileged install. Every OCR'd document was then proofread, and
the corrections are listed here rather than summarised, because this is the story's central risk.

**Method, per document.** Metadata was checked against the source: title, as-of date, URL and
kind. The committed body was then scanned for tokens absent from both a system dictionary and the
vocabulary of the machine-exact documents, and every unrecognised token was resolved by reading it
in context. For the most statistics-heavy document, EO 23-02, the source pages were rendered and
read directly to verify every figure.

**Extraction repairs, all mechanical and conservative.** Line-break hyphens were rejoined only
when the joined form was confirmed a real word, so `high-quality` could never become
`highquality`; 3,500 or so were rejoined and the rest kept. 38 intra-word spaces from two-column
extraction were closed under a rule that cannot join two real words, so `any one` was left alone
while `determ ine` became `determine`. Roughly 180 running headers and letterhead lines were
removed by exact pattern.

**A false lead, recorded because it nearly caused harm.** An early detector flagged 274 "stray
line numbers" in one bill. Sampling them showed they were legitimate statutory text — `section 2
of this 2024 Act`, `60 days`. Removing them would have destroyed real content. No such removal was
made.

**OCR corrections, all 45, each verified in context.** Misread words: `Medtord`→`Medford`,
`atfordable`→`affordable`, `Oftice`→`Office`, `EXECOTIVE`/`EAECOTIVE`→`EXECUTIVE`,
`DISTRICIS`→`DISTRICTS`, `ATTESI:`/`ATTES:`→`ATTEST:`, `ili.`→`iii.`. Lost spaces:
`thedevelopment`, `takeany`, `thetime`, `Thenumber`, `peoplewere`, `resourcesthat`,
`EmergencyManagement`, `ComprehensiveEmergency`, `emergencyand`, `Ifind`, `tocontinue`,
`totakeany`, `beat thedirection`, `arefacing`, `goalof`, `thebest`, `remainin`, `untilthe`,
`ori inal`. Mangled ordinals in the signature blocks: `10"`, `10t"`, `9''` → `10th`, `10th`,
`9th`. Six OCR-mangled running headers removed. **Handwritten signatures were being rendered as
nonsense words** — `2Ctch`, `MYeck`, `P-Falek`, `IinKtet`, `S-tap`, `Zaune: Grifü-lalade`,
`Tasio y Read` — and were removed, because a signature is an image and OCR text standing in for it
is exactly the artifact this criterion forbids. After correction, no unrecognised token remains in
any OCR'd document beyond modern words absent from the 1934 dictionary (`internet`, `laptop`,
`rehoused`).

**Visual verification of EO 23-02.** Pages 1 and 2 were rendered and read against the committed
text. Every figure matches: a 63% rise, at least 18,000 individuals, about 62% unsheltered, the
50%-or-more regions at 50.4% for the Metro region, 86% Central Oregon, 110% Eugene/Springfield,
132% Medford/Ashland and 150% Salem/Marion. Both footnotes, the full eight-region list and the
Syracuse University passage are present and correct. This is what confirmed the `Medford`
correction.

**Dates verified from each document's own words**, not from a catalogue: `Done at Salem, Oregon,
this 10th day of January, 2023` for EO 23-02 and EO 23-04; `this 9th day of January, 2024` for
EO 24-02; `this 30th day of January, 2024` for EO 24-07; `this 2nd day of July, 2025` for
EO 25-09; `Approved by the Governor` lines for HB 4002 (2024-04-01), SB 755 (2021-07-19),
SB 1537 (2024-04-17), HB 2001 (2023-03-29) and HB 3198 (2023-07-31); and for Measure 110 the
proclamation date of 2020-12-03 printed in its own certification.

**What is NOT claimed.** The bodies of the three long bills were not read end to end by a human.
They come from machine-exact text layers, their structure was checked at the start, middle and
end, and no unrecognised token survives in them. A word-by-word reading of 700,000 characters of
statute was not done and is not claimed.

### AC3 — live ingestion (manual, 2026-09-08) — PASS

Thomas replaced the stale key; the new one authenticates and the embeddings endpoint returns a
768-dimension vector for the model the specification names, which independently confirms the
dimension the schema declares.

First run: **10 of 11 documents ingested, 989 chunks**, and `corpus/hb-4002.md` failed on a
transient `HTTP 503` from Fireworks. That was not staged — it is the criterion's failure half
observed for real. The command reported each document's outcome on its own line, printed the
totals, listed the failure again under `failed:`, and exited non-zero naming the document. The
retry through `--file corpus/hb-4002.md` succeeded with 386 chunks.

Database after ingestion: **1,375 chunks across 11 distinct documents, zero duplicate
`(url, chunk_index)` pairs**, all three pillars and both document kinds present. That total equals
the `--dry-run` count exactly, so nothing was lost or added between chunking and storage.

**Observed, not fixed:** Fireworks returned `503` twice during this story's runs. The embedder has
no retry, so a transient upstream failure ends a document's ingestion. That is honest behaviour
rather than a hidden failure, and the operator can re-run, but a bounded retry is a real candidate
for a later story. Out of scope here; recorded so it is not rediscovered.

### AC4 — idempotency (manual, 2026-09-08) — PASS

Row count before the second full run: 1,375. After: 1,375, with zero duplicate pairs. The
**row ids all changed**, which is the point: it proves each document was genuinely deleted and
re-inserted through the transactional replacement, rather than skipped because its URL was already
present. That skip-and-report shortcut is exactly the ratified AC4 regression, and the id
comparison is what falsifies it.

### AC5 — real retrieval (manual, 2026-09-08) — PASS at the measured threshold

Questions were paraphrased rather than quoting the documents, embedded with the query task prefix,
and passed through the real boundary function using **only the public key**.

**First attempt, at the specification's 0.7: FAILED.** "How is Oregon paying to repair its highways
and bridges?" returned an unrelated passage of EO 23-02 at similarity 0.718. The criterion requires
zero rows. That failure is kept in this record rather than erased, because it is what produced the
threshold decision.

**Measurement across six in-scope and five out-of-scope questions:**

| | value |
|---|---|
| signal floor, worst in-scope best hit | 0.732 |
| noise ceiling, best out-of-scope hit | 0.718 |
| separation | 0.014 |

The populations separate, but the specification's 0.7 sits below the noise ceiling, so it cannot
discriminate for this embedding model. Other out-of-scope questions scored 0.627 to 0.677;
transportation is the hardest case because emergency orders discuss funding and infrastructure.

**Thomas's decision (option 1):** adopt a measured threshold as the project default.
`DEFAULT_MATCH_THRESHOLD = 0.73` now sits above every measured out-of-scope hit and below every
measured in-scope one, documented in the README with the evidence and held equal by criterion 10's
test.

**Re-run at 0.73 — all eleven cases pass:**

| Expectation | Question | Result |
|---|---|---|
| grounded | people sleeping outside without shelter | 1 hit, EO 24-02, 0.732 |
| grounded | someone caught carrying a small amount of drugs | 5 hits, Measure 110, 0.764 |
| grounded | helping young children learn to read | 4 hits, HB 3198, 0.744 |
| grounded | rules about phones in classrooms | 1 hit, EO 25-09, 0.733 |
| grounded | fentanyl downtown | 2 hits, EO 24-07, 0.772 |
| grounded | getting more homes built | 4 hits, EO 23-04, 0.802 |
| refuse | highway and bridge funding | 0 hits |
| refuse | commercial salmon fishing | 0 hits |
| refuse | wildfire smoke warnings | 0 hits |
| refuse | electric vehicle charging | 0 hits |
| refuse | last Oregon Ducks game | 0 hits |

Every in-scope question retrieved the correct document for its pillar, and every citation resolves
to the official source. **Two cases sit right on the edge**: the shelter question at 0.732 and the
classroom-phones question at 0.733, each returning exactly one chunk against a 0.73 threshold. The
margin is real but thin, which is why the constant, the README and this record all say to
re-measure as the corpus grows.

### Demonstrate red — criterion 10

| Ratified regression | Gate | What failed |
|---|---|---|
| baseline, nothing modified | green | 181 tests |
| the code reverts to the specification's 0.7 | **red** | `states exactly the threshold the code uses`, and `uses a threshold above the measured out-of-scope noise ceiling` |
| the README states a different number than the code | **red** | `states exactly the threshold the code uses` |
| restored | green | 181 tests |

### A process note, recorded because it cost real work

The first demonstrate-red run for criterion 10 was done against **uncommitted** work, and
`git checkout -- <path>` restored the files to their last committed state, discarding the new
constant and the README section entirely. The gate then failed for an unrelated reason and a red
commit was made before the cause was understood. Both were repaired, the commit amended, and the
demonstrate-red rerun from a committed baseline. The rule this violated is Thomas's own: checkpoint
before anything that can churn files. It is written here rather than quietly fixed.

## Codex (glm-latest) approach review (2026-09-09, base main, HEAD 21c3d53)

Artifact: `reviews/seed-corpus-ingest.approach.21c3d53.json` · round `21c3d53` · 11 commands executed, 1 REACH-reported.

The REACH line is a false positive of the over-inclusive check: it flagged `/tsx` as a path
outside the review root, but that string is part of the regex `/tsx|dotenv/` inside a
`node -e` script inspecting the lockfile. Reported, not fatal, and read as designed.

**Verdict.** 2026-09-09 07:18:39 PDT — The core shape is sound and close to what I would build: reviewed markdown as committed data, one directory-enumeration rule, zod-backed closed pillar and metadata contracts, reuse of the transactional document replacement, a thin sequential operator script, and a purpose-built TypeScript runner. I would not replace those pieces with a fetcher or a broader ingestion framework in this story. The two shape changes I would make are to give the full-corpus command an explicit reconciliation/removal path so the hosted store cannot retain withdrawn or re-homed documents, and to replace the private .env.local parser with the runtime's standard environment-file loader.

### IMPORTANT

**Full-corpus ingestion has no removal or reconciliation path** — reversibility: one-way · standing: nonstandard

- **Locus:** scripts/ingest-corpus.ts:86-149; src/lib/ingest/pipeline.ts:24-33
- **Claim:** The command is presented as ingesting the whole corpus, and the store interface explicitly supports withdrawing a source by replacing it with zero rows, but the operator script only iterates the current corpus paths. If a document is later removed, or its canonical URL is corrected, the old URL's chunks remain publicly retrievable after a successful full run. The README even describes empty-set replacement as the way to withdraw a source, yet no operator command reaches that path. This leaves the hosted store and the reviewed committed corpus with different lifecycle semantics.
- **Alternative:** Make corpus synchronization an explicit operator operation: after every current document succeeds, list stored document URLs and call replaceDocument(url, []) for URLs absent from the current corpus, preferably behind a clearly named --prune flag so destructive behavior is opt-in. Report removals alongside chunk counts and exit non-zero on any failure. This can be implemented without a schema change by extending the thin store boundary with a list/remove operation.
- **Win:** Eliminates the stale-source failure mode and centralizes the invariant that a successful full ingest leaves the hosted store equal to the committed, reviewed corpus; withdrawn or re-homed documents can no longer continue to ground answers.

### NIT

**A private .env.local parser reinvents standard environment loading** — reversibility: two-way · standing: nonstandard

- **Locus:** scripts/ingest-corpus.ts:32-50
- **Claim:** The script hand-rolls dotenv parsing: key matching, quote stripping, and shell-over-file precedence. This is a small but foundational parser that future operator scripts are likely to copy, and it can diverge from standard .env semantics for comments, escaping, and multiline values. The repository pins Node 26, where the runtime already provides environment-file loading that preserves pre-existing variables.
- **Alternative:** Use process.loadEnvFile('.env.local') behind the existing existsSync check, raising the declared engine floor to the Node version that provides that API; if support for Node 20.9 must remain exact, add dotenv as a direct dependency instead. Either way, delete the private parser and keep the precedence requirement documented and tested through the chosen standard loader.
- **Win:** Removes roughly fifteen lines of bespoke parsing, eliminates a private error-prone configuration format, and gives future scripts one standard loading path rather than a copied regex implementation.

## Decisions (2026-09-09)

Thomas's call per finding, round `21c3d53`: *"fix both as you recommend."*

**Approach (glm-latest)**

- **Full-corpus ingestion has no removal or reconciliation path** (IMPORTANT, one-way,
  nonstandard): **FIX.** After every current document succeeds, the command lists the stored
  document URLs and removes any the committed corpus no longer contains, through the existing
  empty-set replacement. The removal is **opt-in behind a named flag** so nothing destructive
  happens by default, removals are reported alongside chunk counts, and any failure exits
  non-zero. This needs a list operation on the thin store boundary; no schema change. Taken
  because the product's premise is that every answer traces to a *current* official document, so a
  withdrawn or re-homed source that keeps grounding answers is the failure this product can least
  afford — and the lifecycle contract set here is the one every later corpus tool inherits.
- **A private `.env.local` parser reinvents standard environment loading** (NIT, two-way,
  nonstandard): **FIX.** Replace the hand-rolled parser with the runtime's own environment-file
  loader and raise `engines.node` to the version that provides it. **The shell-wins precedence is
  a requirement, not an incidental**: the Fireworks key is declared estate-wide in the shell and a
  stale file copy must never override it, so the loader's actual precedence is verified before the
  hand-rolled one is deleted, not assumed.

**Gate.** Both are shape-changing fixes, so per the loop's approach gate the correctness pass does
**not** run this round. The branch returns for a fresh review after the fixes land, and that round
re-runs the approach pass on the new shape.

## Fixes (2026-09-09)

Applied per the Decisions above; gate green at 192 tests; commit `5e5fa7b`.

### Finding 1 — corpus reconciliation (IMPORTANT, one-way)

- **`documentsToRemove(storedUrls, corpusUrls)`** in `src/lib/ingest/corpus.ts`, beside the
  enumeration rule it belongs with. It is a **pure function, unit-tested separately**, deliberately
  not buried in the operator command: the rule that decides what gets deleted fails silently, so it
  is the last thing that should live only inside a script.
- **`ChunkStore.listDocumentUrls()`**, implemented in `src/lib/supabase.ts` over a narrow
  `TableClient` interface so tests inject a fake. **It pages explicitly.** PostgREST caps a response
  at 1000 rows by default and the store holds 1,375 chunks, so an unpaged read would have returned a
  short list — and the caller of that list *deletes*. Three tests pin this: paging until a short
  page, not stopping on a full page that contributed no new URL, and surfacing an error rather than
  returning a truncated list.
- **`--prune`** in `scripts/ingest-corpus.ts`, opt-in because it deletes. It refuses to combine with
  `--dry-run` or `--file`, and **it does not run at all if any document failed**, because the corpus
  list would then be incomplete and pruning against it could withdraw a live document. Every removal
  is printed and counted in the summary.
- Removal reuses story 1a's empty-set replacement, so nothing new touches the schema.

**Verified live against the hosted project.** The refusal path fired on five separate runs where a
document failed, each printing `NOT pruning`, and `eo-25-09` survived in the store throughout —
which is the guard doing exactly its job. On a clean run with that document withdrawn from the
corpus, the command reported `pruning 1 withdrawn document(s)`, printed the removed URL, and
summarised `10/10 document(s), 1367 chunks, 1 removed`; the store went to 10 documents with zero
`eo-25-09` rows. The document was then restored and re-ingested, and the store is back to **1,375
chunks across 11 documents with zero duplicates**, each document's chunk count matching the offline
dry run exactly.

### Finding 2 — standard environment loading (NIT, two-way)

- The hand-rolled `.env.local` parser is gone. `scripts/ingest-corpus.ts` now calls
  `process.loadEnvFile` behind the existing existence check.
- **Precedence was verified before the parser was deleted, not assumed.** A probe under Node 26
  confirmed the loader leaves an already-set variable alone and fills in only what is missing. That
  is the requirement, not a nicety: the Fireworks key is declared estate-wide in the shell, and a
  stale file copy must never override it.
- `engines.node` raised from `>=20.9.0` to `>=20.12.0`, the first release providing that API, and
  the README's Node-version section now says why the floor moved.

### Observed during verification, not fixed

**Fireworks returned `HTTP 503` on roughly a fifth of embedding requests throughout this session.**
Four consecutive full-corpus runs each failed two documents; a five-call health probe between
bursts returned `200` five times, so it is intermittent rather than an outage. The embedder has no
retry, so each burst ends a document's ingestion. Two things make this tolerable today and neither
makes it acceptable long-term: every failure is reported and drives a non-zero exit, and each
document's replacement is transactional, so a failed document keeps its previous rows and repeated
runs converge — which is exactly what was observed. **A bounded retry with backoff is a real
candidate for its own story.** It is out of scope here and is recorded so it is not rediscovered.

## Codex (glm-latest) approach review — round 2 (2026-09-09, base 21c3d53, HEAD ec832be)

Artifact: `reviews/seed-corpus-ingest.approach.ec832be.json` · round `ec832be` · 11 commands executed, 0 REACH-reported.

**Verdict.** 2026-09-09 07:50:29 PDT — The redesign direction is sound and close to what I would build: the corpus remains reviewed committed data, ingestion stays a thin sequential operator command, and pruning reuses the existing transactional empty-set replacement rather than adding a schema. I would preserve those choices and Thomas's opt-in/refuse-on-failure decisions. I would not ship the reconciliation exactly as built, though: the deletion-driving catalog infers completeness from page length, and the complete-corpus safety precondition lives only as procedural checks inside the command rather than in the reconciliation operation itself. I would also synchronize the lockfile after raising the Node floor.

### IMPORTANT

**Reconciliation pagination infers completeness instead of asking for it** — reversibility: two-way · standing: kludgy

- **Locus:** src/lib/supabase.ts:168-187
- **Claim:** The list that drives deletion treats any page shorter than URL_PAGE_SIZE as the final page, while URL_PAGE_SIZE = 1000 is only the default PostgREST cap. A project or server configured with a lower row cap can return a short, non-final page; the method will then return a truncated URL list, and --prune will delete every live document missing from that list. The offset-based range query also has no deterministic order, so concurrent writes can move rows between pages. This is a safety-critical catalog read encoded as an inference about deployment configuration.
- **Alternative:** Use the Supabase client's declarative keyset pagination: order by url, retain the last URL as a cursor, and request url greater than the cursor with a bounded page size; validate row shape and continue until an empty page. Because only distinct URL values are needed, skipping duplicate rows at the cursor is safe. Exact-count pagination would be an improvement, but keyset pagination removes both the server-cap and unstable-offset assumptions without a schema change.
- **Win:** Eliminates the deployment-specific page-size assumption and unstable offset behavior; an incomplete catalog read fails or continues correctly rather than causing deletion of live documents.

**The destructive-corpus precondition is not owned by the reconciliation operation** — reversibility: one-way · standing: nonstandard

- **Locus:** scripts/ingest-corpus.ts:161-186; src/lib/ingest/corpus.ts:32-37
- **Claim:** The approved no-file, real-run, and no-failure guards are procedural facts inside main. The exported documentsToRemove remains a raw set difference: a partial or empty corpus URL list produces a deletion plan, and its unit test explicitly documents the all-delete behavior. Duplicate canonical URLs are also accepted, so two corpus files sharing one URL can silently overwrite one another while the command still reports a clean run and considers the corpus complete. Future corpus tooling can import the shared deletion rule without inheriting the script-local safety checks.
- **Alternative:** Preserve the approved opt-in and refuse-on-failure semantics, but move them into one reconciliation operation. Load and parse the whole corpus first, reject an empty or duplicate-URL corpus, and expose a validated CompleteCorpus or complete URL set that reconcileCorpus requires before it lists and removes anything. Leave the script responsible only for argument parsing and reporting outcomes.
- **Win:** Centralizes the destructive invariant where future tools inherit it; partial, failed, empty, and duplicate corpus states become unit-testable refusals rather than valid-looking deletion plans.

**The lockfile still advertises the old Node floor** — reversibility: two-way · standing: nonstandard

- **Locus:** package-lock.json:31-33; package.json:36-38
- **Claim:** The redesign raises package.json to Node >=20.12.0 because process.loadEnvFile requires it, but the lockfile's root package still records >=20.9.0. The runtime floor is therefore stated inconsistently, and a Node 20.9–20.11 environment can miss the intended compatibility warning and fail only when the ingest script calls the missing API.
- **Alternative:** Regenerate the lockfile with npm after changing engines, for example npm install --package-lock-only, so the generated root metadata matches package.json. Keep the README's separate explanation of why the floor moved.
- **Win:** Restores one authoritative runtime floor across the manifest and lockfile, causing unsupported Node versions to fail at installation rather than during a privileged operator command.

**Claim check.** Finding 3 verified directly: `package.json` declares `>=20.12.0` while the
lockfile's root package still records `>=20.9.0`. The mismatch is real.

## Decisions (2026-09-09, round 2)

Thomas's call per finding, round `ec832be`: *"fix all."*

**Approach (glm-latest)**

- **Reconciliation pagination infers completeness instead of asking for it** (IMPORTANT, two-way,
  kludgy): **FIX.** Replace the offset-and-short-page inference with keyset pagination ordered by
  `url`, carrying the last URL as a cursor and continuing until a genuinely empty page. The current
  code encodes an assumption about someone else's server configuration into the step that deletes:
  a project with a row cap below `URL_PAGE_SIZE` returns a short page that is not the last, and the
  truncated list would drive deletion of live documents. Offsets also have no stable order under
  concurrent writes.
- **The destructive precondition is not owned by the reconciliation operation** (IMPORTANT,
  one-way, nonstandard): **FIX.** The opt-in, real-run and refuse-on-failure guards Thomas approved
  stay exactly as decided, but move from procedural checks inside `main` into one reconciliation
  operation that requires a **validated complete corpus** before it lists or removes anything.
  Parse the whole corpus first; refuse an empty corpus and refuse duplicate canonical URLs — the
  latter is a gap neither the author nor the previous round named, where two corpus files sharing
  one URL silently overwrite each other while the run still reports clean. The exported set
  difference must stop being usable as a raw deletion plan, because future corpus tooling will
  import it without inheriting script-local checks.
- **The lockfile still advertises the old Node floor** (IMPORTANT, two-way, nonstandard): **FIX.**
  Regenerate the lockfile so its root metadata matches `package.json`. **Verified directly before
  accepting**: `package.json` declares `>=20.12.0` while the lockfile records `>=20.9.0`, so a Node
  20.9–20.11 environment installs without warning and fails only when the ingest command calls
  `process.loadEnvFile`.

**Gate.** All three are shape-changing, so the correctness pass does **not** run this round — the
second consecutive redesign on this story. The branch returns for a third approach pass.

## Fixes (2026-09-09, round 2)

Applied per the round-2 Decisions; gate green at 198 tests; commit `44a9a3f`.

### Finding 1 — keyset pagination for the deletion-driving catalogue

`listDocumentUrls` no longer pages by numeric offset and no longer treats a short page as the last
one. It orders by `url`, carries the last URL seen as a cursor, and **ends only on a genuinely
empty page**. `URL_PAGE_SIZE` is now explicitly *not* load-bearing. The cursor also advances past
every row sharing a URL, which is exactly right when only distinct URLs are wanted and guarantees
forward progress. A read that fails to advance is **refused** rather than looped or silently
skipped, because this list drives deletion. Six unit tests pin it, including a deliberately short
middle page — the case that under the old code ended the read and truncated the list.

### Finding 2 — the destructive precondition is now a type, not a habit

- **`CompleteCorpus`** in `src/lib/ingest/corpus.ts`, with a **private constructor**: the only way
  to obtain one is `CompleteCorpus.of`, which refuses an empty corpus and refuses two documents
  claiming the same canonical URL, naming both files.
- **`documentsToRemove` now takes a `CompleteCorpus`**, not an array, so a raw or partial URL list
  can no longer be turned into a deletion plan. The compiler enforced this immediately: the
  round-1 test that documented "an empty list proposes deleting everything" stopped compiling,
  which is the finding made mechanical.
- **`reconcileCorpus(corpus, store)`** is the one operation that deletes. It reads the stored
  catalogue **itself** rather than trusting a caller's list, and removes by empty-set replacement.
- **Validation moved before the work.** The whole corpus is parsed and validated at the start of
  every full run, so a duplicate-URL corpus now fails before anything is embedded — whether or not
  the run prunes, because two files sharing a URL silently overwrite each other regardless. The
  script keeps only the run-entitlement checks: opt-in, real run, whole corpus, no failures.
- The duplicate-URL gap was named by the reviewer and by neither the author nor round 1.

### Finding 3 — one authoritative Node floor

Lockfile regenerated with `npm install --package-lock-only`. Its root metadata now records
`>=20.12.0`, matching `package.json`. **Verified before and after**: it read `>=20.9.0` before.

### Verification

| Check | Result |
|---|---|
| Flag refusals: `--prune` with `--dry-run`, with `--file`, unknown argument | refused, each naming the reason |
| **New:** duplicate canonical URL | refused **before any work**, naming both files and the URL |
| Normal offline dry run | 11/11 documents, 1375 chunks |
| Keyset listing against the live database | ran on a clean 11/11 run and reported `nothing to prune: the store already matches the corpus` |
| Prune refusal after a failed document | fired on **eight** separate live runs; the withheld document kept its rows every time |
| Store integrity throughout | 1375 chunks, 11 documents, zero duplicates |

**What is not claimed.** The composed removal path was **not** re-verified live under the new
implementation. Eleven full-corpus attempts across this round each had at least one document fail,
so the guard correctly refused to prune every time and the removal branch was never reached. Every
component of that path is verified: `reconcileCorpus` by three unit tests including one proving it
reads the store's own catalogue rather than a caller's list; the keyset listing by six unit tests
and by the live `nothing to prune` run above; and empty-set replacement live in round 1 and in
story 1a. The composition itself rests on those. This is stated rather than papered over.

### The instability, now better characterised

Fireworks `HTTP 503` responses continued and worsened. **A health probe of six single-input
requests returned 200 six times in a row, immediately before a full-corpus run that failed four
documents.** At the time this was read as load-related, with large batches being rejected while
small requests succeeded. ***That inference was wrong and is corrected in round 3 below — the
correction is left visible rather than edited away, because the wrong diagnosis is what made the
remedy look like "smaller batches".***

## Codex (glm-latest) approach review — round 3 (2026-09-09, base ec832be, HEAD 012dba3)

Artifact: `reviews/seed-corpus-ingest.approach.012dba3.json` · round `012dba3` · 15 commands executed, 1 REACH-reported.

The REACH line is again a false positive of the over-inclusive check: it could not resolve a
`$(...)` construct in a command inspecting the global npm root, so it reported rather than
cleared it. Reported, never fatal, and read as designed.

**Verdict.** 2026-09-09 19:50:52 PDT — The keyset redesign is the right shape: ordering by the indexed url, advancing past duplicate cursor rows, and ending only on an empty page correctly removes the server-cap and offset assumptions; errors and malformed rows surface, and a concurrent insert behind the cursor can leave a stale document unpruned but cannot make a live corpus document look withdrawn. The Node floor is also synchronized. I would not yet call the destructive invariant unbypassable, though: CompleteCorpus.of validates a caller-chosen list rather than owning the corpus-directory load, and reconcileCorpus completes its destructive batch before the operator command can report individual removals. Fix those two boundaries; the rest is close to what I would build.

### IMPORTANT

**CompleteCorpus validates a list, not an unbypassable corpus extent** — reversibility: one-way · standing: nonstandard

- **Locus:** src/lib/ingest/corpus.ts:44-68,80-102; scripts/ingest-corpus.ts:129-152
- **Claim:** The private constructor does not own the invariant because public CompleteCorpus.of accepts any non-empty, duplicate-free list supplied by a caller. It proves list coherence, not that the entries are the complete corpus directory: future tooling can mint a CompleteCorpus from one document and pass it to the still-exported documentsToRemove or reconcileCorpus, withdrawing every other stored document. The operator script also builds the value from one read of each file and then re-reads and re-parses the files for ingestion, so a file changed between those passes can leave the deletion plan driven by a stale corpus snapshot.
- **Alternative:** Make the only public construction path a loader bound to the existing enumeration rule, such as loadCompleteCorpus(dir = CORPUS_DIR): enumerate, read, and parse once; reject empty and duplicate-URL corpora; and return an opaque CompleteCorpus together with the loaded documents the same run will ingest. Make documentsToRemove module-private so reconcileCorpus is the only exported deletion operation, and keep --file unable to produce a CompleteCorpus.
- **Win:** Closes the partial- and stale-corpus bypass that future tools can inherit, removes the exported raw deletion-plan API, and eliminates the second full read/parse of every document.

**A partial reconciliation can destroy rows invisibly** — reversibility: two-way · standing: nonstandard

- **Locus:** src/lib/ingest/corpus.ts:96-102; scripts/ingest-corpus.ts:181-200
- **Claim:** reconcileCorpus performs every empty-set replacement before returning, while the script prints removed URLs only after the whole promise resolves. If the second or later replacement fails, earlier documents have already been withdrawn, but the top-level error handler prints only the database error: no removed URL, no partial count, and no summary. Each withdrawal is atomic, but the reconciliation batch is not, and its partial destructive state is unauditable from the command output.
- **Alternative:** Keep reconcileCorpus as the sole deletion operation, but give it an optional onRemoved(url) progress callback and invoke it immediately after each store-confirmed withdrawal; the script prints and counts each removal as it happens and still propagates the first failure. This preserves the approved per-document transaction without adding a schema-wide delete RPC.
- **Win:** No confirmed destructive write can be invisible; a failed batch reports exactly which documents were already withdrawn, making the partial state auditable and safely rerunnable.

**What it confirmed fixed.** The keyset redesign is judged the right shape: ordering by the
indexed URL, advancing past duplicate cursor rows, and ending only on an empty page removes
both the server-cap and offset assumptions. It also names the residual honestly — a concurrent
insert behind the cursor can leave a stale document unpruned, but cannot make a live corpus
document look withdrawn, which is the safe direction. The Node floor is confirmed synchronized.

## Decisions (2026-09-09, round 3)

Thomas's call per finding, round `012dba3`: *"fix both."* He was also offered the alternative of
cutting reconciliation from this story into its own, and chose to continue.

**Approach (glm-latest)**

- **`CompleteCorpus` validates a list, not an unbypassable corpus extent** (IMPORTANT, one-way,
  nonstandard): **FIX.** The only public construction path becomes a loader bound to the
  directory-enumeration rule: enumerate, read and parse **once**, refuse empty and duplicate-URL
  corpora, and return the validated corpus together with the parsed documents the same run will
  ingest. `documentsToRemove` becomes module-private so `reconcileCorpus` is the only exported
  operation that can delete, and `--file` still cannot produce one. This also removes the second
  full read and parse of every document, which is where the stale-snapshot window came from.
- **A partial reconciliation can destroy rows invisibly** (IMPORTANT, two-way, nonstandard):
  **FIX.** `reconcileCorpus` reports each withdrawal through a callback the moment the store
  confirms it, so a batch that fails part-way names exactly which documents were already removed.
  The first failure still propagates. Each withdrawal stays individually transactional; what
  changes is that a confirmed destructive write can no longer be invisible.

**Gate.** Both are shape-changing, so the correctness pass does **not** run this round — the third
consecutive redesign on this story, all on the prune path. The branch returns for a fourth approach
pass.

## Fixes (2026-09-09, round 3)

Applied per the round-3 Decisions; gate green at 198 tests; commit `42103ad`.

### Finding 1 — corpus loading now owns the destructive precondition

- **`loadCompleteCorpus(dir = CORPUS_DIR)`** is the only public way to obtain a `CompleteCorpus`.
  It is bound to the same `corpusDocumentPaths` rule that defines what a corpus document is, so a
  caller can no longer present one document as a complete corpus and use it to withdraw every
  other stored document. Both the constructor and the list-taking factory are private to the
  module.
- **The loader reads and parses each document exactly once**, and the returned value carries those
  parsed documents. The script ingests what the loader already read, so the second full read is
  gone and with it the window in which a file could change between validation and use.
- **`documentsToRemove` is module-private.** `reconcileCorpus` is now the only exported operation
  that can delete.
- A parse failure propagates: a corpus that cannot be read is not a corpus that can drive
  deletions. Verified live — an unparseable document refuses the whole run with a full field-level
  diagnosis.

### Finding 2 — no confirmed destructive write can be invisible

`reconcileCorpus` takes an `onRemoved` callback and invokes it **immediately after each
store-confirmed withdrawal**, before attempting the next. The command prints and counts each
removal as it happens. The first failure still propagates, but the operator already has the exact
list of what was withdrawn. A test drives a mid-batch store failure and asserts the earlier
withdrawal was reported before the error arrived.

### Verification

| Check | Result |
|---|---|
| Flag refusals: `--prune` with `--dry-run`, with `--file` | refused, each naming the reason |
| Duplicate canonical URL | refused before any work, naming both files and the URL |
| **New:** an unparseable document | refuses the whole run, naming every faulty field |
| Normal offline dry run | 11/11 documents, 1375 chunks |
| Prune refusal after a failed document | fired on **eight more** live runs this round |
| Store integrity throughout | 1375 chunks, 11 documents, unchanged |
| Composed removal path, live | **still not reached** — see below |

### The instability, correctly diagnosed at last

Eight further full-corpus attempts this round all had at least one document fail, so the removal
branch was never reached. That made the cause worth pinning down properly, and **the round-2
diagnosis above was wrong**.

Probing through the app's own client:

| Probe | Result |
|---|---|
| One batch of 64 inputs, 50 KB, through Node `fetch` | HTTP 200 in ~420ms |
| Batches of 8, 32 and 64 inputs | all HTTP 200; **batch size is not the trigger** |
| 25 sequential 64-input batches, the shape of a full run | **21 succeeded, 4 failed** — a 16% failure rate |

The 503 body is `upstream connect error or disconnect/reset before headers. reset reason:
connection termination` — an **Envoy proxy error from Fireworks' own load balancer failing to
reach its model server**. Not rate limiting: no `Retry-After`, no 429, and failures scattered
randomly across the sequence (requests 1, 2, 10 and 22). Not Cloudflare: a separate 403 seen while
probing with Python `urllib` was a Cloudflare browser-integrity block on that client and is
unrelated to what the app sees.

**Why this matters for the remedy.** The failures are *fast* — 100 to 280ms, before any work — and
*independent*. A full run sends roughly 22 batches, so at a 16% per-batch failure rate the chance
of a completely clean run is about **2%**, which is exactly why eight and then eleven attempts
never produced one. A bounded retry of three attempts would take a batch's failure probability to
about 0.4% and a full run's to roughly **8%** — turning an effectively unachievable clean run into
a routine one, at a cost of a few hundred milliseconds. **A smaller batch size would not help and
was never the problem.**

## Fixes (2026-09-10, scope addition)

Thomas approved adding the bounded retry mid-close, after round 3's diagnosis showed it was no
longer cosmetic. Gate green at 206 tests; commit `5790459`.

### What was added

`createFireworksEmbedder` retries a batch on **transient** failures only — 5xx, 408 and 429, plus a
transport failure that produced no response at all. Three attempts, backoff doubling from 250ms,
honouring `Retry-After` when the service supplies one. A `4xx` is attempted exactly once, because a
bad key or a malformed request fails identically forever and retrying it turns one clear error into
three. A malformed 200 response is not retried either, for the same reason.

**Retries are announced, never silent.** The embedder calls `onRetry` before each wait and the
operator command prints `retry 1/3 in 250ms — HTTP 503`. A service degrading under the operator is
something they should see even when the run ultimately succeeds. This follows the callback shape
the reviewer approved for reporting removals.

### Demonstrate red — criterion 11

These regressions are the **author's own**: criterion 11 was added after the round-3 design review,
so no reviewer proposed them. Stated rather than presented as ratified.

| Regression | Gate | What failed |
|---|---|---|
| baseline | green | 206 tests |
| retries deterministic 4xx failures too | **red** | `does NOT retry a deterministic failure — a bad key fails once, clearly` |
| retries silently, never reporting | **red** | `reports every retry rather than smoothing the failure over` |
| retries without bound | **red** | `refuses an HTTP failure` — and took 5 seconds to do it, which is the unbounded loop made visible |
| restored | green | 206 tests |

### What it unblocked — every remaining criterion now verified live

The first full-corpus run with the retry in place absorbed **four** transient failures, each printed,
and completed **11/11 documents, 1375 chunks** — the first wholly clean run in three rounds, exactly
as the 2%-to-92% estimate predicted.

The prune cycle that had been unreachable for two rounds then verified end to end:

| Step | Result |
|---|---|
| Prune with the store already matching | `nothing to prune: the store already matches the corpus` — 11/11, 1375 chunks |
| Withdraw `eo-25-09`, then prune | `pruning withdrawn document(s)` then `removed https://www.oregon.gov/gov/eo/eo-25-09.pdf`, summarised `10/10 document(s), 1367 chunks, 1 removed` |
| Restore and re-ingest | `nothing to prune` — back to 11/11 |
| Final store | **1375 chunks, 11 documents, zero duplicates** |

That closes the gap carried since round 2: the composed removal path, and the per-removal reporting
added in round 3, are both now confirmed against the live database rather than resting on unit
tests alone.

*(Two `psql` connection errors appeared mid-sequence — Supabase pooler auth timeouts, unrelated to
the application path. The final counts above were read successfully and confirm the end state.)*

## Codex (glm-latest) approach review — round 4 (2026-09-10, base 012dba3, HEAD 851aacf)

Artifact: `reviews/seed-corpus-ingest.approach.851aacf.json` · round `851aacf` · 15 commands executed, 0 REACH-reported.

**The first attempt was refused and promoted nothing.** The runner reported `final message holds
2 top-level JSON objects ... the reply must be exactly one`, alongside a codex-internal
`exec_command failed: CreateProcess` error. That is the **format** stop, not the fabrication
stop: the review may have been sound and the check could not tell. Recorded here rather than
allowed to read as a clean pass.

**Verdict.** 2026-09-10 17:06:29 PDT — The overall direction is close to what I would build: load and parse the corpus once, ingest those exact bytes, keep deletion inside reconcileCorpus, report each store-confirmed withdrawal immediately, and keep the retry as a small injectable policy rather than adding the OpenAI SDK, whose broad client surface and version coupling would cost more than this one embeddings call justifies. The transient/deterministic split and onRetry reporting are the right shape. I would not ship the destructive invariant as written, though: CompleteCorpus.fromLoaded is a public list-taking constructor, so the claimed unbypassable precondition remains bypassable. The effective Node floor and the retry comment’s copied measurements also need correction.

### BLOCKER

**The destructive precondition still has a public list constructor** — reversibility: one-way · standing: kludgy

- **Locus:** src/lib/ingest/corpus.ts:80-84,105-116; __tests__/corpus-reconcile.test.ts:88-99
- **Claim:** CompleteCorpus.fromLoaded is a public static method on an exported class and accepts an arbitrary LoadedDocument[] list. Any future tool can construct a one-document CompleteCorpus, pass it to reconcileCorpus, and withdraw every other stored document. This directly defeats the round-3 approved fix and contradicts the module’s own claim that loadCompleteCorpus is the only construction path. The test does not catch it: it merely observes that the runtime object has the private of property and that loadCompleteCorpus is a function; it never attempts or rejects fromLoaded.
- **Alternative:** Remove fromLoaded from the public class surface and make the validator/factory module-private, with loadCompleteCorpus constructing the value directly. For a stronger invariant, export CompleteCorpus only as an opaque branded type with a module-private constructor, so reconcileCorpus’s parameter cannot be satisfied by a caller-built list while documentsToRemove remains private.
- **Win:** Closes the one-call partial-corpus deletion bypass, removes an exported destructive API, and makes the compiler enforce the invariant Thomas approved instead of relying on comments and a non-falsifiable test.

### IMPORTANT

**The declared Node floor is below the Supabase client’s own floor** — reversibility: two-way · standing: nonstandard

- **Locus:** package.json:15-21,36-38; package-lock.json:2404-2418; README.md:54-71
- **Claim:** The project advertises Node >=20.12.0, and the prior fix synchronized the lockfile root to that value. But the direct runtime dependency @supabase/supabase-js 2.115.0—and its @supabase/* subpackages—declare Node >=22.0.0. The ingest command imports this client, so Node 20.12 through 21 passes the project’s advertised compatibility floor while running a dependency that says it is unsupported. The previous synchronization fixed root-versus-lock drift, not root-versus-effective-dependency-floor drift.
- **Alternative:** Raise package.json, the regenerated lockfile root, and the README compatibility floor to >=22.0.0; or, if Node 20 support is a real requirement, select a Supabase client version whose engine range supports it. State the chosen effective floor once and keep the pinned .nvmrc separate as the development major.
- **Win:** Makes unsupported runtimes fail or warn at installation rather than during a privileged operator ingest, and restores one honest compatibility contract across the app, manifest, and documentation.

**Retry rationale copies dated counts into living code** — reversibility: two-way · standing: nonstandard

- **Locus:** src/lib/embeddings.ts:25-38
- **Claim:** The retry comment hard-codes the historical sample and derived probabilities—25 batches, 21 successes, 4 failures, 16%, roughly 22 batches, 2%, 0.4%, 92%, and a prose restatement of the attempt count. Code comments are living text under the builder protocol, while these measurements already belong in the dated story record. They will decay as the corpus or service changes and can mislead future tuning. This is a placement defect, not a criticism of the bounded retry policy itself.
- **Alternative:** Keep the code comment to the durable policy: bounded attempts, short exponential backoff, transient-only retries, and reported retries. Point to the dated measurement in reviews/seed-corpus-ingest.md without restating its numbers; leave the numeric parameters in the exported constants.
- **Win:** Removes roughly ten copied numbers from living source, keeps the dated evidence in its single record, and prevents stale service measurements from becoming future operational folklore.

**Claim checks, both confirmed by running them.**

- The BLOCKER is real and was reproduced: a four-line script calling
  `CompleteCorpus.fromLoaded` with **one** caller-supplied entry built a value the type system
  accepts as a complete corpus, which `reconcileCorpus` would then use to withdraw every other
  stored document. The round-3 fix is defeated by the very method added to wire it up, and the
  test written to guard it asserts only that a property name exists — it never attempts the
  bypass, so it could never have failed.
- The Node floor claim is confirmed: the project declares `>=20.12.0` while
  `@supabase/supabase-js` and all six of its subpackages declare `>=22.0.0`.
