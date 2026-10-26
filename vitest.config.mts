import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The database tests boot an in-process Postgres in a hook; with every file running at once that can take longer
    // than the 10 s default and fail for no reason of their own.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
