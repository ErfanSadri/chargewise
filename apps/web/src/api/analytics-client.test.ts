import type {
  AnalyticsNetworkBreakdown,
  AnalyticsStationBreakdown,
  AnalyticsSummary,
} from "@chargewise/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAnalyticsNetworks,
  getAnalyticsStations,
  getAnalyticsSummary,
} from "./analytics-client.ts";

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

const station: AnalyticsStationBreakdown = {
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
};

function createJsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analytics API client", () => {
  it("requests all analytics resources with an inclusive date range", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ data: summary }))
      .mockResolvedValueOnce(createJsonResponse({ data: [network] }))
      .mockResolvedValueOnce(createJsonResponse({ data: [station] }));

    vi.stubGlobal("fetch", fetchMock);

    const query = {
      from: "2026-08-01",
      to: "2026-08-31",
    };

    await expect(getAnalyticsSummary(query)).resolves.toEqual(summary);
    await expect(getAnalyticsNetworks(query)).resolves.toEqual([network]);
    await expect(getAnalyticsStations(query)).resolves.toEqual([station]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/analytics/summary?from=2026-08-01&to=2026-08-31",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/analytics/networks?from=2026-08-01&to=2026-08-31",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/analytics/stations?from=2026-08-01&to=2026-08-31",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("omits the query string when no date filter is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ data: summary }));

    vi.stubGlobal("fetch", fetchMock);

    await getAnalyticsSummary();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/analytics/summary",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("rejects a response that violates the shared contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createJsonResponse({
          data: {
            ...summary,
            averageObservedPowerKw: "NaN",
          },
        }),
      ),
    );

    await expect(getAnalyticsSummary()).rejects.toThrow();
  });
});
