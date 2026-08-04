import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 10_000,
  },
});
