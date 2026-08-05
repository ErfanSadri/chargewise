import { describe, expect, it } from "vitest";

import { parseMigrationConfig } from "./migration-config.js";

describe("parseMigrationConfig", () => {
  it("prefers the direct migration URL over the pooled runtime URL", () => {
    expect(
      parseMigrationConfig({
        DATABASE_URL: "postgresql://runtime@example.test/chargewise",
        MIGRATION_DATABASE_URL: "postgresql://migration@example.test/chargewise",
      }),
    ).toMatchObject({
      databaseUrl: "postgresql://migration@example.test/chargewise",
      source: "MIGRATION_DATABASE_URL",
    });
  });

  it("falls back to the runtime database URL", () => {
    expect(
      parseMigrationConfig({
        DATABASE_URL: "postgresql://runtime@example.test/chargewise",
      }),
    ).toMatchObject({
      databaseUrl: "postgresql://runtime@example.test/chargewise",
      source: "DATABASE_URL",
    });
  });

  it("resolves the packaged database migrations folder", () => {
    const config = parseMigrationConfig({
      DATABASE_URL: "postgresql://runtime@example.test/chargewise",
    });

    expect(config.migrationsFolder).toMatch(/packages[\\/]database[\\/]drizzle[\\/]?$/u);
  });

  it.each([
    {},
    {
      DATABASE_URL: "https://example.test/chargewise",
    },
    {
      MIGRATION_DATABASE_URL: "not-a-url",
    },
  ])("rejects missing or invalid database configuration", (environment) => {
    expect(() => parseMigrationConfig(environment)).toThrow();
  });
});
