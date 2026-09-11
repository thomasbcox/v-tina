/**
 * The policy pillars a source document can belong to.
 *
 * Chosen 2026-09-08 as Governor Kotek's three stated priorities. The
 * specification names the field but never defines the vocabulary, so this
 * constant is its only definition: the parser validates against it, the README
 * documents it, and a test holds those two equal so the public documentation
 * and the code cannot disagree.
 *
 * Deliberately NOT a database check constraint, unlike `document_kind`. Kind is
 * a closed two-value vocabulary wired into the ranking rule, so the database
 * enforces it. Pillars are an open classification expected to grow with the
 * corpus, and a migration per new pillar would be friction with no safety gain
 * given that only the service role writes. For the same reason the retrieval
 * path still reads `pillar` as free text: a row carrying a pillar this build
 * does not know must not break reading the whole table.
 */
export const POLICY_PILLARS = [
  "housing-and-homelessness",
  "behavioral-health",
  "education",
] as const;

export type PolicyPillar = (typeof POLICY_PILLARS)[number];
