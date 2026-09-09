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
   `src/lib/supabase.ts`, `scripts/ingest-corpus.ts`, `__tests__/`, `package.json`,
   `package-lock.json`, and `README.md`. *(`src/lib/ingest/corpus.ts` was added during
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

## Loop record

- frame/6 — ran (codex on glm-latest, 3 findings, 9 regressions) → reviews/seed-corpus-ingest.design.c246570.json
- frame/9 — demonstrated red for every ratified regression on the size-bearing criteria (AC1, AC6, AC7) and for the added AC10; baseline green, each regression red, restored green. AC2 faithfulness verified by hand; AC3, AC4 and AC5 verified live against the hosted project after Thomas supplied a working Fireworks key. AC5 failed first at the specification's 0.7 threshold and passes at the measured 0.73 he adopted.
- review/6 — round 2: ran (codex on glm-latest, 3 findings) → reviews/seed-corpus-ingest.approach.ec832be.json
- review/8 — n/a — the approach gate short-circuited round 2: Thomas approved three shape-changing fixes, so the correctness pass does not run on a shape that is about to change.
- close/3b — no activation (no guard-hook block and no `review_runner.py` refusal to promote this session; the round's REACH line was a reported-not-fatal false positive, which is the documented behaviour of an over-inclusive check rather than a novel finding. This repo has no `install.sh` to drift-check, no `BACKLOG.md` and no `.aar/` register.)
- close/4 — presented: re-review only. Both approved fixes were approach/redesign changes, so per the loop's fork rule merge is not offered this round; the branch returns to `/review` for a fresh approach pass on the new shape.

**Earlier rounds of this story** (kept as prose: the record holds one line per step by design):

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
