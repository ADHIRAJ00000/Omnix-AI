import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node, not jsdom: this is backend code with no DOM.
    environment: "node",

    // Loads env vars and opens the database connection once for the whole run
    // rather than per file.
    globalSetup: ["./tests/globalSetup.js"],
    setupFiles: ["./tests/setup.js"],

    include: ["tests/**/*.test.js"],

    /**
     * Run test files one at a time.
     *
     * Several suites assert on exact credit balances and on Redis keys. Run in
     * parallel against one shared database they would clear each other's data
     * mid-assertion and fail in ways that look like real bugs. The suite is
     * small, so the lost parallelism costs little and buys reliability.
     */
    fileParallelism: false,

    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
