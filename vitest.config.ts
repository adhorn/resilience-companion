import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    pool: "forks", // better-sqlite3 is not thread-safe
  },
});
