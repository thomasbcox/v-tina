# v-tina

v-tina is the repository for **V-Tina**, a planned public-facing chat application that answers
questions about Oregon executive policy. It is designed as an openly-labelled *virtual AI
avatar* — not an official government service and not a real person — that grounds every answer
in retrieval over official source documents and links each claim back to its `oregon.gov`
original, so a reader can verify it directly.

## Status

**Specification committed; no application code written yet.** The repository currently holds the
product specification, licence, ignore rules, reviewer guidance, and the configuration its
review workflow needs. Everything under *Intended stack* describes what V-Tina is planned to be
built on, not what has been built.

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
change stays an explicit decision. A test in the gate asserts the pinned version satisfies
`engines.node`, so the two cannot drift apart silently. Change the version in `.nvmrc` and nothing
else.

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

## Licence

MIT — see [LICENSE](LICENSE).
