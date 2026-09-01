import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // Deliberately NOT passWithNoTests: an empty suite must fail the gate rather
    // than report a pass, which is the vacuous-check failure this gate replaced.
    passWithNoTests: false,
  },
});
