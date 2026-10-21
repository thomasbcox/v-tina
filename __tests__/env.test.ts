import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  REQUIRED_ENV_KEYS,
  edgeEnvSchema,
  nodeEnvSchema,
  parseEnv,
} from "../src/lib/env";

const VALID: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-value",
  FIREWORKS_API_KEY: "fireworks-key-value",
};

describe("parseEnv against the Node contract", () => {
  it("returns parsed values when every variable is present and well-formed", () => {
    expect(parseEnv(nodeEnvSchema, { ...VALID })).toMatchObject(VALID);
  });

  // Extent derived from the schema, not retyped: a variable added to the Node
  // contract is covered here automatically.
  for (const key of REQUIRED_ENV_KEYS) {
    it(`throws naming ${key} when it is missing`, () => {
      const env = { ...VALID };
      delete env[key];
      try {
        parseEnv(nodeEnvSchema, env);
        throw new Error("expected parseEnv to throw");
      } catch (e) {
        expect(e).toBeInstanceOf(EnvValidationError);
        expect((e as EnvValidationError).invalidKeys).toContain(key);
        expect((e as Error).message).toContain(key);
      }
    });

    it(`rejects ${key} when it is empty`, () => {
      expect(() => parseEnv(nodeEnvSchema, { ...VALID, [key]: "" })).toThrow(
        EnvValidationError,
      );
    });
  }
});

describe("runtime contracts are nested, not identical", () => {
  // The point of the split: the Edge chat route must validate without the
  // server-only secret, which must never reach the edge bundle.
  const withoutServiceRole = () => {
    const env = { ...VALID };
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    return env;
  };

  it("Edge accepts configuration with no service-role secret", () => {
    expect(() => parseEnv(edgeEnvSchema, withoutServiceRole())).not.toThrow();
  });
});
