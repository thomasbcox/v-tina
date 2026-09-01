import { afterEach, describe, expect, it, vi } from "vitest";

const VALID: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-value",
  FIREWORKS_API_KEY: "fireworks-key-value",
};

const stubAll = (overrides: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries({ ...VALID, ...overrides })) {
    vi.stubEnv(k, v);
  }
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("register", () => {
  it("fails startup, naming the offending key, when configuration is invalid", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    stubAll({ FIREWORKS_API_KEY: "" });
    const { register } = await import("../src/instrumentation");
    await expect(register()).rejects.toThrow(/FIREWORKS_API_KEY/);
  });

  it("completes when every required key is present and well-formed", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    stubAll();
    const { register } = await import("../src/instrumentation");
    await expect(register()).resolves.toBeUndefined();
  });

  it("does not validate outside the Node runtime, where server keys do not exist", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    stubAll({ FIREWORKS_API_KEY: "" });
    const { register } = await import("../src/instrumentation");
    await expect(register()).resolves.toBeUndefined();
  });
});
