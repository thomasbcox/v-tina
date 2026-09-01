import { z } from "zod";

/**
 * Environment contract for V-Tina.
 *
 * The schema is the single authority for what the application requires: the
 * `.env.example` completeness test derives its expected key list from
 * `envSchema.shape`, so adding a variable here without documenting it fails the
 * gate without anyone editing that test.
 */

/** Rejects empty and whitespace-only values, which a bare presence check accepts. */
const nonEmpty = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} must not be empty`);

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .trim()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a URL including its scheme"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty("SUPABASE_SERVICE_ROLE_KEY"),
  FIREWORKS_API_KEY: nonEmpty("FIREWORKS_API_KEY"),
});

export type Env = z.infer<typeof envSchema>;

/** Every variable the application requires, derived from the schema itself. */
export const REQUIRED_ENV_KEYS = Object.keys(envSchema.shape) as (keyof Env)[];

export class EnvValidationError extends Error {
  readonly invalidKeys: string[];
  constructor(invalidKeys: string[], detail: string) {
    super(`Invalid environment configuration:\n${detail}`);
    this.name = "EnvValidationError";
    this.invalidKeys = invalidKeys;
  }
}

/**
 * Pure: validates an environment map and returns the parsed values.
 *
 * Kept separate from the cached singleton below so the unit tests call it
 * directly with fabricated maps, rather than fighting module-load caching.
 * Reports EVERY offending variable, not just the first.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const issues = result.error.issues;
  const invalidKeys = [...new Set(issues.map((i) => String(i.path[0])))].sort();
  const detail = issues
    .map((i) => `  - ${String(i.path[0])}: ${i.message}`)
    .join("\n");
  throw new EnvValidationError(invalidKeys, detail);
}

let cached: Env | undefined;

/** Validated environment, parsed once on first use. */
export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
