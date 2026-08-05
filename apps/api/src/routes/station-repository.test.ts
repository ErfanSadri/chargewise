import { describe, expect, it, vi } from "vitest";

import type { NormalizedStation } from "../providers/index.js";
import { createStationRepository, type StationDatabase } from "./station-repository.js";

const station: NormalizedStation = {
  sourceStationId: "1001",
  name: "Westfield Fast Charging",
  streetAddress: "6600 Topanga Canyon Boulevard",
  city: "Canoga Park",
  state: "CA",
  postalCode: "91303",
  countryCode: "US",
  network: "Electrify America",
  longitude: -118.605,
  latitude: 34.19,
  distanceFromRouteMeters: 1200,
  connectorCodes: ["CCS"],
  level2PortCount: 0,
  dcFastPortCount: 8,
  accessCode: "public",
  sourceStatus: "E",
  sourceUpdatedAt: "2026-08-02T20:00:00.000Z",
};

interface FakeDatabase {
  database: StationDatabase;
  insert: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
}

function createFakeDatabase(): FakeDatabase {
  const returning = vi.fn().mockResolvedValue([
    {
      sourceStationId: station.sourceStationId,
      id: "ecba119c-963d-4931-acb8-1320791258be",
    },
  ]);
  const onConflictDoUpdate = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));

  return {
    database: { insert } as unknown as StationDatabase,
    insert,
    values,
    onConflictDoUpdate,
    returning,
  };
}

describe("station repository", () => {
  it("does not issue an insert for an empty station list", async () => {
    const fake = createFakeDatabase();
    const repository = createStationRepository(fake.database);

    await expect(repository.upsertMany([])).resolves.toEqual([]);
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it("bulk upserts normalized stations and returns internal identities", async () => {
    const fake = createFakeDatabase();
    const repository = createStationRepository(fake.database);

    await expect(repository.upsertMany([station])).resolves.toEqual([
      {
        sourceStationId: station.sourceStationId,
        id: "ecba119c-963d-4931-acb8-1320791258be",
      },
    ]);

    const inserted = fake.values.mock.calls[0]?.[0] as Array<Record<string, unknown>> | undefined;

    expect(inserted).toHaveLength(1);
    expect(inserted?.[0]).toMatchObject({
      source: "NLR_AFDC",
      sourceStationId: station.sourceStationId,
      name: station.name,
      network: station.network,
      accessCode: "public",
      statusCode: "E",
      connectorCodes: ["CCS"],
      level2PortCount: 0,
      dcFastPortCount: 8,
      sourceUpdatedAt: new Date(station.sourceUpdatedAt),
    });
    expect(fake.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(fake.returning).toHaveBeenCalledTimes(1);
  });

  it("deduplicates repeated source station IDs before the upsert", async () => {
    const fake = createFakeDatabase();
    const repository = createStationRepository(fake.database);

    await repository.upsertMany([
      station,
      {
        ...station,
        name: "Updated station name",
      },
    ]);

    const inserted = fake.values.mock.calls[0]?.[0] as Array<Record<string, unknown>> | undefined;

    expect(inserted).toHaveLength(1);
    expect(inserted?.[0]).toMatchObject({
      sourceStationId: station.sourceStationId,
      name: "Updated station name",
    });
  });
});
