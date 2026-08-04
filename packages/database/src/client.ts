import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

export type ChargeWiseDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  db: ChargeWiseDatabase;
  close: () => Promise<void>;
}

export function createDatabaseConnection(databaseUrl: string): DatabaseConnection {
  if (databaseUrl.trim() === "") {
    throw new Error("A database URL is required");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  return {
    db: drizzle(pool, { schema }),
    close: async () => {
      await pool.end();
    },
  };
}
