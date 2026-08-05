import { favorites, stations, type ChargeWiseDatabase } from "@chargewise/database";
import { and, asc, desc, eq, sql } from "drizzle-orm";

export interface FavoriteRecord {
  stationId: string;
  name: string;
  network: string | null;
  longitude: number;
  latitude: number;
  connectorCodes: string[];
  level2PortCount: number;
  dcFastPortCount: number;
  accessCode: string;
  sourceStatus: string;
  lastSyncedAt: Date;
  favoritedAt: Date;
}

export interface FavoriteRepository {
  listByUser: (userId: string) => Promise<FavoriteRecord[]>;
  findByUserAndStation: (userId: string, stationId: string) => Promise<FavoriteRecord | null>;
  stationExists: (stationId: string) => Promise<boolean>;
  save: (userId: string, stationId: string) => Promise<FavoriteRecord>;
  remove: (userId: string, stationId: string) => Promise<void>;
  findStationIdsByUser: (userId: string) => Promise<string[]>;
}

export type FavoriteDatabase = Pick<ChargeWiseDatabase, "delete" | "insert" | "select">;

const favoriteSelection = {
  stationId: stations.id,
  name: stations.name,
  network: stations.network,
  longitude: sql<number>`ST_X(${stations.location}::geometry)`,
  latitude: sql<number>`ST_Y(${stations.location}::geometry)`,
  connectorCodes: stations.connectorCodes,
  level2PortCount: stations.level2PortCount,
  dcFastPortCount: stations.dcFastPortCount,
  accessCode: stations.accessCode,
  sourceStatus: stations.statusCode,
  lastSyncedAt: stations.lastSyncedAt,
  favoritedAt: favorites.createdAt,
};

interface FavoriteSelectionRecord {
  stationId: string;
  name: string;
  network: string | null;
  longitude: number;
  latitude: number;
  connectorCodes: string[];
  level2PortCount: number;
  dcFastPortCount: number;
  accessCode: string | null;
  sourceStatus: string | null;
  lastSyncedAt: Date;
  favoritedAt: Date;
}

function toFavoriteRecord(value: FavoriteSelectionRecord): FavoriteRecord {
  return {
    ...value,
    accessCode: value.accessCode ?? "unknown",
    sourceStatus: value.sourceStatus ?? "unknown",
  };
}

export function createFavoriteRepository(database: FavoriteDatabase): FavoriteRepository {
  async function findByUserAndStation(
    userId: string,
    stationId: string,
  ): Promise<FavoriteRecord | null> {
    const [favorite] = await database
      .select(favoriteSelection)
      .from(favorites)
      .innerJoin(stations, eq(favorites.stationId, stations.id))
      .where(and(eq(favorites.userId, userId), eq(favorites.stationId, stationId)))
      .limit(1);

    return favorite === undefined ? null : toFavoriteRecord(favorite);
  }

  return {
    async listByUser(userId) {
      const results = await database
        .select(favoriteSelection)
        .from(favorites)
        .innerJoin(stations, eq(favorites.stationId, stations.id))
        .where(eq(favorites.userId, userId))
        .orderBy(desc(favorites.createdAt), asc(stations.name), asc(stations.id));

      return results.map(toFavoriteRecord);
    },

    findByUserAndStation,

    async stationExists(stationId) {
      const [station] = await database
        .select({
          id: stations.id,
        })
        .from(stations)
        .where(eq(stations.id, stationId))
        .limit(1);

      return station !== undefined;
    },

    async save(userId, stationId) {
      await database
        .insert(favorites)
        .values({
          userId,
          stationId,
        })
        .onConflictDoNothing({
          target: [favorites.userId, favorites.stationId],
        });

      const favorite = await findByUserAndStation(userId, stationId);

      if (favorite === null) {
        throw new Error("Database did not return the saved favorite");
      }

      return favorite;
    },

    async remove(userId, stationId) {
      await database
        .delete(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.stationId, stationId)));
    },

    async findStationIdsByUser(userId) {
      const results = await database
        .select({
          stationId: favorites.stationId,
        })
        .from(favorites)
        .where(eq(favorites.userId, userId))
        .orderBy(asc(favorites.stationId));

      return results.map((favorite) => favorite.stationId);
    },
  };
}
