import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import {
  chargingSessions,
  createDatabaseConnection,
  stations,
  users,
  vehicles,
  type DatabaseConnection,
} from "@chargewise/database";
import type { CreateChargingSessionRequest } from "@chargewise/shared";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createVehicleRepository } from "../vehicles/vehicle-repository.js";
import { createChargingSessionRepository } from "./charging-session-repository.js";
import {
  ChargingSessionNotFoundError,
  ChargingSessionVehicleNotFoundError,
  createChargingSessionService,
} from "./charging-session-service.js";

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

describe.skipIf(testDatabaseUrl === undefined)("charging-session PostgreSQL integration", () => {
  let connection: DatabaseConnection | undefined;

  function requireConnection(): DatabaseConnection {
    if (connection === undefined) {
      throw new Error("Charging-session test database is not ready");
    }

    return connection;
  }

  async function createUser(email: string): Promise<string> {
    const [user] = await requireConnection()
      .db.insert(users)
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

  async function createVehicle(userId: string): Promise<string> {
    const [vehicle] = await requireConnection()
      .db.insert(vehicles)
      .values({
        userId,
        nickname: "Integration EV",
        make: "BMW",
        model: "i5",
        year: 2025,
        connectorTypes: ["CCS"],
        preferredNetworks: [],
        isDefault: true,
      })
      .returning({
        id: vehicles.id,
      });

    if (vehicle === undefined) {
      throw new Error("Database did not create the test vehicle");
    }

    return vehicle.id;
  }

  async function createStation(): Promise<string> {
    const [station] = await requireConnection()
      .db.insert(stations)
      .values({
        source: "NLR_AFDC",
        sourceStationId: "session-integration-station",
        name: "Session Integration Station",
        network: "Electrify America",
        location: sql`ST_SetSRID(ST_MakePoint(-118.605, 34.19), 4326)::geography`,
        accessCode: "public",
        statusCode: "E",
        level2PortCount: 0,
        dcFastPortCount: 8,
        connectorCodes: ["CCS"],
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

  function createService() {
    const database = requireConnection().db;

    return createChargingSessionService({
      sessions: createChargingSessionRepository(database),
      vehicles: createVehicleRepository(database),
    });
  }

  function createInput(vehicleId: string, stationId: string): CreateChargingSessionRequest {
    return {
      vehicleId,
      stationId,
      startedAt: "2026-08-01T19:00:00.000Z",
      chargingMinutes: 31,
      waitMinutes: 8,
      energyAddedKwh: "42.700",
      totalCost: "12.50",
      startingSoc: 18,
      endingSoc: 79,
      odometerMiles: 15420,
      issueType: "NONE",
      notes: "Integration session",
    };
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
    if (connection !== undefined) {
      await connection.db.delete(users);
      await connection.db.delete(stations);
      await connection.close();
    }
  }, 30_000);

  it("creates, lists, reads, updates, and deletes an owned session", async () => {
    const userId = await createUser("session-owner@example.com");
    const vehicleId = await createVehicle(userId);
    const stationId = await createStation();
    const service = createService();

    const created = await service.create(userId, createInput(vehicleId, stationId));

    await expect(service.get(userId, created.id)).resolves.toEqual(created);

    const listed = await service.list(userId, {
      from: "2026-08-01",
      to: "2026-08-01",
    });

    expect(listed.sessions).toEqual([created]);
    expect(listed.nextCursor).toBeNull();

    const updated = await service.update(userId, created.id, {
      endingSoc: 82,
      totalCost: "13.25",
      notes: "Updated integration session",
    });

    expect(updated).toMatchObject({
      id: created.id,
      endingSoc: 82,
      totalCost: "13.25",
      notes: "Updated integration session",
    });

    await service.delete(userId, created.id);

    await expect(service.get(userId, created.id)).rejects.toBeInstanceOf(
      ChargingSessionNotFoundError,
    );
  });

  it("does not expose or mutate another user's session", async () => {
    const ownerId = await createUser("session-owner@example.com");
    const otherUserId = await createUser("session-other@example.com");
    const ownerVehicleId = await createVehicle(ownerId);
    const stationId = await createStation();
    const service = createService();

    const created = await service.create(ownerId, createInput(ownerVehicleId, stationId));

    await expect(service.get(otherUserId, created.id)).rejects.toBeInstanceOf(
      ChargingSessionNotFoundError,
    );

    await expect(
      service.update(otherUserId, created.id, {
        notes: "Cross-user mutation",
      }),
    ).rejects.toBeInstanceOf(ChargingSessionNotFoundError);

    await expect(service.delete(otherUserId, created.id)).rejects.toBeInstanceOf(
      ChargingSessionNotFoundError,
    );

    await expect(service.get(ownerId, created.id)).resolves.toEqual(created);
  });

  it("allows a shared public station but rejects another user's vehicle", async () => {
    const firstUserId = await createUser("first-driver@example.com");
    const secondUserId = await createUser("second-driver@example.com");
    const firstVehicleId = await createVehicle(firstUserId);
    const secondVehicleId = await createVehicle(secondUserId);
    const stationId = await createStation();
    const service = createService();

    await expect(
      service.create(firstUserId, createInput(firstVehicleId, stationId)),
    ).resolves.toBeDefined();

    await expect(
      service.create(secondUserId, createInput(secondVehicleId, stationId)),
    ).resolves.toBeDefined();

    await expect(
      service.create(secondUserId, createInput(firstVehicleId, stationId)),
    ).rejects.toBeInstanceOf(ChargingSessionVehicleNotFoundError);
  });

  it("enforces charging invariants at the database layer", async () => {
    const userId = await createUser("constraint-driver@example.com");
    const vehicleId = await createVehicle(userId);
    const stationId = await createStation();

    await expect(
      requireConnection()
        .db.insert(chargingSessions)
        .values({
          userId,
          vehicleId,
          stationId,
          startedAt: new Date("2026-08-01T19:00:00.000Z"),
          chargingMinutes: 31,
          waitMinutes: 0,
          energyAddedKwh: "42.700",
          totalCost: "0.00",
          startingSoc: 80,
          endingSoc: 70,
          issueType: "NONE",
        }),
    ).rejects.toBeDefined();
  });
});
