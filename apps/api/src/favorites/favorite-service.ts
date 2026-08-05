import { publicFavoriteSchema, type PublicFavorite } from "@chargewise/shared";

import type { FavoriteRecord, FavoriteRepository } from "./favorite-repository.js";

export class FavoriteStationNotFoundError extends Error {
  constructor() {
    super("Station not found");
    this.name = "FavoriteStationNotFoundError";
  }
}

export interface FavoriteService {
  list: (userId: string) => Promise<PublicFavorite[]>;
  add: (userId: string, stationId: string) => Promise<PublicFavorite>;
  remove: (userId: string, stationId: string) => Promise<void>;
}

export interface FavoriteServiceOptions {
  favorites: FavoriteRepository;
}

function toPublicFavorite(favorite: FavoriteRecord): PublicFavorite {
  return publicFavoriteSchema.parse({
    stationId: favorite.stationId,
    name: favorite.name,
    network: favorite.network,
    longitude: favorite.longitude,
    latitude: favorite.latitude,
    connectorCodes: favorite.connectorCodes,
    level2PortCount: favorite.level2PortCount,
    dcFastPortCount: favorite.dcFastPortCount,
    accessCode: favorite.accessCode,
    sourceStatus: favorite.sourceStatus,
    lastSyncedAt: favorite.lastSyncedAt.toISOString(),
    favoritedAt: favorite.favoritedAt.toISOString(),
    isFavorite: true,
  });
}

export function createFavoriteService(options: FavoriteServiceOptions): FavoriteService {
  return {
    async list(userId) {
      const favorites = await options.favorites.listByUser(userId);

      return favorites.map(toPublicFavorite);
    },

    async add(userId, stationId) {
      if (!(await options.favorites.stationExists(stationId))) {
        throw new FavoriteStationNotFoundError();
      }

      const favorite = await options.favorites.save(userId, stationId);

      return toPublicFavorite(favorite);
    },

    async remove(userId, stationId) {
      await options.favorites.remove(userId, stationId);
    },
  };
}
