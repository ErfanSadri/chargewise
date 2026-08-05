import type { AnalyticsNetworkBreakdown, AnalyticsSummary } from "@chargewise/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsRepository, AnalyticsStationRecord } from "./analytics-repository.js";
import { createAnalyticsService, InvalidAnalyticsQueryError } from "./analytics-service.js";

const userId = "2d9b977f-fac0-47f1-bf48-59406c414722";

const summary: AnalyticsSummary = {
  sessionCount: 4,
  totalEnergyKwh: "155.400",
  totalCost: "24.10",
  averageCostPerKwh: "0.1551",
  averageChargingMinutes: "29.50",
  averageWaitMinutes: "6.25",
  averageObservedPowerKw: "79.02",
  issueFreePercentage: "75.00",
};

const network: AnalyticsNetworkBreakdown = {
  network: "Electrify America",
  sessionCount: 2,
  totalEnergyKwh: "70.000",
  totalCost: "14.00",
  averageCostPerKwh: "0.2000",
  averageObservedPowerKw: "84.00",
  issueFreePercentage: "50.00",
};

const station: AnalyticsStationRecord = {
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
  lastSessionAt: new Date("2026-08-02T12:00:00.000Z"),
};

function createRepository(): AnalyticsRepository {
  return {
    getSummary: vi.fn().mockResolvedValue(summary),
    getNetworks: vi.fn().mockResolvedValue([network]),
    getStations: vi.fn().mockResolvedValue([station]),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("analytics service", () => {
  it("uses inclusive UTC calendar dates for every query", async () => {
    const analytics = createRepository();
    const service = createAnalyticsService({ analytics });

    await expect(
      service.summary(userId, {
        from: "2026-08-01",
        to: "2026-08-31",
      }),
    ).resolves.toEqual(summary);

    expect(analytics.getSummary).toHaveBeenCalledWith({
      userId,
      from: new Date("2026-08-01T00:00:00.000Z"),
      toExclusive: new Date("2026-09-01T00:00:00.000Z"),
    });
  });

  it("returns typed network and station breakdowns", async () => {
    const analytics = createRepository();
    const service = createAnalyticsService({ analytics });

    await expect(service.networks(userId, {})).resolves.toEqual([network]);

    await expect(service.stations(userId, {})).resolves.toEqual([
      {
        ...station,
        lastSessionAt: "2026-08-02T12:00:00.000Z",
      },
    ]);
  });

  it("rejects an invalid date range before querying PostgreSQL", async () => {
    const analytics = createRepository();
    const service = createAnalyticsService({ analytics });

    await expect(
      service.summary(userId, {
        from: "2026-08-10",
        to: "2026-08-01",
      }),
    ).rejects.toBeInstanceOf(InvalidAnalyticsQueryError);

    expect(analytics.getSummary).not.toHaveBeenCalled();
  });
});
