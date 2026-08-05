import { chargingSessions, stations, type ChargeWiseDatabase } from "@chargewise/database";
import type {
  ChargingIssueType,
  CreateChargingSessionRequest,
  UpdateChargingSessionRequest,
} from "@chargewise/shared";
import { and, desc, eq, gte, lt, or, type SQL } from "drizzle-orm";

export interface ChargingSessionRecord {
  id: string;
  userId: string;
  vehicleId: string;
  stationId: string;
  startedAt: Date;
  chargingMinutes: number;
  waitMinutes: number;
  energyAddedKwh: string;
  totalCost: string;
  startingSoc: number;
  endingSoc: number;
  odometerMiles: number | null;
  issueType: ChargingIssueType;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChargingSessionListRepositoryInput {
  userId: string;
  from: Date | null;
  toExclusive: Date | null;
  cursor: ChargingSessionRecord | null;
  limit: number;
}

export interface ChargingSessionRepository {
  listByUser: (input: ChargingSessionListRepositoryInput) => Promise<ChargingSessionRecord[]>;
  findByIdForUser: (
    userId: string,
    chargingSessionId: string,
  ) => Promise<ChargingSessionRecord | null>;
  stationExists: (stationId: string) => Promise<boolean>;
  create: (userId: string, input: CreateChargingSessionRequest) => Promise<ChargingSessionRecord>;
  updateByIdForUser: (
    userId: string,
    chargingSessionId: string,
    input: UpdateChargingSessionRequest,
  ) => Promise<ChargingSessionRecord | null>;
  deleteByIdForUser: (userId: string, chargingSessionId: string) => Promise<boolean>;
}

export type ChargingSessionDatabase = Pick<
  ChargeWiseDatabase,
  "delete" | "insert" | "select" | "update"
>;

const chargingSessionSelection = {
  id: chargingSessions.id,
  userId: chargingSessions.userId,
  vehicleId: chargingSessions.vehicleId,
  stationId: chargingSessions.stationId,
  startedAt: chargingSessions.startedAt,
  chargingMinutes: chargingSessions.chargingMinutes,
  waitMinutes: chargingSessions.waitMinutes,
  energyAddedKwh: chargingSessions.energyAddedKwh,
  totalCost: chargingSessions.totalCost,
  startingSoc: chargingSessions.startingSoc,
  endingSoc: chargingSessions.endingSoc,
  odometerMiles: chargingSessions.odometerMiles,
  issueType: chargingSessions.issueType,
  notes: chargingSessions.notes,
  createdAt: chargingSessions.createdAt,
  updatedAt: chargingSessions.updatedAt,
};

export function createChargingSessionRepository(
  database: ChargingSessionDatabase,
): ChargingSessionRepository {
  async function findByIdForUser(
    userId: string,
    chargingSessionId: string,
  ): Promise<ChargingSessionRecord | null> {
    const [record] = await database
      .select(chargingSessionSelection)
      .from(chargingSessions)
      .where(and(eq(chargingSessions.id, chargingSessionId), eq(chargingSessions.userId, userId)))
      .limit(1);

    return record ?? null;
  }

  return {
    async listByUser(input) {
      const conditions: SQL[] = [eq(chargingSessions.userId, input.userId)];

      if (input.from !== null) {
        conditions.push(gte(chargingSessions.startedAt, input.from));
      }

      if (input.toExclusive !== null) {
        conditions.push(lt(chargingSessions.startedAt, input.toExclusive));
      }

      if (input.cursor !== null) {
        const cursorCondition = or(
          lt(chargingSessions.startedAt, input.cursor.startedAt),
          and(
            eq(chargingSessions.startedAt, input.cursor.startedAt),
            lt(chargingSessions.id, input.cursor.id),
          ),
        );

        if (cursorCondition !== undefined) {
          conditions.push(cursorCondition);
        }
      }

      return database
        .select(chargingSessionSelection)
        .from(chargingSessions)
        .where(and(...conditions))
        .orderBy(desc(chargingSessions.startedAt), desc(chargingSessions.id))
        .limit(input.limit);
    },

    findByIdForUser,

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

    async create(userId, input) {
      const [created] = await database
        .insert(chargingSessions)
        .values({
          userId,
          vehicleId: input.vehicleId,
          stationId: input.stationId,
          startedAt: new Date(input.startedAt),
          chargingMinutes: input.chargingMinutes,
          waitMinutes: input.waitMinutes,
          energyAddedKwh: input.energyAddedKwh,
          totalCost: input.totalCost,
          startingSoc: input.startingSoc,
          endingSoc: input.endingSoc,
          odometerMiles: input.odometerMiles ?? null,
          issueType: input.issueType,
          notes: input.notes ?? null,
        })
        .returning(chargingSessionSelection);

      if (created === undefined) {
        throw new Error("Database did not return the created charging session");
      }

      return created;
    },

    async updateByIdForUser(userId, chargingSessionId, input) {
      const values: Partial<typeof chargingSessions.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (input.vehicleId !== undefined) {
        values.vehicleId = input.vehicleId;
      }

      if (input.stationId !== undefined) {
        values.stationId = input.stationId;
      }

      if (input.startedAt !== undefined) {
        values.startedAt = new Date(input.startedAt);
      }

      if (input.chargingMinutes !== undefined) {
        values.chargingMinutes = input.chargingMinutes;
      }

      if (input.waitMinutes !== undefined) {
        values.waitMinutes = input.waitMinutes;
      }

      if (input.energyAddedKwh !== undefined) {
        values.energyAddedKwh = input.energyAddedKwh;
      }

      if (input.totalCost !== undefined) {
        values.totalCost = input.totalCost;
      }

      if (input.startingSoc !== undefined) {
        values.startingSoc = input.startingSoc;
      }

      if (input.endingSoc !== undefined) {
        values.endingSoc = input.endingSoc;
      }

      if (input.odometerMiles !== undefined) {
        values.odometerMiles = input.odometerMiles;
      }

      if (input.issueType !== undefined) {
        values.issueType = input.issueType;
      }

      if (input.notes !== undefined) {
        values.notes = input.notes;
      }

      const [updated] = await database
        .update(chargingSessions)
        .set(values)
        .where(and(eq(chargingSessions.id, chargingSessionId), eq(chargingSessions.userId, userId)))
        .returning(chargingSessionSelection);

      return updated ?? null;
    },

    async deleteByIdForUser(userId, chargingSessionId) {
      const [deleted] = await database
        .delete(chargingSessions)
        .where(and(eq(chargingSessions.id, chargingSessionId), eq(chargingSessions.userId, userId)))
        .returning({
          id: chargingSessions.id,
        });

      return deleted !== undefined;
    },
  };
}
