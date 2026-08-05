import {
  type CreateVehicleRequest,
  type PublicVehicle,
  type UpdateVehicleRequest,
  publicVehicleSchema,
} from "@chargewise/shared";

import type { VehicleRecord, VehicleRepository } from "./vehicle-repository.js";

export class VehicleNotFoundError extends Error {
  constructor() {
    super("Vehicle not found");
    this.name = "VehicleNotFoundError";
  }
}

export type RunVehicleTransaction = <Result>(
  operation: (repository: VehicleRepository) => Promise<Result>,
) => Promise<Result>;

export interface VehicleServiceOptions {
  vehicles: VehicleRepository;
  runVehicleTransaction: RunVehicleTransaction;
}

export interface VehicleService {
  list: (userId: string) => Promise<PublicVehicle[]>;
  get: (userId: string, vehicleId: string) => Promise<PublicVehicle>;
  create: (userId: string, input: CreateVehicleRequest) => Promise<PublicVehicle>;
  update: (
    userId: string,
    vehicleId: string,
    input: UpdateVehicleRequest,
  ) => Promise<PublicVehicle>;
  delete: (userId: string, vehicleId: string) => Promise<void>;
}

function toPublicVehicle(vehicle: VehicleRecord): PublicVehicle {
  return publicVehicleSchema.parse({
    id: vehicle.id,
    nickname: vehicle.nickname,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    batteryCapacityKwh: vehicle.batteryCapacityKwh,
    efficiencyMiPerKwh: vehicle.efficiencyMiPerKwh,
    connectorTypes: vehicle.connectorTypes,
    preferredNetworks: vehicle.preferredNetworks,
    isDefault: vehicle.isDefault,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  });
}

export function createVehicleService(options: VehicleServiceOptions): VehicleService {
  return {
    async list(userId) {
      const vehicles = await options.vehicles.listByUser(userId);

      return vehicles.map(toPublicVehicle);
    },

    async get(userId, vehicleId) {
      const vehicle = await options.vehicles.findByIdForUser(userId, vehicleId);

      if (vehicle === null) {
        throw new VehicleNotFoundError();
      }

      return toPublicVehicle(vehicle);
    },

    async create(userId, input) {
      return options.runVehicleTransaction(async (repository) => {
        if (input.isDefault) {
          await repository.clearDefaultForUser(userId);
        }

        const createdVehicle = await repository.create(userId, input);

        return toPublicVehicle(createdVehicle);
      });
    },

    async update(userId, vehicleId, input) {
      return options.runVehicleTransaction(async (repository) => {
        const existingVehicle = await repository.findByIdForUser(userId, vehicleId);

        if (existingVehicle === null) {
          throw new VehicleNotFoundError();
        }

        if (input.isDefault === true) {
          await repository.clearDefaultForUser(userId, vehicleId);
        }

        const updatedVehicle = await repository.updateByIdForUser(userId, vehicleId, input);

        if (updatedVehicle === null) {
          throw new VehicleNotFoundError();
        }

        return toPublicVehicle(updatedVehicle);
      });
    },

    async delete(userId, vehicleId) {
      const deleted = await options.vehicles.deleteByIdForUser(userId, vehicleId);

      if (!deleted) {
        throw new VehicleNotFoundError();
      }
    },
  };
}
