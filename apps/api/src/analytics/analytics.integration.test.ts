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
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAnalyticsRepository } from "./analytics-repository.js";
import { createAnalyticsService } from "./analytics-service.js";

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

describe.skipIf(testDatabaseUrl === undefined)("analytics PostgreSQL integration", () => {
  let connection: DatabaseConnection | undefined;

  function requireConnection(): DatabaseConnection {
    if (connection === undefined) {
      throw new Error("Analytics test database is not ready");
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
        nickname: "Analytics EV",
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

  async function createStation(
    sourceStationId: string,
    name: string,
    network: string,
    longitude: number,
  ): Promise<string> {
    const [station] = await requireConnection()
      .db.insert(stations)
      .values({
        source: "NLR_AFDC",
        sourceStationId,
        name,
        network,
        location: sql`
            ST_SetSRID(
              ST_MakePoint(${longitude}, 34.19),
              4326
            )::geography
          `,
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

  async function createSession(input: {
    userId: string;
    vehicleId: string;
    stationId: string;
    startedAt: string;
    chargingMinutes: number;
    waitMinutes: number;
    energyAddedKwh: string;
    totalCost: string;
    issueType: "NONE" | "UNAVAILABLE" | "BROKEN" | "SLOW" | "PAYMENT" | "OCCUPIED" | "OTHER";
  }): Promise<void> {
    await requireConnection()
      .db.insert(chargingSessions)
      .values({
        ...input,
        startedAt: new Date(input.startedAt),
        startingSoc: 20,
        endingSoc: 80,
      });
  }

  function createService() {
    return createAnalyticsService({
      analytics: createAnalyticsRepository(requireConnection().db),
    });
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

  it("matches independently calculated summary, network, and station fixtures", async () => {
    const userId = await createUser("analytics-owner@example.com");
    const vehicleId = await createVehicle(userId);
    const firstStationId = await createStation(
      "analytics-ea",
      "Westfield Fast Charging",
      "Electrify America",
      -118.605,
    );
    const secondStationId = await createStation(
      "analytics-evgo-one",
      "Warner Center EVgo",
      "EVgo",
      -118.61,
    );
    const thirdStationId = await createStation(
      "analytics-evgo-two",
      "Valley Circle EVgo",
      "EVgo",
      -118.62,
    );

    await createSession({
      userId,
      vehicleId,
      stationId: firstStationId,
      startedAt: "2026-08-01T12:00:00.000Z",
      chargingMinutes: 30,
      waitMinutes: 5,
      energyAddedKwh: "40.000",
      totalCost: "8.00",
      issueType: "NONE",
    });
    await createSession({
      userId,
      vehicleId,
      stationId: firstStationId,
      startedAt: "2026-08-02T12:00:00.000Z",
      chargingMinutes: 20,
      waitMinutes: 0,
      energyAddedKwh: "30.000",
      totalCost: "6.00",
      issueType: "BROKEN",
    });
    await createSession({
      userId,
      vehicleId,
      stationId: secondStationId,
      startedAt: "2026-08-03T12:00:00.000Z",
      chargingMinutes: 35,
      waitMinutes: 10,
      energyAddedKwh: "45.000",
      totalCost: "7.50",
      issueType: "NONE",
    });
    await createSession({
      userId,
      vehicleId,
      stationId: thirdStationId,
      startedAt: "2026-08-04T12:00:00.000Z",
      chargingMinutes: 33,
      waitMinutes: 10,
      energyAddedKwh: "40.400",
      totalCost: "2.60",
      issueType: "NONE",
    });

    const service = createService();

    await expect(service.summary(userId, {})).resolves.toEqual({
      sessionCount: 4,
      totalEnergyKwh: "155.400",
      totalCost: "24.10",
      averageCostPerKwh: "0.1551",
      averageChargingMinutes: "29.50",
      averageWaitMinutes: "6.25",
      averageObservedPowerKw: "79.02",
      issueFreePercentage: "75.00",
    });

    await expect(service.networks(userId, {})).resolves.toEqual([
      {
        network: "EVgo",
        sessionCount: 2,
        totalEnergyKwh: "85.400",
        totalCost: "10.10",
        averageCostPerKwh: "0.1183",
        averageObservedPowerKw: "75.35",
        issueFreePercentage: "100.00",
      },
      {
        network: "Electrify America",
        sessionCount: 2,
        totalEnergyKwh: "70.000",
        totalCost: "14.00",
        averageCostPerKwh: "0.2000",
        averageObservedPowerKw: "84.00",
        issueFreePercentage: "50.00",
      },
    ]);

    const stationAnalytics = await service.stations(userId, {});

    expect(stationAnalytics).toEqual([
      {
        stationId: firstStationId,
        name: "Westfield Fast Charging",
        network: "Electrify America",
        sessionCount: 2,
        totalEnergyKwh: "70.000",
        totalCost: "14.00",
        averageCostPerKwh: "0.2000",
        averageChargingMinutes: "25.00",
        averageWaitMinutes: "2.50",
        averageObservedPowerKw: "84.00",
        issueFreePercentage: "50.00",
        lastSessionAt: "2026-08-02T12:00:00.000Z",
      },
      {
        stationId: secondStationId,
        name: "Warner Center EVgo",
        network: "EVgo",
        sessionCount: 1,
        totalEnergyKwh: "45.000",
        totalCost: "7.50",
        averageCostPerKwh: "0.1667",
        averageChargingMinutes: "35.00",
        averageWaitMinutes: "10.00",
        averageObservedPowerKw: "77.14",
        issueFreePercentage: "100.00",
        lastSessionAt: "2026-08-03T12:00:00.000Z",
      },
      {
        stationId: thirdStationId,
        name: "Valley Circle EVgo",
        network: "EVgo",
        sessionCount: 1,
        totalEnergyKwh: "40.400",
        totalCost: "2.60",
        averageCostPerKwh: "0.0644",
        averageChargingMinutes: "33.00",
        averageWaitMinutes: "10.00",
        averageObservedPowerKw: "73.45",
        issueFreePercentage: "100.00",
        lastSessionAt: "2026-08-04T12:00:00.000Z",
      },
    ]);
  });

  it("applies inclusive date filters and isolates users", async () => {
    const ownerId = await createUser("analytics-owner@example.com");
    const otherUserId = await createUser("analytics-other@example.com");
    const ownerVehicleId = await createVehicle(ownerId);
    const otherVehicleId = await createVehicle(otherUserId);
    const stationId = await createStation(
      "analytics-filter",
      "Filter Station",
      "Electrify America",
      -118.6,
    );

    await createSession({
      userId: ownerId,
      vehicleId: ownerVehicleId,
      stationId,
      startedAt: "2026-08-01T23:59:59.000Z",
      chargingMinutes: 30,
      waitMinutes: 0,
      energyAddedKwh: "30.000",
      totalCost: "6.00",
      issueType: "NONE",
    });
    await createSession({
      userId: ownerId,
      vehicleId: ownerVehicleId,
      stationId,
      startedAt: "2026-08-02T00:00:00.000Z",
      chargingMinutes: 20,
      waitMinutes: 4,
      energyAddedKwh: "20.000",
      totalCost: "4.00",
      issueType: "BROKEN",
    });
    await createSession({
      userId: otherUserId,
      vehicleId: otherVehicleId,
      stationId,
      startedAt: "2026-08-02T12:00:00.000Z",
      chargingMinutes: 1,
      waitMinutes: 0,
      energyAddedKwh: "999.000",
      totalCost: "999.00",
      issueType: "NONE",
    });

    const service = createService();

    await expect(
      service.summary(ownerId, {
        from: "2026-08-02",
        to: "2026-08-02",
      }),
    ).resolves.toEqual({
      sessionCount: 1,
      totalEnergyKwh: "20.000",
      totalCost: "4.00",
      averageCostPerKwh: "0.2000",
      averageChargingMinutes: "20.00",
      averageWaitMinutes: "4.00",
      averageObservedPowerKw: "60.00",
      issueFreePercentage: "0.00",
    });

    await expect(service.summary(otherUserId, {})).resolves.toMatchObject({
      sessionCount: 1,
      totalEnergyKwh: "999.000",
      totalCost: "999.00",
    });
  });

  it("returns additive zeroes and null averages for an empty dataset", async () => {
    const userId = await createUser("analytics-empty@example.com");
    const service = createService();

    await expect(service.summary(userId, {})).resolves.toEqual({
      sessionCount: 0,
      totalEnergyKwh: "0.000",
      totalCost: "0.00",
      averageCostPerKwh: null,
      averageChargingMinutes: null,
      averageWaitMinutes: null,
      averageObservedPowerKw: null,
      issueFreePercentage: null,
    });

    await expect(service.networks(userId, {})).resolves.toEqual([]);
    await expect(service.stations(userId, {})).resolves.toEqual([]);
  });
});
