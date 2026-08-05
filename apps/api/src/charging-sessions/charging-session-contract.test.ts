import {
  chargingSessionListQuerySchema,
  createChargingSessionRequestSchema,
  updateChargingSessionRequestSchema,
} from "@chargewise/shared";
import { describe, expect, it } from "vitest";

const validInput = {
  vehicleId: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  stationId: "ecba119c-963d-4931-acb8-1320791258be",
  startedAt: "2026-08-01T19:00:00.000Z",
  chargingMinutes: 31,
  waitMinutes: 8,
  energyAddedKwh: "42.700",
  totalCost: "0.00",
  startingSoc: 18,
  endingSoc: 79,
  odometerMiles: 15420,
  issueType: "NONE" as const,
  notes: "No wait after the first charger became available.",
};

describe("charging-session contract", () => {
  it("accepts a valid create request and applies the issue default", () => {
    const parsed = createChargingSessionRequestSchema.parse({
      ...validInput,
      issueType: undefined,
    });

    expect(parsed.issueType).toBe("NONE");
  });

  it("rejects invalid numeric and state-of-charge invariants", () => {
    expect(
      createChargingSessionRequestSchema.safeParse({
        ...validInput,
        energyAddedKwh: "0.000",
      }).success,
    ).toBe(false);

    expect(
      createChargingSessionRequestSchema.safeParse({
        ...validInput,
        endingSoc: validInput.startingSoc,
      }).success,
    ).toBe(false);
  });

  it("requires a nonempty patch and validates paired SOC fields", () => {
    expect(updateChargingSessionRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateChargingSessionRequestSchema.safeParse({
        startingSoc: 80,
        endingSoc: 70,
      }).success,
    ).toBe(false);
  });

  it("validates list date order and UUID cursors", () => {
    expect(
      chargingSessionListQuerySchema.safeParse({
        from: "2026-08-10",
        to: "2026-08-01",
      }).success,
    ).toBe(false);

    expect(
      chargingSessionListQuerySchema.safeParse({
        cursor: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
