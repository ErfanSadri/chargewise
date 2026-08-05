import { createDatabaseConnection } from "@chargewise/database";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { parseMigrationConfig } from "./migration-config.js";

async function runMigration(): Promise<void> {
  const config = parseMigrationConfig();
  const connection = createDatabaseConnection(config.databaseUrl);

  process.stdout.write(`Applying ChargeWise migrations using ${config.source}...\n`);

  try {
    await migrate(connection.db, {
      migrationsFolder: config.migrationsFolder,
    });
  } finally {
    await connection.close();
  }

  process.stdout.write("ChargeWise migrations applied successfully.\n");
}

void runMigration().catch((error: unknown) => {
  const errorType = error instanceof Error ? error.name : typeof error;

  process.stderr.write(`ChargeWise migration failed (${errorType}).\n`);
  process.exitCode = 1;
});
