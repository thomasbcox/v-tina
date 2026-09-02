import { z } from "zod";

/**
 * Environment contracts for V-Tina, split by where they are consumed.
 *
 * One flat contract would force the Edge chat route (User Story 2 specifies edge
 * runtime) to demand `SUPABASE_SERVICE_ROLE_KEY` — a server-only secret that must
 * not reach the edge bundle — or to bypass validation entirely. Splitting by
 * runtime lets each consumer fail fast on exactly the keys it legitimately needs.
 *
 * The schemas nest: public ⊂ edge ⊂ node. `REQUIRED_ENV_KEYS` derives from the
 * widest (node), so the `.env.example` completeness test stays a single source of
 * truth and covers every variable the application can require.
 */

/** Rejects empty and whitespace-only values, which a bare presence check accepts. */
const nonEmpty = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} must not be empty`);

/** Safe in the browser bundle — the `NEXT_PUBLIC_` prefix is what exposes them. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .trim()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a URL including its scheme"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
});

/** The Edge runtime's contract: public keys plus inference. Deliberately does
 *  NOT include the service-role secret. */
export const edgeEnvSchema = publicEnvSchema.extend({
  FIREWORKS_API_KEY: nonEmpty("FIREWORKS_API_KEY"),
});

/** The Node server's contract: everything the edge needs, plus server-only
 *  secrets used by ingestion and privileged database access. */
export const nodeEnvSchema = edgeEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty("SUPABASE_SERVICE_ROLE_KEY"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type EdgeEnv = z.infer<typeof edgeEnvSchema>;
export type NodeEnv = z.infer<typeof nodeEnvSchema>;

/** Every variable the application can require, derived from the widest schema. */
export const REQUIRED_ENV_KEYS = Object.keys(
  nodeEnvSchema.shape,
) as (keyof NodeEnv)[];

export class EnvValidationError extends Error {
  readonly invalidKeys: string[];
  constructor(invalidKeys: string[], detail: string) {
    super(`Invalid environment configuration:\n${detail}`);
    this.name = "EnvValidationError";
    this.invalidKeys = invalidKeys;
  }
}

/**
 * Pure: validates an environment map against one contract and returns the parsed
 * values. Kept separate from the cached accessors below so the unit tests call it
 * directly with fabricated maps. Reports EVERY offending variable, not just the
 * first.
 */
export function parseEnv<S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  source: Record<string, string | undefined>,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (result.success) return result.data as z.infer<S>;

  const issues = result.error.issues;
  const invalidKeys = [...new Set(issues.map((i) => String(i.path[0])))].sort();
  const detail = issues
    .map((i) => `  - ${String(i.path[0])}: ${i.message}`)
    .join("\n");
  throw new EnvValidationError(invalidKeys, detail);
}

let cachedNode: NodeEnv | undefined;
let cachedEdge: EdgeEnv | undefined;
let cachedPublic: PublicEnv | undefined;

/** Validated Node-server environment, parsed once on first use. */
export function getNodeEnv(): NodeEnv {
  if (!cachedNode) cachedNode = parseEnv(nodeEnvSchema, process.env);
  return cachedNode;
}

/** Validated Edge environment, parsed once on first use. */
export function getEdgeEnv(): EdgeEnv {
  if (!cachedEdge) cachedEdge = parseEnv(edgeEnvSchema, process.env);
  return cachedEdge;
}

/** Validated browser-safe environment, parsed once on first use. */
export function getPublicEnv(): PublicEnv {
  if (!cachedPublic) cachedPublic = parseEnv(publicEnvSchema, process.env);
  return cachedPublic;
}
