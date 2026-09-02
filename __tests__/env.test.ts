import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  REQUIRED_ENV_KEYS,
  edgeEnvSchema,
  nodeEnvSchema,
  parseEnv,
  publicEnvSchema,
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

    it(`rejects ${key} when it is whitespace only`, () => {
      expect(() => parseEnv(nodeEnvSchema, { ...VALID, [key]: "   " })).toThrow(
        EnvValidationError,
      );
    });
  }

  it("rejects a Supabase URL with no scheme", () => {
    expect(() =>
      parseEnv(nodeEnvSchema, {
        ...VALID,
        NEXT_PUBLIC_SUPABASE_URL: "example.supabase.co",
      }),
    ).toThrow(EnvValidationError);
  });

  it("names EVERY offending variable, not just the first", () => {
    const env = { ...VALID };
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    delete env.FIREWORKS_API_KEY;
    try {
      parseEnv(nodeEnvSchema, env);
      throw new Error("expected parseEnv to throw");
    } catch (e) {
      const keys = (e as EnvValidationError).invalidKeys;
      expect(keys).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(keys).toContain("FIREWORKS_API_KEY");
    }
  });
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

  it("Node rejects the same configuration, because it needs that secret", () => {
    expect(() => parseEnv(nodeEnvSchema, withoutServiceRole())).toThrow(
      EnvValidationError,
    );
  });

  it("public accepts configuration with neither secret", () => {
    expect(() =>
      parseEnv(publicEnvSchema, {
        NEXT_PUBLIC_SUPABASE_URL: VALID.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      }),
    ).not.toThrow();
  });

  it("widens strictly: every public key is in edge, every edge key is in node", () => {
    const pub = Object.keys(publicEnvSchema.shape);
    const edge = Object.keys(edgeEnvSchema.shape);
    const node = Object.keys(nodeEnvSchema.shape);
    for (const k of pub) expect(edge).toContain(k);
    for (const k of edge) expect(node).toContain(k);
    expect(node.length).toBeGreaterThan(edge.length);
    expect(edge.length).toBeGreaterThan(pub.length);
  });
});
