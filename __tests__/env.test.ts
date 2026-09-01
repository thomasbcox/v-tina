import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  REQUIRED_ENV_KEYS,
  parseEnv,
} from "../src/lib/env";

const VALID: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-value",
  FIREWORKS_API_KEY: "fireworks-key-value",
};

describe("parseEnv", () => {
  it("returns parsed values when every variable is present and well-formed", () => {
    expect(parseEnv({ ...VALID })).toMatchObject(VALID);
  });

  // Extent derived from the schema, not retyped: a new variable is covered
  // automatically the moment it is added to envSchema.
  for (const key of REQUIRED_ENV_KEYS) {
    it(`throws naming ${key} when it is missing`, () => {
      const env = { ...VALID };
      delete env[key];
      expect(() => parseEnv(env)).toThrow(EnvValidationError);
      try {
        parseEnv(env);
      } catch (e) {
        expect((e as EnvValidationError).invalidKeys).toContain(key);
        expect((e as Error).message).toContain(key);
      }
    });

    it(`rejects ${key} when it is empty`, () => {
      expect(() => parseEnv({ ...VALID, [key]: "" })).toThrow(EnvValidationError);
    });

    it(`rejects ${key} when it is whitespace only`, () => {
      expect(() => parseEnv({ ...VALID, [key]: "   " })).toThrow(
        EnvValidationError,
      );
    });
  }

  it("rejects a Supabase URL with no scheme", () => {
    expect(() =>
      parseEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: "example.supabase.co" }),
    ).toThrow(EnvValidationError);
  });

  it("names EVERY offending variable, not just the first", () => {
    const env = { ...VALID };
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    delete env.FIREWORKS_API_KEY;
    try {
      parseEnv(env);
      throw new Error("expected parseEnv to throw");
    } catch (e) {
      const keys = (e as EnvValidationError).invalidKeys;
      expect(keys).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(keys).toContain("FIREWORKS_API_KEY");
    }
  });
});
