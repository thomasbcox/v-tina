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
| Compatibility floor | `package.json` `engines.node` (`>=20.9.0`, Next.js's own requirement) |

`.nvmrc` pins the **major**, so a patch upgrade does not desynchronise local from CI while a major
change stays an explicit decision. Change the version in `.nvmrc`; CI follows it automatically.

`engines.node` is a separate, hand-maintained declaration — it is the floor npm warns against, not
a copy of the pin. **Nothing checks that the two agree**: the test that compared them was removed
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

### Frontmatter reference

Every document carries all five fields. Ties on retrieval similarity are broken by `kind` (an
executive document outranks legislative history) and then by `date`, most recent first.

| Field | Meaning |
|---|---|
| `title` | The document's title as it should appear in a citation, e.g. `EO 23-02` |
| `date` | The **as-of date**, `YYYY-MM-DD`: the date the content is current as of — an order's signing date, a revised page's last revision |
| `url` | The document's canonical URL on an allowed domain |
| `pillar` | The policy pillar the document belongs to |
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
