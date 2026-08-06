import { fileURLToPath } from "node:url";

export interface MigrationConfig {
  databaseUrl: string;
  migrationsFolder: string;
  source: "MIGRATION_DATABASE_URL" | "DATABASE_URL";
}

function parsePostgreSqlUrl(value: string, variableName: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${variableName} must use the postgres or postgresql protocol`);
  }

  return url.toString();
}

function resolveMigrationsFolder(): string {
  const databaseEntryPoint = import.meta.resolve("@chargewise/database");

  return fileURLToPath(new URL("../drizzle/", databaseEntryPoint));
}

export function parseMigrationConfig(
  input: Record<string, string | undefined> = process.env,
): MigrationConfig {
  const directUrl = input.MIGRATION_DATABASE_URL?.trim();

  if (directUrl !== undefined && directUrl !== "") {
    return {
      databaseUrl: parsePostgreSqlUrl(directUrl, "MIGRATION_DATABASE_URL"),
      migrationsFolder: resolveMigrationsFolder(),
      source: "MIGRATION_DATABASE_URL",
    };
  }

  const runtimeUrl = input.DATABASE_URL?.trim();

  if (runtimeUrl === undefined || runtimeUrl === "") {
    throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required");
  }

  return {
    databaseUrl: parsePostgreSqlUrl(runtimeUrl, "DATABASE_URL"),
    migrationsFolder: resolveMigrationsFolder(),
    source: "DATABASE_URL",
  };
}
