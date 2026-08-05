import {
  analyticsDateRangeQuerySchema,
  analyticsNetworksResponseSchema,
  analyticsStationsResponseSchema,
  analyticsSummaryResponseSchema,
} from "@chargewise/shared";
import { describe, expect, it } from "vitest";

describe("analytics contract", () => {
  it("accepts an empty summary without misleading averages", () => {
    expect(
      analyticsSummaryResponseSchema.parse({
        data: {
          sessionCount: 0,
          totalEnergyKwh: "0.000",
          totalCost: "0.00",
          averageCostPerKwh: null,
          averageChargingMinutes: null,
          averageWaitMinutes: null,
          averageObservedPowerKw: null,
          issueFreePercentage: null,
        },
      }),
    ).toBeDefined();
  });

  it("rejects malformed decimal output", () => {
    expect(
      analyticsSummaryResponseSchema.safeParse({
        data: {
          sessionCount: 1,
          totalEnergyKwh: "NaN",
          totalCost: "1.00",
          averageCostPerKwh: "0.1000",
          averageChargingMinutes: "30.00",
          averageWaitMinutes: "0.00",
          averageObservedPowerKw: "80.00",
          issueFreePercentage: "100.00",
        },
      }).success,
    ).toBe(false);
  });

  it("validates date ranges", () => {
    expect(
      analyticsDateRangeQuerySchema.safeParse({
        from: "2026-08-10",
        to: "2026-08-01",
      }).success,
    ).toBe(false);
  });

  it("accepts network and station breakdowns", () => {
    expect(
      analyticsNetworksResponseSchema.parse({
        data: [
          {
            network: "Electrify America",
            sessionCount: 2,
            totalEnergyKwh: "70.000",
            totalCost: "14.00",
            averageCostPerKwh: "0.2000",
            averageObservedPowerKw: "84.00",
            issueFreePercentage: "50.00",
          },
        ],
      }),
    ).toBeDefined();

    expect(
      analyticsStationsResponseSchema.parse({
        data: [
          {
            stationId: "ecba119c-963d-4931-acb8-1320791258be",
            name: "Westfield Fast Charging",
            network: "Electrify America",
            sessionCount: 2,
            totalEnergyKwh: "70.000",
            totalCost: "14.00",
            averageCostPerKwh: "0.2000",
            averageChargingMinutes: "25.00",
            averageWaitMinutes: "2.50",
            averageObservedPowerKw: "84.00",
            issueFreePercentage: "50.00",
            lastSessionAt: "2026-08-02T12:00:00.000Z",
          },
        ],
      }),
    ).toBeDefined();
  });
});
