import type { PublicFavorite } from "@chargewise/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FavoriteRecord, FavoriteRepository } from "./favorite-repository.js";
import { createFavoriteService, FavoriteStationNotFoundError } from "./favorite-service.js";

const userId = "2d9b977f-fac0-47f1-bf48-59406c414722";
const stationId = "ecba119c-963d-4931-acb8-1320791258be";
const favoritedAt = new Date("2026-08-05T06:00:00.000Z");
const lastSyncedAt = new Date("2026-08-02T20:00:00.000Z");

const favoriteRecord: FavoriteRecord = {
  stationId,
  name: "Westfield Fast Charging",
  network: "Electrify America",
  longitude: -118.605,
  latitude: 34.19,
  connectorCodes: ["CCS"],
  level2PortCount: 0,
  dcFastPortCount: 8,
  accessCode: "public",
  sourceStatus: "E",
  lastSyncedAt,
  favoritedAt,
};

const publicFavorite: PublicFavorite = {
  stationId,
  name: favoriteRecord.name,
  network: favoriteRecord.network,
  longitude: favoriteRecord.longitude,
  latitude: favoriteRecord.latitude,
  connectorCodes: ["CCS"],
  level2PortCount: 0,
  dcFastPortCount: 8,
  accessCode: "public",
  sourceStatus: "E",
  lastSyncedAt: lastSyncedAt.toISOString(),
  favoritedAt: favoritedAt.toISOString(),
  isFavorite: true,
};

function createRepository(): FavoriteRepository {
  return {
    listByUser: vi.fn().mockResolvedValue([favoriteRecord]),
    findByUserAndStation: vi.fn().mockResolvedValue(favoriteRecord),
    stationExists: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(favoriteRecord),
    remove: vi.fn().mockResolvedValue(undefined),
    findStationIdsByUser: vi.fn().mockResolvedValue([stationId]),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("favorite service", () => {
  it("lists only favorites returned for the authenticated user", async () => {
    const favorites = createRepository();
    const service = createFavoriteService({ favorites });

    await expect(service.list(userId)).resolves.toEqual([publicFavorite]);
    expect(favorites.listByUser).toHaveBeenCalledWith(userId);
  });

  it("saves an existing station and returns its public representation", async () => {
    const favorites = createRepository();
    const service = createFavoriteService({ favorites });

    await expect(service.add(userId, stationId)).resolves.toEqual(publicFavorite);
    expect(favorites.stationExists).toHaveBeenCalledWith(stationId);
    expect(favorites.save).toHaveBeenCalledWith(userId, stationId);
  });

  it("rejects a favorite for a station that does not exist", async () => {
    const favorites = createRepository();
    vi.mocked(favorites.stationExists).mockResolvedValue(false);

    const service = createFavoriteService({ favorites });

    await expect(service.add(userId, stationId)).rejects.toBeInstanceOf(
      FavoriteStationNotFoundError,
    );
    expect(favorites.save).not.toHaveBeenCalled();
  });

  it("removes a favorite without requiring the relationship to exist", async () => {
    const favorites = createRepository();
    const service = createFavoriteService({ favorites });

    await expect(service.remove(userId, stationId)).resolves.toBeUndefined();
    expect(favorites.remove).toHaveBeenCalledWith(userId, stationId);
  });
});
