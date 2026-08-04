import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDatabaseConnection,
  type ChargeWiseDatabase,
  type DatabaseConnection,
} from "./client.js";
import { users, vehicles } from "./schema/index.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const localEnvironmentPath = resolve(sourceDirectory, "../../../.env");
const migrationsFolder = resolve(sourceDirectory, "../drizzle");

if (existsSync(localEnvironmentPath)) {
  loadEnvFile(localEnvironmentPath);
}

function getSafeTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;

  if (value === undefined || value.trim() === "") {
    throw new Error("TEST_DATABASE_URL is required for database tests");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use the PostgreSQL protocol");
  }

  const pathSegments = parsedUrl.pathname
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => decodeURIComponent(segment));

  if (pathSegments.length !== 1) {
    throw new Error("TEST_DATABASE_URL must name exactly one database");
  }

  const [databaseName] = pathSegments;

  if (databaseName !== "chargewise_test") {
    throw new Error('Database tests may run only against a database named "chargewise_test"');
  }

  return value;
}

function requireDatabase(connection: DatabaseConnection | undefined): ChargeWiseDatabase {
  if (connection === undefined) {
    throw new Error("The test database connection is not ready");
  }

  return connection.db;
}

async function createTestUser(db: ChargeWiseDatabase, email = "driver@example.com") {
  const [createdUser] = await db
    .insert(users)
    .values({
      email,
      passwordHash: "test-password-hash",
    })
    .returning({ id: users.id });

  if (createdUser === undefined) {
    throw new Error("The test user was not created");
  }

  return createdUser.id;
}

function validVehicle(userId: string, overrides: Partial<typeof vehicles.$inferInsert> = {}) {
  return {
    userId,
    nickname: "Road trip car",
    make: "Ford",
    model: "Mustang Mach-E",
    year: 2024,
    batteryCapacityKwh: "91.00",
    efficiencyMiPerKwh: "3.10",
    connectorTypes: ["CCS", "J1772"],
    ...overrides,
  } satisfies typeof vehicles.$inferInsert;
}

describe("database foundation", () => {
  let connection: DatabaseConnection | undefined;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== "test") {
      throw new Error('Database tests require NODE_ENV to equal "test"');
    }

    const testConnection = createDatabaseConnection(getSafeTestDatabaseUrl());

    try {
      const databaseResult = await testConnection.db.execute<{ databaseName: string }>(
        sql`SELECT current_database() AS "databaseName"`,
      );

      if (databaseResult.rows[0]?.databaseName !== "chargewise_test") {
        throw new Error('The connected database must be named "chargewise_test"');
      }

      await migrate(testConnection.db, { migrationsFolder });
      await migrate(testConnection.db, { migrationsFolder });
      connection = testConnection;
    } catch (error: unknown) {
      await testConnection.close();
      throw error;
    }
  });

  beforeEach(async () => {
    const db = requireDatabase(connection);

    await db.delete(vehicles);
    await db.delete(users);
  });

  afterAll(async () => {
    if (connection === undefined) {
      return;
    }

    await connection.db.delete(vehicles);
    await connection.db.delete(users);
    await connection.close();
  });

  it("applies the migration with PostGIS available", async () => {
    const db = requireDatabase(connection);

    await expect(db.execute(sql`SELECT PostGIS_Version()`)).resolves.toBeDefined();
  });

  it("accepts normalized users and rejects invalid user values", async () => {
    const db = requireDatabase(connection);

    await createTestUser(db);

    await expect(
      db.insert(users).values({
        email: "driver@example.com",
        passwordHash: "another-test-hash",
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(users).values({
        email: " Driver@Example.com ",
        passwordHash: "test-password-hash",
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(users).values({
        email: "another-driver@example.com",
        passwordHash: "   ",
      }),
    ).rejects.toThrow();
  });

  it("stores a valid vehicle with safe defaults", async () => {
    const db = requireDatabase(connection);
    const userId = await createTestUser(db);
    const [createdVehicle] = await db.insert(vehicles).values(validVehicle(userId)).returning({
      preferredNetworks: vehicles.preferredNetworks,
      isDefault: vehicles.isDefault,
    });

    expect(createdVehicle).toEqual({
      preferredNetworks: [],
      isDefault: false,
    });
  });

  it("updates timestamps when rows change", async () => {
    const db = requireDatabase(connection);
    const originalTimestamp = new Date("2020-01-01T00:00:00.000Z");
    const [createdUser] = await db
      .insert(users)
      .values({
        email: "driver@example.com",
        passwordHash: "test-password-hash",
        createdAt: originalTimestamp,
        updatedAt: originalTimestamp,
      })
      .returning({
        id: users.id,
        updatedAt: users.updatedAt,
      });

    if (createdUser === undefined) {
      throw new Error("The timestamp test user was not created");
    }

    const [createdVehicle] = await db
      .insert(vehicles)
      .values(
        validVehicle(createdUser.id, {
          createdAt: originalTimestamp,
          updatedAt: originalTimestamp,
        }),
      )
      .returning({
        id: vehicles.id,
        updatedAt: vehicles.updatedAt,
      });

    if (createdVehicle === undefined) {
      throw new Error("The timestamp test vehicle was not created");
    }

    const [updatedUser] = await db
      .update(users)
      .set({ passwordHash: "updated-test-password-hash" })
      .where(eq(users.id, createdUser.id))
      .returning({ updatedAt: users.updatedAt });
    const [updatedVehicle] = await db
      .update(vehicles)
      .set({ nickname: "Updated road trip car" })
      .where(eq(vehicles.id, createdVehicle.id))
      .returning({ updatedAt: vehicles.updatedAt });

    expect(createdUser.updatedAt).toEqual(originalTimestamp);
    expect(createdVehicle.updatedAt).toEqual(originalTimestamp);
    expect(updatedUser?.updatedAt.getTime()).toBeGreaterThan(originalTimestamp.getTime());
    expect(updatedVehicle?.updatedAt.getTime()).toBeGreaterThan(originalTimestamp.getTime());
  });

  it("rejects invalid vehicle values", async () => {
    const db = requireDatabase(connection);
    const userId = await createTestUser(db);

    await expect(
      db.insert(vehicles).values(validVehicle(userId, { nickname: "   " })),
    ).rejects.toThrow();
    await expect(
      db.insert(vehicles).values(validVehicle(userId, { year: 1989 })),
    ).rejects.toThrow();
    await expect(
      db.insert(vehicles).values(validVehicle(userId, { batteryCapacityKwh: "-1.00" })),
    ).rejects.toThrow();
    await expect(
      db.insert(vehicles).values(validVehicle(userId, { connectorTypes: [] })),
    ).rejects.toThrow();
    await expect(
      db.insert(vehicles).values(validVehicle(userId, { connectorTypes: ["UNKNOWN"] })),
    ).rejects.toThrow();
  });

  it("allows only one default vehicle per user", async () => {
    const db = requireDatabase(connection);
    const userId = await createTestUser(db);

    await db.insert(vehicles).values(validVehicle(userId, { isDefault: true }));

    await expect(
      db.insert(vehicles).values(
        validVehicle(userId, {
          nickname: "Second car",
          isDefault: true,
        }),
      ),
    ).rejects.toThrow();
  });

  it("deletes a user's vehicles when the user is deleted", async () => {
    const db = requireDatabase(connection);
    const userId = await createTestUser(db);

    await db.insert(vehicles).values(validVehicle(userId));
    await db.delete(users);

    await expect(db.select().from(vehicles)).resolves.toEqual([]);
  });
});
