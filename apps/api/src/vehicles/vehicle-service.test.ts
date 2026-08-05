import type { CreateVehicleRequest, UpdateVehicleRequest } from "@chargewise/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVehicleService,
  type RunVehicleTransaction,
  VehicleNotFoundError,
} from "./vehicle-service.js";
import type { VehicleRecord, VehicleRepository } from "./vehicle-repository.js";

const userId = "73a9ec58-90f7-45b8-b53a-bc3a25a92ae4";
const vehicleId = "6f719184-e691-4c73-bf4f-4e353c40cd99";

const createInput: CreateVehicleRequest = {
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

const vehicleRecord: VehicleRecord = {
  id: vehicleId,
  userId,
  ...createInput,
  batteryCapacityKwh: "81.20",
  efficiencyMiPerKwh: "3.10",
  createdAt: new Date("2026-08-04T12:00:00.000Z"),
  updatedAt: new Date("2026-08-04T12:00:00.000Z"),
};

function createRepository(): VehicleRepository {
  const listByUser = vi.fn<VehicleRepository["listByUser"]>();
  const findByIdForUser = vi.fn<VehicleRepository["findByIdForUser"]>();
  const create = vi.fn<VehicleRepository["create"]>();
  const updateByIdForUser = vi.fn<VehicleRepository["updateByIdForUser"]>();
  const deleteByIdForUser = vi.fn<VehicleRepository["deleteByIdForUser"]>();
  const clearDefaultForUser = vi.fn<VehicleRepository["clearDefaultForUser"]>();

  listByUser.mockResolvedValue([]);
  findByIdForUser.mockResolvedValue(null);
  create.mockResolvedValue(vehicleRecord);
  updateByIdForUser.mockResolvedValue(vehicleRecord);
  deleteByIdForUser.mockResolvedValue(true);
  clearDefaultForUser.mockResolvedValue();

  return {
    listByUser,
    findByIdForUser,
    create,
    updateByIdForUser,
    deleteByIdForUser,
    clearDefaultForUser,
  };
}

describe("vehicle service", () => {
  let repository: VehicleRepository;
  let transactionRepository: VehicleRepository;
  let runVehicleTransaction: RunVehicleTransaction;

  beforeEach(() => {
    repository = createRepository();
    transactionRepository = createRepository();

    runVehicleTransaction = async (operation) => operation(transactionRepository);
  });

  it("lists only vehicles belonging to the authenticated user", async () => {
    vi.mocked(repository.listByUser).mockResolvedValue([vehicleRecord]);

    const service = createVehicleService({
      vehicles: repository,
      runVehicleTransaction,
    });

    await expect(service.list(userId)).resolves.toEqual([
      {
        id: vehicleId,
        nickname: "My i5",
        make: "BMW",
        model: "i5 eDrive40",
        year: 2025,
        batteryCapacityKwh: "81.20",
        efficiencyMiPerKwh: "3.10",
        connectorTypes: ["CCS", "J1772"],
        preferredNetworks: ["Electrify America"],
        isDefault: true,
        createdAt: "2026-08-04T12:00:00.000Z",
        updatedAt: "2026-08-04T12:00:00.000Z",
      },
    ]);

    expect(repository.listByUser).toHaveBeenCalledWith(userId);
  });

  it("returns a user-owned vehicle", async () => {
    vi.mocked(repository.findByIdForUser).mockResolvedValue(vehicleRecord);

    const service = createVehicleService({
      vehicles: repository,
      runVehicleTransaction,
    });

    await expect(service.get(userId, vehicleId)).resolves.toMatchObject({
      id: vehicleId,
      nickname: "My i5",
    });

    expect(repository.findByIdForUser).toHaveBeenCalledWith(userId, vehicleId);
  });

  it("uses the same not-found result for missing and unowned vehicles", async () => {
    const service = createVehicleService({
      vehicles: repository,
      runVehicleTransaction,
    });

    await expect(service.get(userId, vehicleId)).rejects.toEqual(new VehicleNotFoundError());
  });

  it("clears the previous default before creating a default vehicle", async () => {
    const service = createVehicleService({
      vehicles: repository,
      runVehicleTransaction,
    });

    await service.create(userId, createInput);

    expect(transactionRepository.clearDefaultForUser).toHaveBeenCalledWith(userId);

    expect(transactionRepository.create).toHaveBeenCalledWith(userId, createInput);
  });

  it("does not clear defaults when creating a nondefault vehicle", async () => {
    const service = createVehicleService({
      vehicles: repository,
      runVehicleTransaction,
    });

    await service.create(userId, {
      ...createInput,
      isDefault: false,
    });

    expect(transactionRepository.clearDefaultForUser).not.toHaveBeenCalled();
  });

  it("checks ownership before changing the default vehicle", async () => {
    const input: UpdateVehicleRequest = {
      nickname: "Road trip car",
      isDefault: true,
    };

    vi.mocked(transactionRepository.findByIdForUser).mockResolvedValue(vehicleRecord);

    const service = createVehicleService({
      vehicles: repository,
      runVehicleTransaction,
    });

    await service.update(userId, vehicleId, input);

    expect(transactionRepository.findByIdForUser).toHaveBeenCalledWith(userId, vehicleId);

    expect(transactionRepository.clearDefaultForUser).toHaveBeenCalledWith(userId, vehicleId);

    expect(transactionRepository.updateByIdForUser).toHaveBeenCalledWith(userId, vehicleId, input);
  });

  it("does not mutate defaults when the vehicle is unowned", async () => {
    const service = createVehicleService({
      vehicles: repository,
      runVehicleTransaction,
    });

    await expect(
      service.update(userId, vehicleId, {
        isDefault: true,
      }),
    ).rejects.toEqual(new VehicleNotFoundError());

    expect(transactionRepository.clearDefaultForUser).not.toHaveBeenCalled();

    expect(transactionRepository.updateByIdForUser).not.toHaveBeenCalled();
  });

  it("deletes only a user-owned vehicle", async () => {
    const service = createVehicleService({
      vehicles: repository,
      runVehicleTransaction,
    });

    await expect(service.delete(userId, vehicleId)).resolves.toBeUndefined();

    expect(repository.deleteByIdForUser).toHaveBeenCalledWith(userId, vehicleId);
  });

  it("reports not found when deletion affects no owned vehicle", async () => {
    vi.mocked(repository.deleteByIdForUser).mockResolvedValue(false);

    const service = createVehicleService({
      vehicles: repository,
      runVehicleTransaction,
    });

    await expect(service.delete(userId, vehicleId)).rejects.toEqual(new VehicleNotFoundError());
  });
});
