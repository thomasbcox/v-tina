# v-tina

v-tina is an early-stage project by Thomas Cox. Right now the repository holds **only
scaffolding** — licence, ignore rules, reviewer guidance, and the configuration its review
workflow needs. No application code has been written yet.

## Status

Pre-implementation. Everything below describes what this repository is *intended* to become,
not what it currently contains.

## Intended stack

- **Next.js** with **TypeScript**
- **Tailwind CSS**
- **Supabase**
- **Vercel** for deployment
- **Fireworks** for model inference

## Purpose

The detailed purpose and scope of v-tina are specified in a forthcoming story. This README will
be replaced when that story lands; until then, treat the stack above as direction rather than
commitment.

## Working in this repository

- `AGENTS.md` — repo-local reviewer guidance. Acceptance criteria for product behaviour are
  written as numbered Given/When/Then prose; workflow bookkeeping criteria stay as numbered
  property assertions.
- `reviews/` — story specifications and review artifacts.
- The test gate is currently a deliberate **no-op**: the technology is not yet chosen, so a real
  gate would be rewritten by the story that chooses it.

## Licence

MIT — see [LICENSE](LICENSE).
