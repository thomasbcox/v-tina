Date: 2026-09-08 · Branch: claude/seed-corpus-ingest · Status: proposed · Class: deployed

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
2. **A provenance manifest** — `corpus/MANIFEST.md`: one row per document giving its file, title,
   source URL, the date retrieved, and the SHA-256 of the source file as retrieved, so anyone can
   re-fetch and check what was read.
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
   **Then** the chunks returned are topically relevant to the question, each carries a source URL
   that resolves to the official document, and a question about a pillar absent from the seed
   returns nothing rather than an unrelated chunk.

6. The declared pillar list is a single runtime constant; every corpus document's pillar is a
   member of it; and the README documents that same list, equal in both directions.

7. Every committed corpus document appears in `corpus/MANIFEST.md` with a source URL and a
   retrieval date, and every manifest row names a committed document — equal in both directions.

8. The ingest script reads configuration only through `src/lib/env.ts`'s accessors, so it needs no
   environment variable that is not already declared and documented.

9. Scope containment: run
   `git diff --name-only main...HEAD -- . ':(exclude)reviews/'`
   and verify no files appear beyond `corpus/`, `src/lib/ingest/pillars.ts`,
   `src/lib/ingest/parse.ts`, `scripts/ingest-corpus.ts`, `__tests__/`, `package.json`,
   `package-lock.json`, and `README.md`.

## Test notes

| AC | Oracle mode | Mechanism |
|---|---|---|
| 1 | `Small` | A test that reads **every** `.md` file in `corpus/` — the extent comes from the directory, not a typed list, so a document added without validating fails without editing the test — and runs the real `parseDocument` over each. Asserts acceptance, pillar membership, host membership, and that the union of pillars equals the declared list while the union of kinds equals both declared kinds. Includes the empty case: the test fails if the directory yields no documents at all. |
| 2 | `manual` | Per document, open the official source named in the manifest and compare against the committed markdown: the four metadata fields, then the body read through for dropped, duplicated or reordered passages and for extraction artifacts (page furniture, joined or split words, mangled ligatures, lost list structure). **No automated oracle can judge faithfulness to a source PDF** — a checksum proves what was downloaded, not what the extraction produced — so this is a person reading, recorded per document in the story file with what was compared and what was found. |
| 3 | `manual` | Run the command against the hosted project with the real corpus. Read the reported per-document counts and total, and confirm the total equals the row count in the database. Then force a failure (a deliberately malformed document in a scratch copy of the corpus) and confirm a non-zero exit naming that document. Cannot be judged locally: it needs live Fireworks and Supabase. |
| 4 | `manual` | Record the row count after the first run, run the command again unchanged, and confirm the count is identical and that no `(url, chunk_index)` pair appears twice. |
| 5 | `manual` | Embed several real questions whose answers are in the seed (one per pillar), retrieve, and read the returned chunks for topical relevance and correct citation. **Relevance is a human judgment and is named as one rather than dressed up as an assertion.** Includes the negative case: a question about a pillar absent from the seed must return nothing at the production threshold, not a loosely related chunk. |
| 6 | `Small` | Two comparisons, both directions: every corpus document's pillar against the constant, and the README's documented list against the constant, parsed from the README's own text rather than read from the constant it is compared to. Includes the empty case: the test fails if the README section yields no pillars. |
| 7 | `Small` | Compare the set of `.md` files in `corpus/` against the set of rows parsed from `MANIFEST.md`, in both directions, and assert each row carries a source URL and a retrieval date. The extents come from the directory and the manifest, never from one another. Includes the empty case: the test fails if the manifest parses to no rows. |
| 8 | `reviewer` | Read every configuration read in the script — literal `process.env`, the `env.ts` accessors, and any dynamic or indexed access — and confirm each key is already declared. The existing `.env.example` completeness test fails if `env.ts` grows an undocumented key. |
| 9 | `reviewer` | Run the enumerated diff command and compare against the listed paths, and read what landed in each allowed directory to confirm it is this story's work and nothing else's. |

## Loop record

- frame/6 — not yet reached
- frame/9 — not yet reached
- review/6 — not yet reached
- review/8 — not yet reached
- close/3b — not yet reached
- close/4 — not yet reached

## Open questions

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
- **`corpus/MANIFEST.md`** — a markdown table: file, title, source URL, retrieved date, SHA-256 of
  the retrieved source file. The checksum records **what was downloaded**, honestly not a stable
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
