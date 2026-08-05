import {
  createVehicleRequestSchema,
  publicVehicleSchema,
  updateVehicleRequestSchema,
  vehicleListResponseSchema,
  vehiclePathParametersSchema,
  vehicleResponseSchema,
} from "@chargewise/shared";
import { describe, expect, it } from "vitest";

const validVehicleInput = {
  nickname: "My i5",
  make: "BMW",
  model: "i5 eDrive40",
  year: 2025,
  batteryCapacityKwh: "81.20",
  efficiencyMiPerKwh: "3.10",
  connectorTypes: ["CCS", "J1772"] as const,
  preferredNetworks: ["Electrify America"],
  isDefault: true,
};

const publicVehicle = {
  id: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  ...validVehicleInput,
  connectorTypes: [...validVehicleInput.connectorTypes],
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
};

describe("vehicle contract", () => {
  it("accepts and normalizes a valid create request", () => {
    expect(
      createVehicleRequestSchema.parse({
        ...validVehicleInput,
        nickname: "  My i5  ",
      }),
    ).toEqual(validVehicleInput);
  });

  it("applies optional create defaults", () => {
    const result = createVehicleRequestSchema.parse({
      nickname: "My i5",
      make: "BMW",
      model: "i5 eDrive40",
      year: 2025,
      connectorTypes: ["CCS"],
    });

    expect(result).toEqual({
      nickname: "My i5",
      make: "BMW",
      model: "i5 eDrive40",
      year: 2025,
      connectorTypes: ["CCS"],
      preferredNetworks: [],
      isDefault: false,
    });
  });

  it("rejects invalid vehicle values and unexpected fields", () => {
    expect(() =>
      createVehicleRequestSchema.parse({
        ...validVehicleInput,
        year: 1989,
      }),
    ).toThrow();

    expect(() =>
      createVehicleRequestSchema.parse({
        ...validVehicleInput,
        connectorTypes: [],
      }),
    ).toThrow();

    expect(() =>
      createVehicleRequestSchema.parse({
        ...validVehicleInput,
        batteryCapacityKwh: "0.00",
      }),
    ).toThrow();

    expect(() =>
      createVehicleRequestSchema.parse({
        ...validVehicleInput,
        unexpected: true,
      }),
    ).toThrow();
  });

  it("rejects duplicate connector types and preferred networks", () => {
    expect(() =>
      createVehicleRequestSchema.parse({
        ...validVehicleInput,
        connectorTypes: ["CCS", "CCS"],
      }),
    ).toThrow();

    expect(() =>
      createVehicleRequestSchema.parse({
        ...validVehicleInput,
        preferredNetworks: ["Electrify America", "Electrify America"],
      }),
    ).toThrow();
  });

  it("accepts a nonempty partial update and rejects an empty update", () => {
    expect(
      updateVehicleRequestSchema.parse({
        nickname: "Road trip car",
        isDefault: false,
      }),
    ).toEqual({
      nickname: "Road trip car",
      isDefault: false,
    });

    expect(() => updateVehicleRequestSchema.parse({})).toThrow();
  });

  it("validates vehicle path parameters", () => {
    expect(
      vehiclePathParametersSchema.parse({
        vehicleId: publicVehicle.id,
      }),
    ).toEqual({
      vehicleId: publicVehicle.id,
    });

    expect(() =>
      vehiclePathParametersSchema.parse({
        vehicleId: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("validates public vehicle responses", () => {
    expect(publicVehicleSchema.parse(publicVehicle)).toEqual(publicVehicle);

    expect(
      vehicleResponseSchema.parse({
        data: publicVehicle,
      }),
    ).toEqual({
      data: publicVehicle,
    });

    expect(
      vehicleListResponseSchema.parse({
        data: [publicVehicle],
      }),
    ).toEqual({
      data: [publicVehicle],
    });
  });
});
