import type { CreateChargingSessionRequest, PublicChargingSession } from "@chargewise/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VehicleRepository } from "../vehicles/vehicle-repository.js";
import type {
  ChargingSessionRecord,
  ChargingSessionRepository,
} from "./charging-session-repository.js";
import {
  ChargingSessionNotFoundError,
  ChargingSessionVehicleNotFoundError,
  InvalidChargingSessionInputError,
  createChargingSessionService,
} from "./charging-session-service.js";

const userId = "2d9b977f-fac0-47f1-bf48-59406c414722";
const vehicleId = "6f719184-e691-4c73-bf4f-4e353c40cd99";
const stationId = "ecba119c-963d-4931-acb8-1320791258be";
const sessionId = "0f30c755-32c8-49c7-9aef-f53f761355c5";

const createInput: CreateChargingSessionRequest = {
  vehicleId,
  stationId,
  startedAt: "2026-08-01T19:00:00.000Z",
  chargingMinutes: 31,
  waitMinutes: 8,
  energyAddedKwh: "42.700",
  totalCost: "0.00",
  startingSoc: 18,
  endingSoc: 79,
  odometerMiles: 15420,
  issueType: "NONE",
  notes: "Successful session",
};

const record: ChargingSessionRecord = {
  id: sessionId,
  userId,
  vehicleId,
  stationId,
  startedAt: new Date(createInput.startedAt),
  chargingMinutes: createInput.chargingMinutes,
  waitMinutes: createInput.waitMinutes,
  energyAddedKwh: createInput.energyAddedKwh,
  totalCost: createInput.totalCost,
  startingSoc: createInput.startingSoc,
  endingSoc: createInput.endingSoc,
  odometerMiles: createInput.odometerMiles ?? null,
  issueType: createInput.issueType,
  notes: createInput.notes ?? null,
  createdAt: new Date("2026-08-01T20:00:00.000Z"),
  updatedAt: new Date("2026-08-01T20:00:00.000Z"),
};

const publicSession: PublicChargingSession = {
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
};

function createSessionRepository(): ChargingSessionRepository {
  return {
    listByUser: vi.fn().mockResolvedValue([record]),
    findByIdForUser: vi.fn().mockResolvedValue(record),
    stationExists: vi.fn().mockResolvedValue(true),
    create: vi.fn().mockResolvedValue(record),
    updateByIdForUser: vi.fn().mockResolvedValue(record),
    deleteByIdForUser: vi.fn().mockResolvedValue(true),
  };
}

function createVehicleRepository(): Pick<VehicleRepository, "findByIdForUser"> {
  return {
    findByIdForUser: vi.fn().mockResolvedValue({
      id: vehicleId,
    }),
  } as unknown as Pick<VehicleRepository, "findByIdForUser">;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("charging-session service", () => {
  it("creates a session only after checking vehicle ownership and station existence", async () => {
    const sessions = createSessionRepository();
    const vehicles = createVehicleRepository();
    const service = createChargingSessionService({
      sessions,
      vehicles,
    });

    await expect(service.create(userId, createInput)).resolves.toEqual(publicSession);
    expect(vehicles.findByIdForUser).toHaveBeenCalledWith(userId, vehicleId);
    expect(sessions.stationExists).toHaveBeenCalledWith(stationId);
    expect(sessions.create).toHaveBeenCalledWith(userId, createInput);
  });

  it("rejects a vehicle that is not owned by the authenticated user", async () => {
    const sessions = createSessionRepository();
    const vehicles = createVehicleRepository();

    vi.mocked(vehicles.findByIdForUser).mockResolvedValue(null);

    const service = createChargingSessionService({
      sessions,
      vehicles,
    });

    await expect(service.create(userId, createInput)).rejects.toBeInstanceOf(
      ChargingSessionVehicleNotFoundError,
    );
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("validates a partial update against the complete stored session", async () => {
    const sessions = createSessionRepository();
    const service = createChargingSessionService({
      sessions,
      vehicles: createVehicleRepository(),
    });

    await expect(
      service.update(userId, sessionId, {
        startingSoc: 90,
      }),
    ).rejects.toBeInstanceOf(InvalidChargingSessionInputError);

    expect(sessions.updateByIdForUser).not.toHaveBeenCalled();
  });

  it("does not expose an absent or cross-user session", async () => {
    const sessions = createSessionRepository();

    vi.mocked(sessions.findByIdForUser).mockResolvedValue(null);
    vi.mocked(sessions.deleteByIdForUser).mockResolvedValue(false);

    const service = createChargingSessionService({
      sessions,
      vehicles: createVehicleRepository(),
    });

    await expect(service.get(userId, sessionId)).rejects.toBeInstanceOf(
      ChargingSessionNotFoundError,
    );
    await expect(service.delete(userId, sessionId)).rejects.toBeInstanceOf(
      ChargingSessionNotFoundError,
    );
  });

  it("uses an owned cursor and returns a next cursor for oversized pages", async () => {
    const sessions = createSessionRepository();
    const records = Array.from({ length: 51 }, (_, index) => ({
      ...record,
      id: index === 50 ? "e938f5dd-2729-48ab-a5ee-a0f9f278f1c7" : record.id,
    }));

    vi.mocked(sessions.listByUser).mockResolvedValue(records);

    const service = createChargingSessionService({
      sessions,
      vehicles: createVehicleRepository(),
    });

    const result = await service.list(userId, {
      cursor: sessionId,
    });

    expect(sessions.findByIdForUser).toHaveBeenCalledWith(userId, sessionId);
    expect(result.sessions).toHaveLength(50);
    expect(result.nextCursor).toBe(record.id);
  });
});
