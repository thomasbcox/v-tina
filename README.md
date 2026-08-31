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

The test gate is currently a deliberate **no-op**: the technology is not yet stood up, so a real
gate would be rewritten by the story that builds it.

## Licence

MIT — see [LICENSE](LICENSE).
