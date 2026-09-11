# v-tina

v-tina is the repository for **V-Tina**, a planned public-facing chat application that answers
questions about Oregon executive policy. It is designed as an openly-labelled *virtual AI
avatar* — not an official government service and not a real person — that grounds every answer
in retrieval over official source documents and links each claim back to its `oregon.gov`
original, so a reader can verify it directly.

## Status

**Foundation and the retrieval store are in place; no user-facing feature yet.** The repository
holds the Next.js skeleton, the shared boundary types, startup environment validation, the gate
and CI (story `technology-foundation`), and the vector schema plus the ingestion pipeline (story
`policy-chunks-ingest`). The pipeline is proven against a synthetic fixture corpus; the real
corpus and its ingestion are the next story. Everything under *Intended stack* not named here is
still planned, not built.

## Purpose

The full specification — agent roles, interface contracts, five user stories, and their
acceptance criteria — is committed here:

**[v-tina-user-stories.md](v-tina-user-stories.md)**

It covers the vector database and ingestion pipeline, request orchestration and safety
filtering, prompt and linguistic styling, the transparent verification UI, and the diagnostic
test suite.

## Intended stack

- **Next.js** with **TypeScript**
- **Tailwind CSS**
- **Supabase** (PostgreSQL + `pgvector`) for semantic retrieval
- **Vercel** for deployment
- **Fireworks** for embeddings and inference

## Repository map

| Path | What it is |
|---|---|
| [v-tina-user-stories.md](v-tina-user-stories.md) | The product specification and user stories |
| `supabase/migrations/` | The database schema, applied with the Supabase CLI (see *Database*) |
| `src/lib/ingest/` | The ingestion pipeline: frontmatter parsing, chunking, and the store interface |
| `src/lib/embeddings.ts` | Fireworks embeddings, and the one declared vector dimension |
| `src/lib/supabase.ts` | Retrieval (`queryPolicyChunks`) and the Supabase-backed chunk store |
| `__tests__/fixtures/` | Synthetic source documents for the unit suite — **not** the corpus |
| `AGENTS.md` | Repo-local reviewer guidance |
| `reviews/` | Story specifications and review artifacts |
| `.claude/workflow.json` | Configuration for the review workflow |

Acceptance criteria for product behaviour are written as numbered Given/When/Then prose;
workflow bookkeeping criteria stay as numbered property assertions. See `AGENTS.md`.

## Node version

One source of truth, read by everything:

| Where | What it reads |
|---|---|
| Local development | `.nvmrc` — run `nvm use` in the repository root |
| CI (GitHub Actions) | `.nvmrc`, via `setup-node`'s `node-version-file` |
| Compatibility floor | `package.json` `engines.node` (`>=22.0.0`) |

`.nvmrc` pins the **major**, so a patch upgrade does not desynchronise local from CI while a major
change stays an explicit decision. Change the version in `.nvmrc`; CI follows it automatically.

`engines.node` is a separate, hand-maintained declaration — it is the floor npm warns against, not
a copy of the pin. It is set by the strictest floor the
dependencies actually require: `@supabase/supabase-js` and its subpackages declare `>=22.0.0`, so
anything lower would advertise a compatibility this project cannot honour. Next.js asks only for
`>=20.9.0`, and `process.loadEnvFile` in the ingest script needs `>=20.12.0`; both are below the
Supabase floor, so it governs. **Nothing checks that the two agree**: the test that compared them was removed
along with the version-comparison dependency it needed. If you lower `.nvmrc` below the
`engines.node` floor, no tooling will object, so keep them consistent by hand.

The deployment story must confirm the host offers this major and move `.nvmrc` if not — that is
the one place a change is needed.

## The gate

`npm run gate` runs three checks and reports **all** of them before exiting:

- `typecheck` — `tsc --noEmit`
- `lint` — `eslint`
- `test` — `vitest run`

It deliberately does not chain them with `&&`: a failing first check would otherwise hide the
state of the other two. CI runs this same script rather than restating the checks, so the local
gate and the CI check cannot become different things.

## Source documents

V-Tina answers only from official documents it has ingested, and every chunk it stores carries
the metadata needed to cite its source. Documents are markdown files with a YAML frontmatter
block; the ingestion pipeline refuses any document whose metadata is incomplete or malformed,
naming every field at fault.

### Allowed source domains

A document's URL must be on one of these domains or a subdomain of one, over `https`. This is the
same list the code enforces (`ALLOWED_SOURCE_HOSTS` in `src/lib/ingest/metadata.ts`); a test
holds the two equal, so this section cannot drift from what ingestion actually accepts. Extend the
list in the code when the corpus needs another official domain, and this section with it.

- `oregon.gov`
- `oregonlegislature.gov`

### Policy pillars

Every document belongs to exactly one pillar, and retrieval can filter by it. These are Governor
Kotek's three stated priorities. This is the same list the code declares (`POLICY_PILLARS` in
`src/lib/ingest/pillars.ts`) and a test holds the two equal, so this section cannot drift from what
ingestion accepts. Adding a pillar means editing the constant and this section together.

- `housing-and-homelessness`
- `behavioral-health`
- `education`

### Frontmatter reference

Every document carries all five fields. Ties on retrieval similarity are broken by `kind` (an
executive document outranks legislative history) and then by `date`, most recent first.

| Field | Meaning |
|---|---|
| `title` | The document's title as it should appear in a citation, e.g. `EO 23-02` |
| `date` | The **as-of date**, `YYYY-MM-DD`: the date the content is current as of — an order's signing date, a revised page's last revision |
| `url` | The document's canonical URL on an allowed domain |
| `pillar` | One of the policy pillars listed above |
| `kind` | `executive` (the Governor's own files) or `legislative` (bills, legislative history) |

```markdown
---
title: "EO 23-02"
date: 2023-01-10
url: https://www.oregon.gov/gov/eo/eo-23-02.pdf
pillar: housing
kind: executive
---

Document text...
```

The body is split into chunks of 500–1000 characters, preferring paragraph breaks, then sentence
ends, so that each chunk is a coherent passage. Re-ingesting a document replaces all of its chunks
in one transaction: the database never keeps a stale tail from an earlier, longer version.
Replacing a document with an empty set of chunks removes it, which is how a withdrawn source is
taken out of the store.

## Retrieval threshold

A chunk counts as grounding for an answer only if its similarity to the question is above
**0.73**. This is the same number the code declares (`DEFAULT_MATCH_THRESHOLD` in
`src/lib/supabase.ts`) and a test holds the two equal.

It is measured rather than assumed. The product specification names 0.7, but that figure predates
the corpus and does not separate relevant from irrelevant for the embedding model in use. Measured
against the seed corpus on 2026-09-08, the worst in-scope question's best hit scored 0.732 while
the best out-of-scope question's hit scored 0.718, so 0.7 admits noise: a question about highway
funding retrieved an unrelated passage of a homelessness order.

The margin is 0.014 across eleven questions. That is thin, and it will move as the corpus grows,
so re-measure when the corpus changes. Erring high is deliberate: refusing a question V-Tina could
have grounded is a smaller harm than answering one it could not.

## Ingesting the corpus

The seed corpus lives in `corpus/`, one markdown file per document. Every markdown file in that
directory is a policy document; there is no reserved name. `CORPUS.md` at the repository root is
the provenance manifest: one row per document giving its source URL, the date it was retrieved and
the SHA-256 of the source file as retrieved, so anyone can fetch the same source and check the
committed text against it. A test holds the manifest and the directory equal in both directions.

```bash
npm run ingest -- --dry-run
```

Parses and chunks every document with no network calls and no credentials, and reports the chunk
count each would produce. This is how to check the corpus offline.

```bash
npm run ingest
```

Embeds and stores the whole corpus. Needs `.env.local` with the Fireworks key and the Supabase
service-role key. Variables already set in your shell win over the file, so an estate-wide key
stays authoritative. Each document replaces its own chunks in one transaction, so re-running is
safe and leaves no stale text from an earlier version. Add `--file corpus/<name>.md` to ingest one
document. The command reports every document's outcome and exits non-zero if any failed.

## Database

The schema lives in `supabase/migrations/` and is applied to the hosted Supabase project with the
Supabase CLI, which is a dev dependency (`npx supabase ...`). There is no local database: the
hosted project is the development database until a production project exists, and the gate stays
network-free.

| Credential | Where it lives | Used by |
|---|---|---|
| Project URL, anon key, service-role key | `.env.local` (never committed) | The application; ingestion needs the service-role key |
| `FIREWORKS_API_KEY` | `.env.local`, or the shell environment | Embeddings and inference |
| CLI login | `npx supabase login` (stored by the CLI) | Creating and listing migrations |
| Database password | `SUPABASE_DB_PASSWORD` in the shell environment | `npx supabase db push` — **not** an application variable, so it is not in `src/lib/env.ts` or `.env.example` |

One-time setup, from a terminal in the repository root:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

Then, for each new migration:

```bash
npx supabase migration new <name>   # creates supabase/migrations/<timestamp>_<name>.sql
npx supabase db push                # applies unapplied migrations to the linked project
```

Retrieval is public-read: the `anon` key can call `match_policy_chunks` (which caps the result
count and validates the threshold itself, so a direct caller cannot bypass the limits) and read
rows, but cannot write. Only the service role can write, through `replace_document_chunks`.

## Licence

MIT — see [LICENSE](LICENSE).
