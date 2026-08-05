import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { createClient } from "redis";

const defaultDatabaseUrl = "postgresql://chargewise:chargewise@127.0.0.1:5433/chargewise_e2e";
const defaultRedisUrl = "redis://127.0.0.1:6379/15";
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function getTargetDatabaseName(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));

  if (!/^[A-Za-z0-9_-]+$/u.test(databaseName)) {
    throw new Error(
      "E2E database name must contain only letters, numbers, underscores, or hyphens",
    );
  }

  return databaseName;
}

async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
  const targetUrl = new URL(databaseUrl);
  const databaseName = getTargetDatabaseName(databaseUrl);
  const adminUrl = new URL(targetUrl);

  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();

    const existing = await client.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [databaseName],
    );

    if (!existing.rows[0]?.exists) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }
}

function runMigrations(databaseUrl: string): void {
  const result = spawnSync("pnpm", ["--filter", "@chargewise/database", "db:migrate"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`E2E database migration failed with exit code ${String(result.status)}`);
  }
}

async function resetDatabase(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query(
      "TRUNCATE TABLE charging_sessions, favorites, vehicles, users, stations RESTART IDENTITY CASCADE",
    );
  } finally {
    await client.end();
  }
}

async function resetRedis(redisUrl: string): Promise<void> {
  const client = createClient({ url: redisUrl });

  client.on("error", (error) => {
    process.stderr.write(`E2E Redis client error: ${error.name}\n`);
  });

  try {
    await client.connect();
    await client.flushDb();
  } finally {
    if (client.isOpen) {
      await client.close();
    }
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.E2E_DATABASE_URL ?? defaultDatabaseUrl;
  const redisUrl = process.env.E2E_REDIS_URL ?? defaultRedisUrl;

  process.stdout.write("Preparing isolated ChargeWise E2E infrastructure...\n");

  await ensureDatabaseExists(databaseUrl);
  runMigrations(databaseUrl);
  await resetDatabase(databaseUrl);
  await resetRedis(redisUrl);

  process.stdout.write("ChargeWise E2E infrastructure is ready.\n");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`ChargeWise E2E preparation failed: ${message}\n`);
  process.exitCode = 1;
});
