import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import {
  createDatabaseConnection,
  favorites,
  stations,
  users,
  type DatabaseConnection,
} from "@chargewise/database";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createFavoriteRepository } from "./favorite-repository.js";
import { createFavoriteService, FavoriteStationNotFoundError } from "./favorite-service.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../..");
const localEnvironmentPath = resolve(repositoryRoot, ".env");
const migrationsFolder = resolve(repositoryRoot, "packages/database/drizzle");

if (existsSync(localEnvironmentPath)) {
  loadEnvFile(localEnvironmentPath);
}

function getSafeTestDatabaseUrl(): string | undefined {
  const value = process.env.TEST_DATABASE_URL;

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsedUrl = new URL(value);
  const databaseName = parsedUrl.pathname.replace(/^\/+/u, "").toLocaleLowerCase();

  if (!databaseName.includes("test")) {
    throw new Error("TEST_DATABASE_URL must reference a database whose name contains 'test'");
  }

  return parsedUrl.toString();
}

const testDatabaseUrl = getSafeTestDatabaseUrl();

describe.skipIf(testDatabaseUrl === undefined)("favorite PostgreSQL integration", () => {
  let connection: DatabaseConnection | undefined;

  function requireConnection(): DatabaseConnection {
    if (connection === undefined) {
      throw new Error("Favorite test database is not ready");
    }

    return connection;
  }

  async function createUser(email: string): Promise<string> {
    const database = requireConnection().db;
    const [user] = await database
      .insert(users)
      .values({
        email,
        passwordHash: "test-password-hash",
      })
      .returning({
        id: users.id,
      });

    if (user === undefined) {
      throw new Error("Database did not create the test user");
    }

    return user.id;
  }

  async function createStation(): Promise<string> {
    const database = requireConnection().db;
    const [station] = await database
      .insert(stations)
      .values({
        source: "NLR_AFDC",
        sourceStationId: "favorite-integration-station",
        name: "Westfield Fast Charging",
        network: "Electrify America",
        location: sql`ST_SetSRID(ST_MakePoint(-118.605, 34.19), 4326)::geography`,
        accessCode: "public",
        statusCode: "E",
        level2PortCount: 0,
        dcFastPortCount: 8,
        connectorCodes: ["CCS"],
        sourceUpdatedAt: new Date("2026-08-02T20:00:00.000Z"),
        lastSyncedAt: new Date("2026-08-05T06:00:00.000Z"),
      })
      .returning({
        id: stations.id,
      });

    if (station === undefined) {
      throw new Error("Database did not create the test station");
    }

    return station.id;
  }

  beforeAll(async () => {
    if (testDatabaseUrl === undefined) {
      throw new Error("TEST_DATABASE_URL is unavailable");
    }

    connection = createDatabaseConnection(testDatabaseUrl);

    await migrate(connection.db, {
      migrationsFolder,
    });
  }, 30_000);

  beforeEach(async () => {
    const database = requireConnection().db;

    await database.delete(users);
    await database.delete(stations);
  });

  afterAll(async () => {
    await connection?.close();
  });

  it("persists one relationship when PUT behavior is repeated", async () => {
    const database = requireConnection().db;
    const repository = createFavoriteRepository(database);
    const service = createFavoriteService({
      favorites: repository,
    });
    const userId = await createUser("favorite-one@example.com");
    const stationId = await createStation();

    const first = await service.add(userId, stationId);
    const second = await service.add(userId, stationId);

    expect(second).toEqual(first);
    expect(await service.list(userId)).toEqual([first]);

    const storedFavorites = await database.select().from(favorites);

    expect(storedFavorites).toHaveLength(1);
    expect(storedFavorites[0]).toMatchObject({
      userId,
      stationId,
    });
  });

  it("keeps favorite relationships isolated by user", async () => {
    const repository = createFavoriteRepository(requireConnection().db);
    const service = createFavoriteService({
      favorites: repository,
    });
    const firstUserId = await createUser("favorite-first@example.com");
    const secondUserId = await createUser("favorite-second@example.com");
    const stationId = await createStation();

    await service.add(firstUserId, stationId);

    await expect(service.list(secondUserId)).resolves.toEqual([]);

    await service.remove(secondUserId, stationId);

    await expect(service.list(firstUserId)).resolves.toHaveLength(1);
  });

  it("rejects a favorite for an unknown station", async () => {
    const repository = createFavoriteRepository(requireConnection().db);
    const service = createFavoriteService({
      favorites: repository,
    });
    const userId = await createUser("favorite-missing@example.com");

    await expect(
      service.add(userId, "ecba119c-963d-4931-acb8-1320791258be"),
    ).rejects.toBeInstanceOf(FavoriteStationNotFoundError);
  });
});
