/**
 * The document-metadata vocabulary every ingested source must satisfy.
 *
 * Runtime values live here rather than in the declaration-only type barrel; the
 * types are derived from the arrays so a test can compare each vocabulary
 * against what the documentation and the schema say.
 */

/**
 * What kind of source a document is. Ties on similarity are broken in this
 * order, so the array order is the priority order: the Governor's executive
 * files outrank legislative history (User Story 1).
 */
export const DOCUMENT_KINDS = ["executive", "legislative"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * The official domains a source document may come from. A URL passes if its
 * host is one of these or a subdomain of one. This is the single allowlist:
 * the README's "Allowed source domains" section is held equal to it by a test,
 * so the public documentation, the operator instructions and the code cannot
 * disagree. Extend it here when the corpus needs another official domain.
 */
export const ALLOWED_SOURCE_HOSTS = ["oregon.gov", "oregonlegislature.gov"] as const;

export function isAllowedSourceHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_SOURCE_HOSTS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
