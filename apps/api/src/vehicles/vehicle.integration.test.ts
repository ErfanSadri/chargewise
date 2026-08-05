import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { createDatabaseConnection, type DatabaseConnection, users } from "@chargewise/database";
import type { CreateVehicleRequest } from "@chargewise/shared";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRunVehicleTransaction } from "./vehicle-database.js";
import { createVehicleRepository } from "./vehicle-repository.js";
import { createVehicleService, VehicleNotFoundError } from "./vehicle-service.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const environmentPath = resolve(sourceDirectory, "../../../../.env");
const migrationsFolder = resolve(sourceDirectory, "../../../../packages/database/drizzle");

if (existsSync(environmentPath)) {
  loadEnvFile(environmentPath);
}

const firstVehicleInput: CreateVehicleRequest = {
  nickname: "My i5",
  make: "BMW",
  model: "i5 eDrive40",
  year: 2025,
  batteryCapacityKwh: "81.20",
  efficiencyMiPerKwh: "3.10",
  connectorTypes: ["CCS", "J1772"],
  preferredNetworks: ["Electrify America"],
  isDefault: true,
};

const secondVehicleInput: CreateVehicleRequest = {
  nickname: "City EV",
  make: "Tesla",
  model: "Model 3",
  year: 2026,
  batteryCapacityKwh: "75.00",
  efficiencyMiPerKwh: "4.10",
  connectorTypes: ["NACS"],
  preferredNetworks: ["Tesla Supercharger"],
  isDefault: false,
};

let databaseConnection: DatabaseConnection | undefined;

function getTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;

  if (value === undefined || value.trim() === "") {
    throw new Error("TEST_DATABASE_URL is required for vehicle integration tests");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/u, ""));

  if (
    !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
    databaseName !== "chargewise_test"
  ) {
    throw new Error(
      'Vehicle integration tests may run only against a PostgreSQL database named "chargewise_test"',
    );
  }

  return value;
}

function requireDatabaseConnection(): DatabaseConnection {
  if (databaseConnection === undefined) {
    throw new Error("The vehicle test database is not ready");
  }

  return databaseConnection;
}

async function createUser(email: string): Promise<string> {
  const database = requireDatabaseConnection();

  const [createdUser] = await database.db
    .insert(users)
    .values({
      email,
      passwordHash: "$argon2id$vehicle-integration-test",
    })
    .returning({
      id: users.id,
    });

  if (createdUser === undefined) {
    throw new Error("Database did not return the test user");
  }

  return createdUser.id;
}

function createTestService() {
  const database = requireDatabaseConnection();

  return createVehicleService({
    vehicles: createVehicleRepository(database.db),
    runVehicleTransaction: createRunVehicleTransaction(database.db),
  });
}

describe("vehicle PostgreSQL integration", () => {
  beforeAll(async () => {
    databaseConnection = createDatabaseConnection(getTestDatabaseUrl());

    await migrate(databaseConnection.db, {
      migrationsFolder,
    });
  }, 30_000);

  beforeEach(async () => {
    await requireDatabaseConnection().db.delete(users);
  });

  afterAll(async () => {
    if (databaseConnection !== undefined) {
      await databaseConnection.db.delete(users);
      await databaseConnection.close();
    }
  }, 30_000);

  it("creates, lists, reads, updates, and deletes a vehicle", async () => {
    const userId = await createUser("owner@example.com");
    const service = createTestService();

    const createdVehicle = await service.create(userId, firstVehicleInput);

    expect(createdVehicle).toMatchObject({
      nickname: "My i5",
      make: "BMW",
      model: "i5 eDrive40",
      year: 2025,
      batteryCapacityKwh: "81.20",
      efficiencyMiPerKwh: "3.10",
      connectorTypes: ["CCS", "J1772"],
      preferredNetworks: ["Electrify America"],
      isDefault: true,
    });

    await expect(service.list(userId)).resolves.toEqual([createdVehicle]);

    await expect(service.get(userId, createdVehicle.id)).resolves.toEqual(createdVehicle);

    const updatedVehicle = await service.update(userId, createdVehicle.id, {
      nickname: "Road trip i5",
      preferredNetworks: ["Electrify America", "EVgo"],
    });

    expect(updatedVehicle).toMatchObject({
      id: createdVehicle.id,
      nickname: "Road trip i5",
      preferredNetworks: ["Electrify America", "EVgo"],
      isDefault: true,
    });

    await service.delete(userId, createdVehicle.id);

    await expect(service.list(userId)).resolves.toEqual([]);

    await expect(service.get(userId, createdVehicle.id)).rejects.toEqual(
      new VehicleNotFoundError(),
    );
  });

  it("keeps exactly one default vehicle when defaults switch", async () => {
    const userId = await createUser("defaults@example.com");
    const service = createTestService();

    const firstVehicle = await service.create(userId, firstVehicleInput);

    const secondVehicle = await service.create(userId, {
      ...secondVehicleInput,
      isDefault: true,
    });

    let listedVehicles = await service.list(userId);

    expect(listedVehicles.filter((vehicle) => vehicle.isDefault)).toEqual([
      expect.objectContaining({
        id: secondVehicle.id,
      }),
    ]);

    await service.update(userId, firstVehicle.id, {
      isDefault: true,
    });

    listedVehicles = await service.list(userId);

    expect(listedVehicles.filter((vehicle) => vehicle.isDefault)).toEqual([
      expect.objectContaining({
        id: firstVehicle.id,
      }),
    ]);

    expect(listedVehicles.find((vehicle) => vehicle.id === secondVehicle.id)?.isDefault).toBe(
      false,
    );
  });

  it("does not expose or mutate another user's vehicle", async () => {
    const ownerId = await createUser("owner@example.com");
    const otherUserId = await createUser("other-driver@example.com");
    const service = createTestService();

    const ownerVehicle = await service.create(ownerId, firstVehicleInput);

    await expect(service.list(otherUserId)).resolves.toEqual([]);

    await expect(service.get(otherUserId, ownerVehicle.id)).rejects.toEqual(
      new VehicleNotFoundError(),
    );

    await expect(
      service.update(otherUserId, ownerVehicle.id, {
        nickname: "Stolen update",
      }),
    ).rejects.toEqual(new VehicleNotFoundError());

    await expect(service.delete(otherUserId, ownerVehicle.id)).rejects.toEqual(
      new VehicleNotFoundError(),
    );

    await expect(service.get(ownerId, ownerVehicle.id)).resolves.toMatchObject({
      id: ownerVehicle.id,
      nickname: "My i5",
    });
  });

  it("rolls back default changes when vehicle creation fails", async () => {
    const userId = await createUser("rollback@example.com");
    const service = createTestService();

    const originalDefault = await service.create(userId, firstVehicleInput);

    await expect(
      service.create(userId, {
        ...secondVehicleInput,
        nickname: "x".repeat(81),
        isDefault: true,
      }),
    ).rejects.toBeDefined();

    const vehiclesAfterFailure = await service.list(userId);

    expect(vehiclesAfterFailure).toHaveLength(1);
    expect(vehiclesAfterFailure[0]).toMatchObject({
      id: originalDefault.id,
      isDefault: true,
    });
  });
});
