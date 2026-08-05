import { describe, expect, it } from "vitest";

import { NlrStationProvider } from "./nlr-station-provider.js";
import {
  createCapturingFetch,
  createJsonResponse,
  readProviderFixture,
} from "./provider-test-helpers.js";

describe("NlrStationProvider", () => {
  it("normalizes a saved nearby-route fixture and sends a form POST", async () => {
    const fixture = await readProviderFixture("nlr-nearby-route-success.json");
    const { fetchFn, requests } = createCapturingFetch(() => createJsonResponse(fixture));
    const provider = new NlrStationProvider("nlr-secret", { fetchFn });

    const stations = await provider.findAlongRoute({
      routeWkt: "LINESTRING(-118.593153 34.15404,-117.23952 32.877207)",
      corridorMeters: 8000,
    });

    expect(stations).toEqual([
      {
        sourceStationId: "101001",
        name: "Westfield Topanga",
        streetAddress: "6600 Topanga Canyon Boulevard",
        city: "Canoga Park",
        state: "CA",
        postalCode: "91303",
        countryCode: "US",
        network: "Electrify America",
        longitude: -118.60372,
        latitude: 34.19012,
        distanceFromRouteMeters: 1500,
        connectorCodes: ["CCS", "CHADEMO"],
        level2PortCount: 0,
        dcFastPortCount: 10,
        accessCode: "public",
        sourceStatus: "E",
        sourceUpdatedAt: "2026-07-20T18:30:00Z",
      },
      {
        sourceStationId: "101002",
        name: "Campus Charging",
        streetAddress: null,
        city: "San Diego",
        state: "CA",
        postalCode: "92093",
        countryCode: "US",
        network: "Tesla",
        longitude: -117.23952,
        latitude: 32.877207,
        distanceFromRouteMeters: 250,
        connectorCodes: ["NACS", "J1772"],
        level2PortCount: 4,
        dcFastPortCount: 0,
        accessCode: "public",
        sourceStatus: "E",
        sourceUpdatedAt: "2026-07-22T10:00:00Z",
      },
    ]);

    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (request === undefined) {
      throw new Error("Expected one captured station request");
    }

    const url = new URL(String(request.input));
    const headers = new Headers(request.init?.headers);
    const body = new URLSearchParams(String(request.init?.body));

    expect(url.pathname).toBe("/api/alt-fuel-stations/v1/nearby-route.json");
    expect(request.init?.method).toBe("POST");
    expect(headers.get("X-Api-Key")).toBe("nlr-secret");
    expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded");
    expect(body.get("route")).toBe("LINESTRING(-118.593153 34.15404,-117.23952 32.877207)");
    expect(Number(body.get("distance"))).toBeCloseTo(8000 / 1609.344, 8);
    expect(body.get("fuel_type")).toBe("ELEC");
    expect(body.get("access")).toBe("public");
    expect(body.get("status")).toBe("E");
    expect(body.get("limit")).toBe("200");
  });

  it("accepts an empty station result", async () => {
    const { fetchFn } = createCapturingFetch(() =>
      createJsonResponse({ total_results: 0, fuel_stations: [] }),
    );
    const provider = new NlrStationProvider("nlr-secret", { fetchFn });

    await expect(
      provider.findAlongRoute({
        routeWkt: "LINESTRING(-118.6 34.17,-117.16 32.72)",
        corridorMeters: 8000,
      }),
    ).resolves.toEqual([]);
  });

  it("rejects an invalid WKT input before calling the provider", async () => {
    const { fetchFn, requests } = createCapturingFetch(() => createJsonResponse({}));
    const provider = new NlrStationProvider("nlr-secret", { fetchFn });

    await expect(
      provider.findAlongRoute({
        routeWkt: "POINT(-118.6 34.17)",
        corridorMeters: 8000,
      }),
    ).rejects.toThrow("Station corridor query is invalid");
    expect(requests).toHaveLength(0);
  });
});
