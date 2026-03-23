import { defineConfig } from "vitest/config.js";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    pool: "forks", // better-sqlite3 is not thread-safe
  },
});
