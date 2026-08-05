import { type ChargeWiseDatabase, vehicles } from "@chargewise/database";
import {
  type CreateVehicleRequest,
  type UpdateVehicleRequest,
  type VehicleConnectorType,
  vehicleConnectorTypeSchema,
} from "@chargewise/shared";
import { and, asc, desc, eq, ne } from "drizzle-orm";

export interface VehicleRecord {
  id: string;
  userId: string;
  nickname: string;
  make: string;
  model: string;
  year: number;
  batteryCapacityKwh: string | null;
  efficiencyMiPerKwh: string | null;
  connectorTypes: VehicleConnectorType[];
  preferredNetworks: string[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleRepository {
  listByUser: (userId: string) => Promise<VehicleRecord[]>;
  findByIdForUser: (userId: string, vehicleId: string) => Promise<VehicleRecord | null>;
  create: (userId: string, input: CreateVehicleRequest) => Promise<VehicleRecord>;
  updateByIdForUser: (
    userId: string,
    vehicleId: string,
    input: UpdateVehicleRequest,
  ) => Promise<VehicleRecord | null>;
  deleteByIdForUser: (userId: string, vehicleId: string) => Promise<boolean>;
  clearDefaultForUser: (userId: string, exceptVehicleId?: string) => Promise<void>;
}

export type VehicleDatabase = Pick<ChargeWiseDatabase, "delete" | "insert" | "select" | "update">;

const vehicleSelection = {
  id: vehicles.id,
  userId: vehicles.userId,
  nickname: vehicles.nickname,
  make: vehicles.make,
  model: vehicles.model,
  year: vehicles.year,
  batteryCapacityKwh: vehicles.batteryCapacityKwh,
  efficiencyMiPerKwh: vehicles.efficiencyMiPerKwh,
  connectorTypes: vehicles.connectorTypes,
  preferredNetworks: vehicles.preferredNetworks,
  isDefault: vehicles.isDefault,
  createdAt: vehicles.createdAt,
  updatedAt: vehicles.updatedAt,
};

function toVehicleRecord(vehicle: typeof vehicles.$inferSelect): VehicleRecord {
  return {
    ...vehicle,
    connectorTypes: vehicle.connectorTypes.map((connectorType) =>
      vehicleConnectorTypeSchema.parse(connectorType),
    ),
  };
}

export function createVehicleRepository(database: VehicleDatabase): VehicleRepository {
  return {
    async listByUser(userId) {
      const results = await database
        .select(vehicleSelection)
        .from(vehicles)
        .where(eq(vehicles.userId, userId))
        .orderBy(desc(vehicles.isDefault), asc(vehicles.createdAt), asc(vehicles.id));

      return results.map(toVehicleRecord);
    },

    async findByIdForUser(userId, vehicleId) {
      const [vehicle] = await database
        .select(vehicleSelection)
        .from(vehicles)
        .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId)))
        .limit(1);

      return vehicle === undefined ? null : toVehicleRecord(vehicle);
    },

    async create(userId, input) {
      const [createdVehicle] = await database
        .insert(vehicles)
        .values({
          userId,
          ...input,
        })
        .returning(vehicleSelection);

      if (createdVehicle === undefined) {
        throw new Error("Database did not return the created vehicle");
      }

      return toVehicleRecord(createdVehicle);
    },

    async updateByIdForUser(userId, vehicleId, input) {
      const [updatedVehicle] = await database
        .update(vehicles)
        .set(input)
        .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId)))
        .returning(vehicleSelection);

      return updatedVehicle === undefined ? null : toVehicleRecord(updatedVehicle);
    },

    async deleteByIdForUser(userId, vehicleId) {
      const [deletedVehicle] = await database
        .delete(vehicles)
        .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId)))
        .returning({
          id: vehicles.id,
        });

      return deletedVehicle !== undefined;
    },

    async clearDefaultForUser(userId, exceptVehicleId) {
      const condition =
        exceptVehicleId === undefined
          ? and(eq(vehicles.userId, userId), eq(vehicles.isDefault, true))
          : and(
              eq(vehicles.userId, userId),
              eq(vehicles.isDefault, true),
              ne(vehicles.id, exceptVehicleId),
            );

      await database
        .update(vehicles)
        .set({
          isDefault: false,
        })
        .where(condition);
    },
  };
}
