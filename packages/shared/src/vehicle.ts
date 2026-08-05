import { z } from "zod";

export const vehicleConnectorTypeSchema = z.enum(["CCS", "NACS", "J1772", "CHADEMO"]);

const vehicleNicknameSchema = z.string().trim().min(1).max(80);
const vehicleMakeSchema = z.string().trim().min(1).max(80);
const vehicleModelSchema = z.string().trim().min(1).max(120);
const vehicleYearSchema = z.number().int().min(1990).max(2100);
const preferredNetworkSchema = z.string().trim().min(1).max(120);

function createPositiveDecimalSchema(maximumIntegerDigits: number, decimalPlaces: number) {
  const pattern = new RegExp(
    `^(?:0|[1-9]\\d{0,${maximumIntegerDigits - 1}})(?:\\.\\d{1,${decimalPlaces}})?$`,
    "u",
  );

  return z
    .string()
    .regex(pattern)
    .refine((value) => Number(value) > 0, {
      message: "Value must be greater than zero",
    });
}

const batteryCapacityKwhSchema = createPositiveDecimalSchema(4, 2);
const efficiencyMiPerKwhSchema = createPositiveDecimalSchema(3, 2);

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const connectorTypesSchema = z.array(vehicleConnectorTypeSchema).min(1).refine(hasUniqueValues, {
  message: "Connector types must not contain duplicates",
});

const preferredNetworksSchema = z.array(preferredNetworkSchema).refine(hasUniqueValues, {
  message: "Preferred networks must not contain duplicates",
});

const mutableVehicleFieldsSchema = z.object({
  nickname: vehicleNicknameSchema,
  make: vehicleMakeSchema,
  model: vehicleModelSchema,
  year: vehicleYearSchema,
  batteryCapacityKwh: batteryCapacityKwhSchema.nullable(),
  efficiencyMiPerKwh: efficiencyMiPerKwhSchema.nullable(),
  connectorTypes: connectorTypesSchema,
  preferredNetworks: preferredNetworksSchema,
  isDefault: z.boolean(),
});

export const createVehicleRequestSchema = z
  .object({
    nickname: vehicleNicknameSchema,
    make: vehicleMakeSchema,
    model: vehicleModelSchema,
    year: vehicleYearSchema,
    batteryCapacityKwh: batteryCapacityKwhSchema.nullable().optional(),
    efficiencyMiPerKwh: efficiencyMiPerKwhSchema.nullable().optional(),
    connectorTypes: connectorTypesSchema,
    preferredNetworks: preferredNetworksSchema.default([]),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const updateVehicleRequestSchema = mutableVehicleFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one vehicle field is required",
  });

export const vehiclePathParametersSchema = z
  .object({
    vehicleId: z.string().uuid(),
  })
  .strict();

export const publicVehicleSchema = mutableVehicleFieldsSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const vehicleResponseSchema = z
  .object({
    data: publicVehicleSchema,
  })
  .strict();

export const vehicleListResponseSchema = z
  .object({
    data: z.array(publicVehicleSchema),
  })
  .strict();

export type VehicleConnectorType = z.infer<typeof vehicleConnectorTypeSchema>;
export type CreateVehicleRequest = z.infer<typeof createVehicleRequestSchema>;
export type UpdateVehicleRequest = z.infer<typeof updateVehicleRequestSchema>;
export type PublicVehicle = z.infer<typeof publicVehicleSchema>;
export type VehicleResponse = z.infer<typeof vehicleResponseSchema>;
export type VehicleListResponse = z.infer<typeof vehicleListResponseSchema>;
