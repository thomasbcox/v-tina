import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `.tsx` admits the component tests (story `chat-screen`), which declare the
    // jsdom environment per file; the default here stays node.
    include: ["__tests__/**/*.test.{ts,tsx}"],
    // Deliberately NOT passWithNoTests: an empty suite must fail the gate rather
    // than report a pass, which is the vacuous-check failure this gate replaced.
    passWithNoTests: false,
  },
});
