import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const localEnvironmentPath = resolve(packageDirectory, "../../.env");

if (existsSync(localEnvironmentPath)) {
  loadEnvFile(localEnvironmentPath);
}

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to run database commands");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
