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
   production similarity threshold of 0.7 that the specification names, rather than an unrelated
   chunk. *(Amended at the step-7 consult, per design finding 3: the original wording asked for a
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
   `src/lib/ingest/pillars.ts`, `src/lib/ingest/parse.ts`, `scripts/ingest-corpus.ts`,
   `__tests__/`, `package.json`, `package-lock.json`, and `README.md`.

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

## Loop record

- frame/6 — ran (codex on glm-latest, 3 findings, 9 regressions) → reviews/seed-corpus-ingest.design.c246570.json
- frame/9 — not yet reached
- review/6 — not yet reached
- review/8 — not yet reached
- close/3b — not yet reached
- close/4 — not yet reached

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
