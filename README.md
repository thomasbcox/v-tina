# v-tina

v-tina is the repository for **V-Tina**, a planned public-facing chat application that answers
questions about Oregon executive policy. It is designed as an openly-labelled *virtual AI
avatar* — not an official government service and not a real person — that grounds every answer
in retrieval over official source documents and links each claim back to its `oregon.gov`
original, so a reader can verify it directly.

## Status

**The service answers questions; there is no user interface yet.** The repository holds the
Next.js skeleton, the shared boundary types, startup environment validation, the gate and CI
(story `technology-foundation`), the vector schema and ingestion pipeline (`policy-chunks-ingest`),
a real seed corpus ingested into the hosted store (`seed-corpus-ingest`), and the `/api/chat`
endpoint with its safety routing (`chat-safety-routing`).

Two things that endpoint does **not** yet have, both deliberate. It does not speak in Governor
Kotek's voice — the prompt it answers under is a plain placeholder, and her lexicon, pacing and
deflection framework are the next story. And there is no chat screen: the endpoint is exercised
directly. Everything under *Intended stack* not named here is still planned, not built.

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
| `src/app/api/chat/route.ts` | The public chat endpoint: Node runtime, request-path environment contract |
| `src/lib/chat/` | The routing decision, the request contract, and the stream framing |
| `src/lib/fireworks.ts` | The chat-completions client; `src/lib/retry.ts` is the shared transient-failure policy |
| `src/lib/prompts.ts` | The classifier and rewrite prompts, and the **provisional** voice-bearing ones |
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

## The chat endpoint

`POST /api/chat` is the only public entry point. It reads only the **request-path** half of the
environment contract, so it never needs the service-role secret — retrieval goes through the public
anon key, which the schema allows to read and not to write.

It ran on the **Edge runtime** until 2026-09-10. Next.js 16 deprecates that runtime, and rather
than let the chat screen and the deployment story inherit a deprecated foundation, it moved to the
**Node runtime** while exactly one route depended on it. One consequence is worth stating plainly:
under Edge the platform *could not see* server-only variables, so excluding the service-role secret
was enforced. On Node the secret exists in the process environment and the exclusion is a
discipline — `getEdgeEnv()` plus the tests that hold the route to it. The contract is unchanged;
the guarantee behind it is now ours to keep rather than the runtime's to impose. (`edgeEnvSchema`
keeps its name — it now describes the contract rather than the runtime.)

### What it accepts

```json
{ "messages": [ { "role": "user", "content": "What has Oregon done to increase housing production?" } ] }
```

Roles are `user` and `assistant`; the last message must be the user's and is the question being
asked. A body that does not match is refused with `400` and a reason naming the offending field,
before any model is called, anything is embedded, or any client is constructed.

**Classification judges the latest question only.** A trap assembled across several turns — each
message innocuous alone — can pass it. That hole is known and accepted rather than closed; closing
it means classifying the whole thread on every request, which has its own costs and failure modes.

### What it streams back

**Server-Sent Events** (`text/event-stream`), one JSON object per `data:` record. Reading it does
**not** require `EventSource`: the request is a POST, so a client reads it with `fetch` and a
stream reader. SSE was chosen over a bespoke line format because it is the standard wire format
and the one the mainstream AI client libraries use, so adopting one later changes the payload
shape rather than the transport.

The stream is **pull-based**: one record is produced each time the reader has room, so a fast model
cannot run ahead of a slow reader. **Disconnecting stops the work** — closing the connection unwinds
the orchestrator and aborts the answering model, rather than leaving it generating words nobody
will read.

Validate records with `chatStreamEventSchema` from `src/lib/chat/events.ts` rather than writing a
parser: it is the same object the server derives its own type from.

The record kinds, declared as a runtime schema in `src/lib/chat/events.ts` with the
`ChatStreamEvent` type derived from it — one definition, so a client's parser cannot drift from
what the server emits:

| Kind | What it means |
|---|---|
| `safety_status` | The verdict. **Always first.** On the partisan path it also carries `neutralisedQuestion` — the rephrasing that was actually searched on |
| `retrieved_chunks` | The passages retrieved, with the source metadata needed to cite them. May be empty |
| `streamed_tokens` | Text for the reader — either the generated answer, or the fixed deferral |
| `audit_log_status` | How the exchange ended. **Always last on a successful path** |
| `error` | A failure after the response began, carrying a coarse `reason` and a fixed notice — never the underlying provider or database error text |

The exchange **always** terminates in a record saying how it ended, so a client can tell a
finished response from a truncated one.

**The audit log is not built.** `audit_log_status` always reports `recorded: false`. Nothing in the
specification defines what an audit log would record, and building one means storing members of the
public's questions — a retention and privacy decision that deserves its own story rather than being
settled as a detail inside this one. It is reported rather than omitted so the absence is visible.

### How a question is routed

1. **Classify** — a fast model labels the question `IN-BOUNDS`, `PARTISAN-TRAP`, or `OUT-OF-BOUNDS`.
2. **`OUT-OF-BOUNDS`** — the fixed deferral, pointing at Oregon's official state portal. Nothing is
   embedded, nothing is searched, the answering model is never called.
3. **`PARTISAN-TRAP`** — the question is rewritten to strip the personal and party attack while
   keeping the policy subject. **The rewritten question is what gets searched and answered**, and
   the reader is shown it. Silently rewording someone's own words would be the less honest option
   for a service whose premise is that every claim can be checked.
4. **`IN-BOUNDS`** — the question is embedded and searched directly.
5. **Nothing above the retrieval threshold** — the deferral again. The answering model is never
   asked to write without retrieved material.

### Failing closed

A verdict that does not arrive inside the deadline, does not parse, or is not exactly one of the
three declared labels is treated as **out of bounds**. A flaky classifier makes this service
useless rather than wrong, which is the right way round for a service that speaks in a sitting
governor's name. The parse is an exact match after trimming: a lenient parse is how a hedged reply
becomes a confident label.

A **store failure is not** an empty result. The deferral says the records do not support an answer;
saying that while the database is unreachable would be a false claim about the corpus and would
hide the outage. A retrieval failure produces an `error` record instead.

### Classification latency

The specification asks for classification within 100 ms. **That is not met and cannot be**: a
network round trip to a hosted model does not complete in 100 ms. What is controlled instead is the
model, a short prompt, a token cap, and an explicit deadline of **3000 ms** covering the whole step
including retries and backoff — one clock, not one per attempt.

Measured against the live service on 2026-09-10 over twelve questions: median **380 ms**, slowest
**1462 ms**. At twelve samples the 95th percentile *is* the slowest observation, so treat that
figure as the worst seen rather than a tail estimate. A test holds the documented figure at or
below the declared deadline, so the two cannot drift apart. Re-measure when the model changes.

### Models

The specification names Llama 3.1 — `llama-v3p1-8b-instruct` for classification and a 70B sibling
for writing. **Neither is served by the Fireworks account** (checked 2026-09-10: the account lists
26 models and no Llama among them; requests return `404`). The substitutes were chosen by
measurement, and the specification's *intent* — a fast cheap model for routing, a capable one for
writing — is what is honoured.

| Job | Model | Why |
|---|---|---|
| Classification | `gpt-oss-120b` | Fastest of the candidates at 12/12 agreement on the test questions |
| Answering | `deepseek-v4p1-flash` | Chosen on **time to first token**, which is what a reader of a streaming answer experiences |

Every model on offer is a **reasoning** model: it thinks in a separate field and puts its real
output in `content`. Two consequences worth knowing before changing these. The token cap budgets
the reasoning as well as the output — a cap of 12 tokens returned an empty answer from three
different models, and every question then failed closed. And nothing appears on screen until the
reasoning finishes, which makes time-to-first-token the number that matters rather than total
throughput.

**That number is highly variable and the honest range is wide.** Measured through the running
endpoint on 2026-09-10, the answering model took **3.6 s, 9.1 s and 11.9 s** of thinking before its
first word across three grounded questions. An earlier single sample of 1.5 s is not
representative; it is recorded here as the reason not to trust one measurement. The rejected
candidate was **19.5 s** on one comparison, which is why it was rejected — but treat that as one
sample against another, not as a stable ranking. Re-measure before changing models, and take more
than one reading.

### Provisional prompts

This story built the router, not Governor Kotek's voice. Prompts that produce a label or a
rephrased question are finished work. Prompts a reader actually reads are **provisional** and the
next story replaces them:

- `GROUNDED_DEFERRAL`
- `ANSWER_SYSTEM_PROMPT`
- `FAILURE_NOTICE`

This is the same list `PROVISIONAL_PROMPTS` declares in `src/lib/prompts.ts`, and a test holds the
two equal in both directions. The placeholder answering prompt is deliberately plain: it governs
accuracy and says nothing about tone, so that nobody mistakes it for a decision about how she
sounds.


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
