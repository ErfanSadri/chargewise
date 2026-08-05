import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@chargewise/database": fileURLToPath(
        new URL("../../packages/database/src/index.ts", import.meta.url),
      ),
      "@chargewise/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "dist/**"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
