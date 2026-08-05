import {
  chargingSessionListQuerySchema,
  createChargingSessionRequestSchema,
  publicChargingSessionSchema,
  updateChargingSessionRequestSchema,
  type ChargingSessionListQuery,
  type CreateChargingSessionRequest,
  type PublicChargingSession,
  type UpdateChargingSessionRequest,
} from "@chargewise/shared";

import type { VehicleRepository } from "../vehicles/vehicle-repository.js";
import type {
  ChargingSessionRecord,
  ChargingSessionRepository,
} from "./charging-session-repository.js";

const pageSize = 50;

export class ChargingSessionNotFoundError extends Error {
  constructor() {
    super("Charging session not found");
    this.name = "ChargingSessionNotFoundError";
  }
}

export class ChargingSessionVehicleNotFoundError extends Error {
  constructor() {
    super("Vehicle not found");
    this.name = "ChargingSessionVehicleNotFoundError";
  }
}

export class ChargingSessionStationNotFoundError extends Error {
  constructor() {
    super("Station not found");
    this.name = "ChargingSessionStationNotFoundError";
  }
}

export class InvalidChargingSessionInputError extends TypeError {
  constructor() {
    super("Charging session input is invalid");
    this.name = "InvalidChargingSessionInputError";
  }
}

export interface ChargingSessionListResult {
  sessions: PublicChargingSession[];
  nextCursor: string | null;
}

export interface ChargingSessionService {
  list: (userId: string, query: ChargingSessionListQuery) => Promise<ChargingSessionListResult>;
  get: (userId: string, chargingSessionId: string) => Promise<PublicChargingSession>;
  create: (userId: string, input: CreateChargingSessionRequest) => Promise<PublicChargingSession>;
  update: (
    userId: string,
    chargingSessionId: string,
    input: UpdateChargingSessionRequest,
  ) => Promise<PublicChargingSession>;
  delete: (userId: string, chargingSessionId: string) => Promise<void>;
}

export interface ChargingSessionServiceOptions {
  sessions: ChargingSessionRepository;
  vehicles: Pick<VehicleRepository, "findByIdForUser">;
}

function toPublicChargingSession(record: ChargingSessionRecord): PublicChargingSession {
  return publicChargingSessionSchema.parse({
    id: record.id,
    vehicleId: record.vehicleId,
    stationId: record.stationId,
    startedAt: record.startedAt.toISOString(),
    chargingMinutes: record.chargingMinutes,
    waitMinutes: record.waitMinutes,
    energyAddedKwh: record.energyAddedKwh,
    totalCost: record.totalCost,
    startingSoc: record.startingSoc,
    endingSoc: record.endingSoc,
    odometerMiles: record.odometerMiles,
    issueType: record.issueType,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function getExclusiveEndDate(value: string): Date {
  const date = parseUtcDate(value);

  date.setUTCDate(date.getUTCDate() + 1);

  return date;
}

async function requireOwnedVehicle(
  options: ChargingSessionServiceOptions,
  userId: string,
  vehicleId: string,
): Promise<void> {
  const vehicle = await options.vehicles.findByIdForUser(userId, vehicleId);

  if (vehicle === null) {
    throw new ChargingSessionVehicleNotFoundError();
  }
}

async function requireStation(
  options: ChargingSessionServiceOptions,
  stationId: string,
): Promise<void> {
  if (!(await options.sessions.stationExists(stationId))) {
    throw new ChargingSessionStationNotFoundError();
  }
}

function mergeSessionUpdate(
  existing: ChargingSessionRecord,
  input: UpdateChargingSessionRequest,
): CreateChargingSessionRequest {
  const candidate = {
    vehicleId: input.vehicleId ?? existing.vehicleId,
    stationId: input.stationId ?? existing.stationId,
    startedAt: input.startedAt ?? existing.startedAt.toISOString(),
    chargingMinutes: input.chargingMinutes ?? existing.chargingMinutes,
    waitMinutes: input.waitMinutes ?? existing.waitMinutes,
    energyAddedKwh: input.energyAddedKwh ?? existing.energyAddedKwh,
    totalCost: input.totalCost ?? existing.totalCost,
    startingSoc: input.startingSoc ?? existing.startingSoc,
    endingSoc: input.endingSoc ?? existing.endingSoc,
    odometerMiles: input.odometerMiles !== undefined ? input.odometerMiles : existing.odometerMiles,
    issueType: input.issueType ?? existing.issueType,
    notes: input.notes !== undefined ? input.notes : existing.notes,
  };

  const validation = createChargingSessionRequestSchema.safeParse(candidate);

  if (!validation.success) {
    throw new InvalidChargingSessionInputError();
  }

  return validation.data;
}

export function createChargingSessionService(
  options: ChargingSessionServiceOptions,
): ChargingSessionService {
  return {
    async list(userId, query) {
      const validation = chargingSessionListQuerySchema.safeParse(query);

      if (!validation.success) {
        throw new InvalidChargingSessionInputError();
      }

      let cursor: ChargingSessionRecord | null = null;

      if (validation.data.cursor !== undefined) {
        cursor = await options.sessions.findByIdForUser(userId, validation.data.cursor);

        if (cursor === null) {
          throw new ChargingSessionNotFoundError();
        }
      }

      const records = await options.sessions.listByUser({
        userId,
        from: validation.data.from === undefined ? null : parseUtcDate(validation.data.from),
        toExclusive:
          validation.data.to === undefined ? null : getExclusiveEndDate(validation.data.to),
        cursor,
        limit: pageSize + 1,
      });

      const hasNextPage = records.length > pageSize;
      const page = records.slice(0, pageSize);
      const lastRecord = page.at(-1);

      return {
        sessions: page.map(toPublicChargingSession),
        nextCursor: hasNextPage && lastRecord !== undefined ? lastRecord.id : null,
      };
    },

    async get(userId, chargingSessionId) {
      const record = await options.sessions.findByIdForUser(userId, chargingSessionId);

      if (record === null) {
        throw new ChargingSessionNotFoundError();
      }

      return toPublicChargingSession(record);
    },

    async create(userId, input) {
      const validation = createChargingSessionRequestSchema.safeParse(input);

      if (!validation.success) {
        throw new InvalidChargingSessionInputError();
      }

      await requireOwnedVehicle(options, userId, validation.data.vehicleId);
      await requireStation(options, validation.data.stationId);

      const record = await options.sessions.create(userId, validation.data);

      return toPublicChargingSession(record);
    },

    async update(userId, chargingSessionId, input) {
      const updateValidation = updateChargingSessionRequestSchema.safeParse(input);

      if (!updateValidation.success) {
        throw new InvalidChargingSessionInputError();
      }

      const existing = await options.sessions.findByIdForUser(userId, chargingSessionId);

      if (existing === null) {
        throw new ChargingSessionNotFoundError();
      }

      const merged = mergeSessionUpdate(existing, updateValidation.data);

      await requireOwnedVehicle(options, userId, merged.vehicleId);
      await requireStation(options, merged.stationId);

      const updated = await options.sessions.updateByIdForUser(
        userId,
        chargingSessionId,
        updateValidation.data,
      );

      if (updated === null) {
        throw new ChargingSessionNotFoundError();
      }

      return toPublicChargingSession(updated);
    },

    async delete(userId, chargingSessionId) {
      const deleted = await options.sessions.deleteByIdForUser(userId, chargingSessionId);

      if (!deleted) {
        throw new ChargingSessionNotFoundError();
      }
    },
  };
}
