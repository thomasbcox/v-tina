import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { PolicyChunkSource } from "../../types";
import {
  ALLOWED_SOURCE_HOSTS,
  DOCUMENT_KINDS,
  isAllowedSourceHost,
} from "./metadata";
import { POLICY_PILLARS } from "./pillars";

/**
 * Frontmatter parsing: a markdown source document → its validated metadata and
 * body. Pure; no I/O.
 *
 * A document is refused, naming EVERY field at fault in one error, when its
 * frontmatter is absent, a required field is missing, or a value is malformed —
 * the same all-offenders-at-once shape `src/lib/env.ts` established.
 */

/** The frontmatter keys every source document must carry. The README's
 *  frontmatter reference documents these by name. */
export const FRONTMATTER_KEYS = ["title", "date", "url", "pillar", "kind"] as const;

const nonEmpty = (label: string) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .min(1, `${label} must not be empty`);

const hostOf = (value: string): string => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

const frontmatterSchema = z.object({
  title: nonEmpty("title"),
  date: z.iso.date({ error: "date must be an ISO-8601 calendar date (YYYY-MM-DD)" }),
  url: z
    .string({ error: "url must be text" })
    .trim()
    .url("url must be a URL including its scheme")
    .refine((v) => v.startsWith("https://"), "url must use https")
    .refine(
      (v) => isAllowedSourceHost(hostOf(v)),
      `url host must be one of ${ALLOWED_SOURCE_HOSTS.join(", ")} or a subdomain of one`,
    ),
  // A closed list at ingest: a mistyped pillar is refused by name alongside
  // every other faulty field, rather than silently creating a category that
  // nothing will ever retrieve. The read path stays permissive — see pillars.ts.
  pillar: z.enum(POLICY_PILLARS, {
    error: `pillar must be one of ${POLICY_PILLARS.join(", ")}`,
  }),
  kind: z.enum(DOCUMENT_KINDS, {
    error: `kind must be one of ${DOCUMENT_KINDS.join(", ")}`,
  }),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;

export interface ParsedDocument {
  source: PolicyChunkSource;
  body: string;
}

export class DocumentValidationError extends Error {
  /** Every field at fault, sorted, each named once. */
  readonly invalidFields: string[];
  constructor(issues: { field: string; message: string }[]) {
    const detail = issues.map((i) => `  - ${i.field}: ${i.message}`).join("\n");
    super(`Source document refused:\n${detail}`);
    this.name = "DocumentValidationError";
    this.invalidFields = [...new Set(issues.map((i) => i.field))].sort();
  }
}

/** `---` fences at the very start of the document, on their own lines. */
const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function splitFrontmatter(markdown: string): { yaml: string | null; body: string } {
  const m = FENCE.exec(markdown);
  if (!m) return { yaml: null, body: markdown };
  return { yaml: m[1], body: markdown.slice(m[0].length) };
}

export function parseDocument(markdown: string): ParsedDocument {
  const issues: { field: string; message: string }[] = [];
  const { yaml, body: rawBody } = splitFrontmatter(markdown);

  // Validate against `{}` when the frontmatter is absent or unreadable, so every
  // required field is named rather than one opaque "no frontmatter" failure.
  let metadata: unknown = {};
  if (yaml === null) {
    issues.push({ field: "frontmatter", message: "no YAML frontmatter block found" });
  } else {
    try {
      const parsed: unknown = parseYaml(yaml);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed;
      } else {
        issues.push({ field: "frontmatter", message: "must be a YAML mapping" });
      }
    } catch (e) {
      issues.push({
        field: "frontmatter",
        message: `not valid YAML: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const result = frontmatterSchema.safeParse(metadata);
  if (!result.success) {
    for (const i of result.error.issues) {
      issues.push({ field: String(i.path[0] ?? "frontmatter"), message: i.message });
    }
  }

  const body = rawBody.trim();
  if (body.length === 0) {
    issues.push({ field: "body", message: "document has no text after the frontmatter" });
  }

  if (issues.length > 0 || !result.success) throw new DocumentValidationError(issues);

  const fm = result.data;
  return {
    source: {
      documentTitle: fm.title,
      date: fm.date,
      url: fm.url,
      pillar: fm.pillar,
      documentKind: fm.kind,
    },
    body,
  };
}
