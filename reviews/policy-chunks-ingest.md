Date: 2026-09-04 · Branch: claude/policy-chunks-ingest · Status: approved · Class: deployed

# policy-chunks-ingest — schema, retrieval function, and the ingestion pipeline (story 1a)

## Problem

User Story 1 of `v-tina-user-stories.md` is the first workstream in the spec's execution order:
every later workstream reads what it produces. It has two halves with different costs. The
**code** — a `policy_chunks` table with a vector column, a similarity-search function, a
frontmatter parser, a chunker, an embedding call, and the pipeline that strings them together —
is unit-testable with no network. The **data** — the actual set of Governor Kotek's executive
files, gathered as markdown with metadata — is a content decision Thomas has not yet made, and
running it through the pipeline needs the hosted Supabase project and a Fireworks key.

Decided 2026-09-04: split the story. **This is story 1a: the schema and the code, proven with a
small fixture corpus and no network, plus the migration applied to the hosted project.** Story 1b
runs real ingestion against the real corpus once it exists.

Two things the foundation story deliberately left for here: the project's first Supabase and
Fireworks code, and the first new dependencies since `zod`. Both are patterns every later
workstream will copy, so their shape is the substance of this story's design review.

## In scope

1. **Schema migration** under `supabase/migrations/`: the `vector` extension, the
   `public.policy_chunks` table carrying chunk text, the source metadata `PolicyChunkSource`
   already declares (title, date, URL, pillar), a chunk ordinal, and a 768-dimensional embedding
   (the dimension of Fireworks' `nomic-embed-text` model the spec names); a cosine similarity
   index; row-level security so the public role can read and only the service role can write.
2. **`match_policy_chunks`** — the SQL function the spec names, taking an embedding, a similarity
   threshold, a result count, and an optional pillar, returning chunks with their similarity,
   most similar first.
3. **`src/lib/supabase.ts`** — the `queryPolicyChunks(embedding, matchThreshold, matchCount,
   pillar?)` boundary function the spec's agent contract names, returning
   `RetrievedPolicyChunk[]`, built on `@supabase/supabase-js`.
4. **Ingestion code** under `src/lib/ingest/`: frontmatter parsing with every field validated,
   chunking into 500–1000 character sections, an embedding call to Fireworks, and the pipeline
   that embeds and stores a parsed document. Every stage is a pure function or takes its I/O as
   an injected dependency, so the unit suite exercises the whole pipeline with fakes.
5. **A fixture corpus** under `__tests__/fixtures/` — two or three short, clearly synthetic
   markdown documents with real-shaped metadata — for the unit suite. This is **not** the corpus.
6. **Dependencies**: `@supabase/supabase-js` (runtime) and the Supabase CLI (`supabase`, dev),
   plus whatever the design review settles for frontmatter parsing (Open question 1).
7. **The migration applied to Thomas's hosted Supabase project** through the CLI, and the SQL
   function exercised there with synthetic vectors to confirm ordering, threshold and pillar
   filtering behave.
8. README: how migrations are applied, and which credentials live where.

## Non-goals

- **The real corpus, and ingesting it.** Story 1b. Which documents, from where, and in what
  form is Thomas's decision and has not been made.
- **`@supabase/ssr`.** It exists for cookie-based user sessions; V-Tina has no user accounts.
- **A local Supabase stack (Docker).** Decided 2026-09-04: hosted-only for now.
- **The `/api/chat` route, prompts, UI, and the stress-test runner** — later workstreams.
- **Integration tests against the hosted project in the gate or CI.** The gate stays
  network-free; the hosted checks here are manual.
- **A public `/api/ingest` HTTP endpoint** — see Open question 2. Nothing in this story exposes
  ingestion over HTTP.

## Acceptance criteria

Criteria 1–4 and 6 are observable by a person using the pipeline or the database; 5 and 7–11 are
workflow bookkeeping and stay as numbered property assertions, per `AGENTS.md`. *(Amended
2026-09-07 at the step-7 consult: criterion 5 was a scenario whose fake-client oracle could not
falsify its ordering, threshold and filter claims — reviewer finding 3 — so it was narrowed to the
forwarding-and-mapping property and those claims moved to criterion 6, where the hosted database
judges them. Criteria 1–3 and 6 also gained the document-kind and as-of ordering Thomas added at
door 3, and criterion 11 was added for the allowlist documentation he required.)*

1. **Given** a markdown document whose YAML frontmatter carries a document title, an as-of date,
   a URL on an allowed official domain, a policy pillar, and a document kind,
   **When** the ingestion parser processes it,
   **Then** it yields the document's chunks in document order, every chunk between 500 and 1000
   characters long except the final one, which may be shorter, each chunk carrying the complete
   source metadata, and no text from the document is lost or duplicated across the chunks.

2. **Given** a markdown document whose frontmatter is absent, or is missing a required field, or
   carries a malformed value (a date that is not a date, a URL without its scheme, a URL whose
   host is not on the allowed official domains, a document kind outside the declared set),
   **When** the ingestion parser processes it,
   **Then** the document is refused with an error naming every field at fault, and nothing is
   embedded or stored.

3. **Given** a parsed document and a working embedding service and store,
   **When** the pipeline ingests it,
   **Then** every chunk is embedded exactly once and stored with its embedding, its metadata and
   its ordinal, the document's chunks are stored as one document-scoped replacement rather than
   row by row, and the count the pipeline reports is the count the store confirmed.

4. **Given** a parsed document and an embedding service or store that fails part-way,
   **When** the pipeline ingests it,
   **Then** the failure surfaces as an error to the caller, and the pipeline does not report the
   document as ingested.

5. The retrieval boundary function passes the query embedding, threshold, count and optional
   pillar to `match_policy_chunks` by name, omits the pillar rather than sending an empty value
   when none is given, and maps every returned row to a `RetrievedPolicyChunk` carrying its
   similarity and complete source metadata. The ordering, threshold, count and filter guarantees
   are the database's and are judged by criterion 6.

6. **Given** the migration applied to the hosted Supabase project and rows inserted with
   synthetic embeddings,
   **When** `match_policy_chunks` is called from the SQL editor with a synthetic query vector,
   **Then** the rows come back most similar first, with ties broken by document kind (executive
   before legislative) and then by the most recent as-of date, none below the threshold, no more
   than the requested count, and filtered to the pillar when one is given,
   **And** a request for more rows than the documented maximum, or a threshold outside its valid
   range, is refused rather than served,
   **And** the retrieval boundary function called from a script holding only the public key
   returns those same rows in that same order,
   **And** replacing a document with a shorter set of chunks leaves no chunk of the old set behind,
   **And** a caller holding only the public key can read rows but cannot insert, update or delete.

7. The embedding dimension the schema declares equals the dimension the embedding code declares,
   with one declared constant as the source of both.

8. `package.json` gains `@supabase/supabase-js` as a runtime dependency and `supabase` as a dev
   dependency, and does not gain `@supabase/ssr`.

9. Every environment variable the ingestion and retrieval code reads is already declared in
   `src/lib/env.ts`, so `.env.example` needs no new key. (The CLI's database password is not an
   application variable and is documented in the README, not the env contract.)

10. Scope containment: run
    `git diff --name-only main...HEAD -- . ':(exclude)reviews/'`
    and verify no files appear beyond `supabase/` (its `config.toml`, `.gitignore` and
    `migrations/`), `src/lib/supabase.ts`, `src/lib/embeddings.ts`, `src/lib/ingest/`,
    `src/types/index.ts`, `__tests__/`, `package.json`, `package-lock.json`, `.gitignore`, and
    `README.md`.

11. The README lists the allowed official source domains, and that list equals the allowlist
    the ingestion code enforces, so the public-facing documentation, the operator instructions
    and the code cannot disagree.

## Test notes

| AC | Oracle mode | Mechanism |
|---|---|---|
| 1 | `Small` | Unit tests over the parser and chunker with the fixture corpus: assert every chunk's length is in range except the last, that concatenating the chunks reproduces the document body exactly (no loss, no duplication), that ordinals are contiguous from zero, that every chunk's `source` equals the frontmatter including kind and as-of date, and that chunks end on paragraph boundaries wherever a paragraph fits. Includes the empty case: a body shorter than 500 characters yields exactly one chunk, and an empty body is refused. |
| 2 | `Small` | Unit tests with fabricated documents: one per required field missing, one per malformed value (including a well-formed URL on a host outside the allowlist), and the no-frontmatter case. The error must name exactly the faulty fields in one throw, checked by asserting the set of named fields equals the expected set, not by matching a message string. A fake store and fake embedder assert they were never called. |
| 3 | `Small` | Unit test with a recording fake embedder and a recording fake store: the embedder receives each chunk's text exactly once, the store receives exactly one replace call carrying one row per chunk with the embedding the fake returned for that text, and the reported count is the count the fake store confirmed — a fake confirming fewer rows than it was given must surface as an error, not be masked by the chunk count. |
| 4 | `Small` | Unit tests where the fake embedder rejects on the second call, and separately the fake store rejects: the pipeline's promise rejects with that error (never a resolved value carrying an error field), and the store was called either once with the full row set or not at all — never with a partial set. |
| 5 | `Small` | Unit test with a fake Supabase client that records the RPC name and arguments and returns fabricated rows: assert the four parameters reach the function by name, that the optional pillar is omitted rather than sent as an empty string when not given, and that each returned row maps to a `RetrievedPolicyChunk` with `similarity` and full `source`. This is a mapping test only; it makes no claim about what the database returns. |
| 6 | `manual` | After `supabase db push`, insert rows with hand-written 768-vectors chosen so that similarity order differs from insertion order and from primary-key order, including two rows of equal similarity differing only in kind and two differing only in as-of date; call `match_policy_chunks` with a chosen query vector and read the ordering, count and pillar filter; call it with an over-large count and an out-of-range threshold and confirm both are refused. Run a one-off script using `queryPolicyChunks` with the anon key and confirm the same rows in the same order. Replace one document with fewer chunks and confirm no old ordinal survives. Then, with a client built from the anon key only (never the SQL editor or the service role), attempt an insert and a select and confirm the first is refused and the second succeeds. Cannot be judged locally: it needs the hosted database. |
| 7 | `Small` | A test that reads the migration file, locates the `embedding` column definition of the `policy_chunks` table specifically (not any `vector(N)` token anywhere in the file), and asserts its `N` equals the constant exported by the embedding module. Includes the empty case: the test fails if that column definition is not found at all. The regression where both declarations are changed together to a wrong dimension is out of reach of any network-free test and is caught at story 1b's first live embedding call, where the embedding module refuses a vector of the wrong length. |
| 8 | `Small` | A test over `package.json`: `@supabase/supabase-js` in `dependencies`, `supabase` in `devDependencies`, `@supabase/ssr` in neither, and each of the two present entries carries a version range that names a concrete version (not `*`, `latest` or empty). |
| 9 | `reviewer` | Read every configuration read in the new modules — literal `process.env` references, the `env.ts` accessors, and any dynamic or indexed access to the environment — and confirm each key is declared in `env.ts`. The existing `.env.example` completeness test already fails if `env.ts` grows a key the example does not document. |
| 10 | `reviewer` | Run the enumerated diff command and compare against the listed paths, and read what landed in each allowed directory to confirm it is this story's logic and nothing else's. |
| 11 | `Small` | A test that extracts the domain list from the README section on source documents and compares it both ways against the allowlist constant the parser enforces. The extent comes from the code's constant; the README is the thing under test. Includes the empty case: the test fails if the README section yields no domains at all. |

### Regressions (ratified list — sourced from the step-6 design review)

Proposed by the independent reviewer from the criteria, before any implementation existed.
**Every criterion received at least one; there is no coverage gap.**
Criteria 1–5, 7, 8 and 11 name a size, so step 9 must demonstrate red against their entries here.
**Ratified 2026-09-07 with one amendment**: the first AC7 regression (both declarations changed
together) cannot be driven red by a network-free test; it is recorded as covered by story 1b's
first live embedding call, not by this story's demonstrate-red. The AC5 regression is answered by
the criterion's narrowing at step 7 rather than by a test: the fake-client test no longer claims
the outcomes it could not falsify, and those outcomes now sit under AC6. AC11 was added after the
review, so its regression below is the author's own, stated as such.

**AC1** (oracle: `Small`)

- The chunker cuts every 500 characters regardless of paragraph or sentence boundaries. It satisfies order, length, exact concatenation, metadata, and no loss/duplication, but destroys the coherent policy passages that semantic retrieval is meant to retrieve.

**AC2** (oracle: `Small`)

- The error message includes every field name from the document, including valid ones, or emits a raw parser dump in which the faulty fields merely appear among unrelated noise. The letter 'names every field at fault' is textually satisfied while the intent — a precise diagnosis — is violated.
- URL validation checks only generic URL syntax, so `https://example.com` is accepted because it has a scheme. The document is embedded and stored even though the product's intent is citations to official `oregon.gov` sources.

**AC3** (oracle: `Small`)

- The pipeline returns `chunks.length` as the stored count without checking the store's confirmation. A store that silently inserts only some rows, or returns fewer inserted rows, still leaves the pipeline reporting the full chunk count.

**AC4** (oracle: `Small`)

- The pipeline catches the failure and returns a success-shaped result containing `ok: false` or an error field rather than rejecting. An error is technically surfaced and no ingested count is reported, but callers that only check success cannot be forced to notice the failure.
- The store writes the first chunks before failing, the caller receives an error, but the partial rows remain. The document is not reported as ingested, yet future retrieval can return an incomplete document as though it were valid.

**AC5** (oracle: `Small`)

- The boundary function forwards the correct RPC arguments and maps fabricated rows perfectly, while the actual database function ignores the threshold, pillar, or similarity ordering. The assigned fake-client test passes because it never exercises those outcomes.

**AC6** (oracle: `manual`)

- The manual test uses hand-written vectors so orthogonal or trivially separated that insertion order or primary-key order coincides exactly with similarity order. A function ordering by `id` or `created_at` would still appear to satisfy 'most similar first'.
- The permission check accidentally uses a service-role or SQL-editor owner connection for the insert attempt, so the refusal proves nothing about a caller holding only the public/anon key.

**AC7** (oracle: `Small`)

- *(Amended: covered by story 1b, not demonstrated red here.)* The migration and TypeScript constant are both changed to another dimension, such as 1536. The synchronization test passes because both declarations now agree, even though the selected Fireworks model still emits 768-dimensional vectors.
- The migration check finds `vector(768)` in a comment, example, or unrelated table while `policy_chunks.embedding` uses the wrong dimension. The token is present, so the check passes without validating the actual column.

**AC8** (oracle: `Small`)

- The dependencies are added with `"*"` or another non-pinned range. The package keys satisfy the criterion, but `npx supabase` can resolve a different CLI version on each machine, defeating the version-pinned migration workflow.

**AC9** (oracle: `reviewer`)

- A module reads configuration through a dynamic key such as `process.env[key]`, or through `import.meta.env`, so a reviewer searching only for literal `process.env`, `getNodeEnv`, and `getEdgeEnv` references finds nothing and the criterion passes vacuously.

**AC10** (oracle: `reviewer`)

- Unrelated feature logic or runtime code is placed inside an allowed directory such as `__tests__/` or `src/lib/ingest/`. Every path appears on the allowlist, so the diff command passes while the scope-containment intent is violated.

**AC11** (oracle: `Small`) — *author's own; added after the design review*

- The README lists the domains in prose that the test cannot find, or the test reads the list from the same constant the code reads, so the two "agree" while the README says something else. The test must parse the README's own text and compare it to the constant.

## Step-9 verification (2026-09-07)

### Demonstrate red — criteria 1–4, 7, 8 and 11

Each ratified regression was applied to the committed implementation, the gate run, the failure
observed, and the change reverted. Baseline was green before and after (101 tests).

| Ratified regression | Gate | What failed |
|---|---|---|
| baseline, nothing modified | green | — |
| AC1 — chunker cuts every 500 characters regardless of boundaries | **red** | paragraph-boundary, sentence-end and whitespace-fallback tests |
| AC2 — error names every field, including valid ones | **red** | all five "names only *field* when it is missing" cases and the malformed-value cases |
| AC2 — URL validation accepts any host with a scheme | **red** | the outside-allowlist and both lookalike-host refusals |
| AC3 — pipeline reports the chunk count without checking the store's confirmation | **red** | "reports the count the store confirmed, and refuses a short count" |
| AC4 — failure caught and returned as a success-shaped value | **red** | every rejection test in the pipeline suite |
| AC4 — store written per chunk, partial rows left on failure | **red** | "stores them in one replacement" and "offered it the full row set exactly once" |
| AC7 — `vector(768)` present elsewhere while the column is wrong | **red** | "declares the embedding column with the code's vector dimension" (the function parameter and comment still said 768) |
| AC7 — both declarations changed together | *not demonstrated* | Out of reach of a network-free test, as ratified; caught at story 1b's first live embedding call, where `createFireworksEmbedder` refuses a vector of the wrong length. |
| AC8 — dependency added with an unpinned `*` range | **red** | "adds the supabase CLI as a dev dependency with a pinned range" |
| AC11 — README states the domains in prose the test cannot find | **red** | "lists at least one domain" and "lists every domain the code allows" |
| restored | green | — |

No dead assertions: every ratified regression that names a runnable test drove the gate red. The
AC5 regression has no row because criterion 5 was narrowed at step 7 to what its oracle can
falsify; the outcomes that regression describes now sit under AC6.

### Other criteria

- **AC5 — pass.** Fake-client tests assert the four parameters by name, the omitted pillar, and
  the row mapping; a compile-time check confirms a real `SupabaseClient` satisfies the narrow
  interface the fakes implement.
- **AC6 — pass (manual, hosted project, 2026-09-07).** Migration `20260907154338_policy_chunks`
  pushed with `npx supabase db push`; the remote history lists it. A one-off script (run with
  vitest, deleted afterwards, never committed) exercised the live database through the real
  boundary functions, using the service-role key for writes and the anon key for the public-caller
  checks. Fixtures: five synthetic documents inserted in an order unrelated to similarity, with
  768-vectors chosen so that three rows tie at similarity 0.80 — one legislative dated 2024-05-01,
  one executive dated 2022-02-02, one executive dated 2025-03-03 — plus one at 1.00, one at 0.60
  and one at 0.00.
  - **Ordering and tie-breaks:** query at threshold 0.5, count 10 returned `one#0@1.00`,
    `four#0@0.80` (executive, 2025), `three#0@0.80` (executive, 2022), `two#0@0.80`
    (legislative, 2024), `five#0@0.60`; the 0.00 row was excluded. Similarity first, then
    executive before legislative regardless of date, then newest as-of date — as specified.
  - **Count and pillar:** count 2 returned the first two; pillar `education` returned only
    `four` and `five`; threshold 0.9 returned only `one`.
  - **Guards:** count 51 and count 0 refused naming `match_count`; thresholds 1.5 and -2
    refused naming `match_threshold`; count 50 served.
  - **Public caller:** `queryPolicyChunks` with the anon key returned the same six rows in the
    same order as with the service role.
  - **Shrinking replacement:** replacing document `one` (two chunks) with one chunk left five
    rows in total and no row for its old ordinal 1.
  - **Anon key permissions:** select succeeded; insert returned an error; delete and update
    affected zero rows; calling `replace_document_chunks` returned an error; the table was
    unchanged afterwards.
  - **Cleanup:** every fixture document replaced with an empty set; the table was left empty.
- **AC9 — pass (reviewer).** The new modules read no environment at all: `createSupabaseClient`
  and `createFireworksEmbedder` take their URL and keys as arguments, so the callers (story 1b's
  operator script, the later chat route) build them from `getNodeEnv()` / `getEdgeEnv()`. No
  literal, dynamic or `import.meta.env` access anywhere under `src/lib/ingest/`,
  `src/lib/embeddings.ts` or `src/lib/supabase.ts`.
- **AC10 — pass (reviewer).** `git diff --name-only main...HEAD -- . ':(exclude)reviews/'` lists
  `README.md`, `package.json`, `package-lock.json`, `src/types/index.ts`, `src/lib/embeddings.ts`,
  `src/lib/supabase.ts`, four files under `src/lib/ingest/`, nine test files and three fixtures
  under `__tests__/`, and `supabase/.gitignore`, `supabase/config.toml` and the one migration —
  nothing outside the enumerated paths. `.gitignore` was not needed: the CLI's own
  `supabase/.gitignore` covers its temp directory.

### Build notes

- **Frontmatter keys are the human ones** (`title`, `date`, `url`, `pillar`, `kind`) and are
  mapped to the `PolicyChunkSource` field names; the README's frontmatter reference documents
  them.
- **The embedding travels to SQL as pgvector's text form** (`"[x,y,...]"` inside the JSON row)
  and is cast in `replace_document_chunks`, because `jsonb_to_recordset` cannot populate a
  `vector` column from a JSON array directly.
- **`match_policy_chunks` is `plpgsql`, not `sql`**, so the argument guards can `raise`; the
  pillar parameter is named `filter_pillar` to avoid a plpgsql name clash with the returned
  `pillar` column.
- **`replace_document_chunks` has execute revoked from the public roles** in addition to RLS, so
  the only-the-service-role-writes rule is stated twice, once at each layer.
- **The chunker keeps each paragraph's trailing blank-line separator inside the chunk** so the
  chunks concatenate to exactly the body; the whitespace is harmless to embedding.

## Build note (2026-09-07)

| AC | Where it is satisfied |
|---|---|
| 1 | `src/lib/ingest/parse.ts` (frontmatter → `PolicyChunkSource` + body), `src/lib/ingest/chunk.ts` (500–1000-character chunks, paragraph → sentence → whitespace boundaries, exact concatenation), `src/lib/ingest/pipeline.ts` `prepareDocument`; tests `__tests__/ingest-parse.test.ts`, `__tests__/ingest-chunk.test.ts`; fixtures `__tests__/fixtures/*.md` |
| 2 | `src/lib/ingest/parse.ts` (`DocumentValidationError.invalidFields`, `zod` schema, host allowlist via `src/lib/ingest/metadata.ts`); tests `__tests__/ingest-parse.test.ts`, refusal-before-I/O in `__tests__/ingest-pipeline.test.ts` |
| 3 | `src/lib/ingest/pipeline.ts` `ingestDocument` (one `replaceDocument` call, confirmed count checked); test `__tests__/ingest-pipeline.test.ts` |
| 4 | `src/lib/ingest/pipeline.ts` (errors propagate, no catch); test `__tests__/ingest-pipeline.test.ts` |
| 5 | `src/lib/supabase.ts` `queryPolicyChunks`, `toRetrievedPolicyChunk`, `RpcClient`; test `__tests__/supabase.test.ts` |
| 6 | `supabase/migrations/20260907154338_policy_chunks.sql` (`match_policy_chunks` with guards and tie-break ordering, `replace_document_chunks`, RLS, grants); verified on the hosted project — see Step-9 verification |
| 7 | `src/lib/embeddings.ts` `EMBEDDING_DIMENSIONS`; test `__tests__/migration.test.ts` (also holds `MAX_MATCH_COUNT` and `DOCUMENT_KINDS` equal to the migration) |
| 8 | `package.json`; test `__tests__/dependencies.test.ts` |
| 9 | No environment access in the new modules; clients and the embedder take URL/keys as arguments |
| 10 | Diff confined to the enumerated paths — see Step-9 verification |
| 11 | `README.md` "Allowed source domains"; test `__tests__/readme-sources.test.ts` against `ALLOWED_SOURCE_HOSTS` |

Also: `src/types/index.ts` gains `documentKind` and `chunkIndex`; `src/lib/embeddings.ts` is the Fireworks embedder with injected `fetch` (`__tests__/embeddings.test.ts`); `supabase/config.toml` is the CLI's generated project config.

## Loop record

- frame/6 — ran (codex on glm-latest, 4 findings, 14 regressions) → reviews/policy-chunks-ingest.design.7bd2d96.json
- frame/9 — demonstrated red for every ratified regression on the size-bearing criteria (AC1, AC2 ×2, AC3, AC4 ×2, AC7, AC8, AC11); baseline green, each regression red, restored green. AC5's regression is answered by the criterion's narrowing at step 7, and AC7's first regression is recorded as covered by story 1b, both per the ratified list. AC6 (`manual`) ran against the hosted project on 2026-09-07 after the migration was pushed: all checks passed (see Step-9 verification).
- review/6 — ran (codex on glm-latest, 2 findings) → reviews/policy-chunks-ingest.approach.4dfdeb9.json
- review/8 — not yet reached
- close/3b — not yet reached
- close/4 — not yet reached

## Open questions

**All four resolved at the step-7 consult (2026-09-07):** Q1 = `yaml` + `zod`; Q2 = library
function, no endpoint (an HTTPS ingest endpoint is a *possible* roadmap item, explicitly not
committed); Q3 = (a), extended — every document carries a `documentKind` and an as-of date, and
ties on similarity order kind first, then most recent as-of date; Q4 = as proposed, logged for veto.

1. **Frontmatter parsing: which dependency?** Three candidates. `gray-matter` is the well-known
   markdown-frontmatter package but has had no release since 2021 and pulls in `js-yaml` 3.
   The `yaml` package (actively maintained, YAML 1.2, zero dependencies) parses the block
   between the `---` fences, which is a three-line split; the parsed object is then validated
   with the `zod` schema this project already uses. Hand-rolling a YAML subset is the third
   option and is a false economy the moment a title contains a colon. **Proposed: `yaml` +
   `zod`.** This is a new dependency and a pattern later ingestion work will copy, so it is a
   one-way door for Thomas to ratify.

2. **Ingestion entry point: script or HTTP endpoint?** The spec says "ingestion script/endpoint"
   and Part 3 names `/api/ingest`. An HTTP endpoint on a public site that writes to the
   database needs its own authentication, which nothing in the spec defines; a script run by
   an operator keeps the service-role key on the operator's machine and needs no new auth
   surface. **Proposed: this story delivers the pipeline as a library function; story 1b adds the
   operator script that reads the corpus directory and calls it.** No endpoint. If a remote
   trigger is ever wanted, it is a small story with its own auth decision.

3. **The spec's tie-break needs a field the metadata does not have.** User Story 1 says results
   "must prioritize the Governor's current gubernatorial files over legislative history if
   similarity is tied." Title, date, URL and pillar do not say which a document is. Options:
   **(a)** add a `documentKind` field (`executive` | `legislative`) to `PolicyChunkSource` and
   the schema, required in frontmatter, and order by it as the secondary key; **(b)** infer it
   from the URL path, which couples ranking to oregon.gov's site layout; **(c)** defer the
   tie-break to story 1b when the corpus shows what kinds exist. **Proposed: (a)** — it is a
   data-model decision, cheaper to make before rows exist than after, and it is exactly the
   kind of metadata the verification panel will want to show. One-way door.

4. **Chunk boundaries.** The spec gives a size range and nothing else. Proposed: split on
   paragraph breaks, merge consecutive paragraphs until the chunk would exceed 1000
   characters, and split a single over-long paragraph at the last sentence end or whitespace
   before the limit. Two-way; recorded here so the reviewer can challenge it.

## Design sketch — HOW

- **Migration** — one SQL file created with `supabase migration new`, so it carries the CLI's
  timestamp naming. `create extension if not exists vector`; `policy_chunks` with `id uuid
  default gen_random_uuid()`, `content text`, `document_title text`, `document_date date`,
  `url text`, `pillar text`, `chunk_index int`, `embedding vector(768)`, `created_at`, and a
  unique constraint on `(url, chunk_index)` so re-ingesting a document upserts rather than
  duplicates, plus `document_kind text` constrained to the declared set. An **HNSW** index with
  `vector_cosine_ops` (pgvector's current recommendation: no training step, better recall than
  IVFFlat at this scale). `match_policy_chunks` as a `plpgsql stable` function that first guards
  its arguments — `match_count` between 1 and a documented maximum, `match_threshold` finite and
  within [-1, 1] — then filters `1 - (embedding <=> query) > threshold`, optional pillar via
  `pillar is null or p.pillar = pillar`, ordered by similarity desc, then kind (executive before
  legislative), then `document_date` desc, limited to the count. **`replace_document_chunks(url,
  rows jsonb)`** — a second function, `security definer` is *not* used; it runs as the caller, so
  only the service role can execute it in practice — deletes the URL's existing rows and inserts
  the new set inside one transaction (a function body is one transaction), answering finding 1.
  RLS enabled; a `select` policy for `anon` and `authenticated`; no insert/update/delete policy,
  so only the service role (which bypasses RLS) can write. *(Amended 2026-09-07 per findings 1
  and 2 and door 3.)*
- **Document kinds** — `DOCUMENT_KINDS = ["executive", "legislative"] as const` in a runtime
  module (the barrel stays declaration-only, as the foundation story settled), the type derived
  from it; `PolicyChunkSource` gains `documentKind`. The existing `date` field is the **as-of
  date**: the date the content is current as of (an order's signing date; a revised page's last
  revision). One date per document, documented in the README's frontmatter reference.
- **Embedding dimension** — `EMBEDDING_DIMENSIONS = 768` and the model id exported from
  `src/lib/embeddings.ts`; the migration is checked against the constant (AC 7).
- **`src/lib/supabase.ts`** — a client factory taking URL and key explicitly (no module-level
  singleton reading `process.env`, so tests inject a fake and the Edge route later builds its own
  from `getEdgeEnv()`), and `queryPolicyChunks` calling `.rpc("match_policy_chunks", {...})` and
  mapping rows to `RetrievedPolicyChunk`. The row-to-chunk mapping is one function, unit-tested.
- **`src/lib/embeddings.ts`** — `embedTexts(texts, deps)` against Fireworks' OpenAI-compatible
  embeddings endpoint, `fetch` injected for tests, returning `number[][]`, refusing a response
  whose vectors are not `EMBEDDING_DIMENSIONS` long. The response shape is validated with `zod`
  rather than trusted.
- **`src/lib/ingest/`** — `parse.ts` (fence split, `yaml` parse, `zod` frontmatter schema
  reusing the URL and date validation idioms from `env.ts`, with the URL host checked against
  **`ALLOWED_SOURCE_HOSTS`** — one exported constant seeded with `oregon.gov` and
  `oregonlegislature.gov`, subdomains included, which the README's source-documents section
  lists and AC 11 holds equal; throws one error naming every bad field, the
  `EnvValidationError` shape), `chunk.ts` (pure: body string → ordered chunk strings per Open
  question 4), `pipeline.ts` (`ingestDocument(markdown, { embed, store })`: parse → chunk →
  embed → store, where `store` is an interface with one **`replaceDocument(url, rows)`** method
  returning the confirmed row count, whose Supabase implementation in `supabase.ts` calls the
  `replace_document_chunks` function). Errors propagate; nothing is caught and logged. *(Amended
  2026-09-07 per findings 1 and 4.)*
- **Fixtures** — `__tests__/fixtures/*.md`, synthetic bodies long enough to produce several
  chunks, frontmatter shaped like the real thing.
- **CLI** — `supabase` as a devDependency so `npx supabase` is version-pinned per project;
  `supabase init` generates `supabase/config.toml`; pushes use `SUPABASE_DB_PASSWORD` from the
  operator's shell, documented in the README, never in `env.ts`.
- **Cross-cutting patterns this sets**: I/O injected as dependencies (no module singletons);
  external responses validated with `zod`; errors that name every fault at once; SQL owns
  ranking, TypeScript owns mapping.

## Design decisions (2026-09-07)

Thomas's disposition at the step-7 consult. The approved shape is binding on step 9.

- **Scope: APPROVED as written** — "scope is good".
- **Door 1 — dependencies** (one-way): **RATIFIED** — `@supabase/supabase-js`, `supabase` (dev),
  and `yaml` for frontmatter.
- **Door 2 — ingestion entry point** (one-way): **RATIFIED as a library function.** Thomas: an
  HTTP(S) ingest endpoint is "a possible roadmap feature, NOT committed."
- **Door 3 — document metadata** (one-way): **RATIFIED and extended.** Thomas: "we should have
  some clear metadata on every document including document-kind to support prioritization of
  sources, and an as-of date to prefer recent over older content of the same rank." Ordering is
  therefore similarity, then kind, then most recent as-of date.
- **Finding 1 — stale chunks on re-ingest** (IMPORTANT, one-way, kludgy): **FIX** — document-scoped
  transactional replacement.
- **Finding 2 — unguarded public search function** (IMPORTANT, one-way, nonstandard): **FIX** —
  count and threshold validated inside the SQL function with a documented maximum.
- **Finding 3 — criterion 5's oracle** (IMPORTANT, two-way, nonstandard): **FIX** — criterion 5
  narrowed to forwarding and mapping; the database guarantees moved to criterion 6.
- **Finding 4 — source domain allowlist** (IMPORTANT, two-way, nonstandard): **FIX**, with
  Thomas's added requirement: the allowlist must be "documented in public facing docs as well as
  instructions and code" — criterion 11 and its test hold the README equal to the constant.
- **Chunk boundaries** (two-way): logged, no veto.
- **Regression list:** all 14 **ratified** ("bless the regressions"), with the AC7 amendment
  recorded above in Test notes.

## Codex (glm-latest) design review (2026-09-04)

Artifact: `reviews/policy-chunks-ingest.design.7bd2d96.json` · round `7bd2d96` · 3 commands executed, 0 REACH-reported.

**Verdict.** 2026-09-04 10:59:28 PDT — The overall shape is sound and modern: `yaml` plus `zod` avoids a hand-rolled YAML subset, injected I/O makes the pipeline testable without network access, SQL owns ranking, HNSW is the appropriate pgvector index family at this scale, and RLS with no write policies gives the intended public-read/service-role-write split. Before build, make re-ingestion document-atomic rather than a row-level upsert alone, put argument guards on the publicly callable SQL function, and enforce the official Oregon domain in the single frontmatter schema. The main oracle problem is AC 5: a fake Supabase client can prove parameter forwarding and row mapping, but it cannot falsify the ordering, threshold, count, or pillar-filter guarantees that the criterion asserts.

### IMPORTANT

**Row-level upserts do not make document ingestion idempotent** — reversibility: one-way · standing: kludgy

- **Locus:** Design sketch — Migration unique constraint and `src/lib/ingest/pipeline.ts` store interface
- **Claim:** The proposed `unique(url, chunk_index)` plus `store.upsert(rows)` handles unchanged or growing documents, but not a revised document with fewer chunks: the old higher-ordinal rows remain and remain retrievable. The same happens if document content changes while retaining its URL. The store interface has only `upsert(rows)`, so it cannot express deletion of stale rows, and this becomes the ingestion pattern later stories copy. A caller can therefore see a successful ingest while the database still contains chunks that no longer exist in the source document.
- **Alternative:** Make the store operation document-scoped and transactional, such as `replaceDocument(source, rows)` backed by one SQL RPC that deletes the existing rows for the URL and inserts the complete new set in the same transaction. Alternatively, model documents in their own table and replace child chunks transactionally.
- **Win:** Eliminates the stale-row failure class and centralizes the invariant that the database contains exactly the current chunks for each ingested document.

**The public SQL function needs argument guards** — reversibility: one-way · standing: nonstandard

- **Locus:** Design sketch — `match_policy_chunks` migration
- **Claim:** `match_policy_chunks` is callable by the public/anon role and accepts an arbitrary result count and threshold. TypeScript validation in `queryPolicyChunks` does not protect the database when the function is called directly through PostgREST or the SQL editor. A huge count can force an unnecessarily large vector scan and response, and an out-of-range or non-finite threshold can produce nonsensical behavior rather than a clear rejection.
- **Alternative:** Validate the arguments inside `match_policy_chunks` or a thin PL/pgSQL wrapper: require `match_count` between 1 and a documented maximum, require the cosine threshold to be finite and within [-1, 1], and then run the existing SQL query. Keep any TypeScript validation as an additional boundary check, not the only guard.
- **Win:** Removes an unbounded public-resource-consumption path and puts the public contract's invariant where direct callers cannot bypass it.

**AC 5's Small oracle cannot falsify its main guarantees** — reversibility: two-way · standing: nonstandard

- **Locus:** Test notes — AC 5
- **Claim:** The assigned mechanism asserts the RPC name and arguments and maps fabricated rows. That is an implementation-shape check: it can pass while the actual database returns rows out of similarity order, below the threshold, beyond the count, or from the wrong pillar. AC 6 covers the SQL function manually, but AC 5 still claims those outcomes for the caller-facing boundary, so its named oracle cannot fail for most of its `Then`.
- **Alternative:** Split the criterion honestly: make the parameter-forwarding and row-mapping property a separate Small/bookkeeping assertion, and exercise the caller-facing behavior through the same hosted synthetic-vector check as AC 6, or mark AC 5 `manual` and call the real `queryPolicyChunks` there. Keep the fake-client test only as a supplementary mapping test.
- **Win:** No acceptance criterion claims an observable outcome that its oracle cannot falsify; mapping and SQL semantics are tested independently rather than giving false coverage to the latter.

**Frontmatter URL validation does not enforce the official source domain** — reversibility: two-way · standing: nonstandard

- **Locus:** Design sketch — `src/lib/ingest/parse.ts` frontmatter schema
- **Claim:** A generic `z.string().url()` rejects scheme-less strings but accepts any host, such as `https://example.com`. The product's grounding and verification intent is specifically official `oregon.gov` sources, so an accidentally mis-tagged fixture or corpus entry could be embedded, stored, and later presented as a verifiable official citation.
- **Alternative:** Add one declarative domain rule to the URL schema: require `https:`, and allow only `oregon.gov` or a subdomain such as `www.oregon.gov` / `governor.oregon.gov`. Throw the same all-invalid-fields error when the host is wrong.
- **Win:** Prevents unofficial citations at ingestion with one centralized invariant, avoiding later UI or QA workarounds after rows already exist.

## Codex (glm-latest) approach review (2026-09-07, base main, HEAD 4dfdeb9)

Artifact: `reviews/policy-chunks-ingest.approach.4dfdeb9.json` · round `4dfdeb9` · 6 commands executed, 0 REACH-reported.

**Verdict.** 2026-09-07 10:33:46 PDT — The overall shape is sound and close to what I would build: yaml plus zod for frontmatter, injected I/O throughout, SQL owning ranking and argument guards, a transactional document replacement, and public-read/service-role-write separation are all the right choices. I would change the retrieval SQL so the HNSW index is actually usable, and remove the redundant URL index. No other higher-leverage shape concerns.

### IMPORTANT

**The retrieval SQL is written in a form the HNSW index cannot serve** — reversibility: two-way · standing: nonstandard

- **Locus:** supabase/migrations/20260907154338_policy_chunks.sql:33-103
- **Claim:** The migration creates an HNSW index on embedding with vector_cosine_ops, but match_policy_chunks filters on 1 - (embedding <=> query_embedding) > match_threshold and orders by the inverse-expression alias similarity, followed by tie-break keys. pgvector's index path is matched by the raw distance operator expression, not an arithmetic wrapper around it, so the declared index is decorative and public retrieval will scan and sort the table instead. This undermines User Story 1's fast-semantic-lookup requirement as the real corpus grows, while the database still pays for HNSW maintenance on every replacement.
- **Alternative:** Express the threshold as p.embedding <=> query_embedding < 1 - match_threshold and make the first ORDER BY key the raw p.embedding <=> query_embedding expression, with kind/date/chunk tie-breaks after it; if the secondary keys still prevent an index plan, use an indexed nearest-neighbor candidate CTE and then apply the exact tie-break sort. Verify the hosted plan with EXPLAIN ANALYZE before merge or in story 1b.
- **Win:** Makes the HNSW index actually serve retrieval, keeping query latency bounded as the corpus grows instead of paying index maintenance cost for no read benefit.

### NIT

**The standalone URL index duplicates the unique constraint's prefix** — reversibility: two-way · standing: kludgy

- **Locus:** supabase/migrations/20260907154338_policy_chunks.sql:27-36
- **Claim:** The unique (url, chunk_index) constraint already creates a B-tree index whose leading url column supports both replace_document_chunks' delete by URL and any URL equality lookup. The separate policy_chunks_url_idx duplicates that prefix and adds storage plus write amplification on every document replacement.
- **Alternative:** Drop policy_chunks_url_idx and rely on the unique constraint's composite index for URL access.
- **Win:** Removes one redundant index, reducing ingestion write cost and schema surface without losing any query path.
