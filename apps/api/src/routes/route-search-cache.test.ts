import { describe, expect, it, vi } from "vitest";

import { createRouteSearchCache, type RouteSearchCacheRedisClient } from "./route-search-cache.js";
import type { RouteDiscovery } from "./route-search-service.js";

const discovery: RouteDiscovery = {
  origin: {
    label: "Woodland Hills, California",
    longitude: -118.593153,
    latitude: 34.15404,
  },
  destination: {
    label: "UC San Diego, California",
    longitude: -117.23952,
    latitude: 32.877207,
  },
  route: {
    geometry: {
      type: "LineString",
      coordinates: [
        [-118.593153, 34.15404],
        [-117.23952, 32.877207],
      ],
    },
    distanceMeters: 219514.4,
    durationSeconds: 8928.2,
  },
  stations: [
    {
      sourceStationId: "1001",
      name: "Westfield Fast Charging",
      streetAddress: "6600 Topanga Canyon Boulevard",
      city: "Canoga Park",
      state: "CA",
      postalCode: "91303",
      countryCode: "US",
      network: "Electrify America",
      longitude: -118.605,
      latitude: 34.19,
      distanceFromRouteMeters: 1200,
      connectorCodes: ["CCS"],
      level2PortCount: 0,
      dcFastPortCount: 8,
      accessCode: "public",
      sourceStatus: "E",
      sourceUpdatedAt: "2026-08-02T20:00:00.000Z",
    },
  ],
};

function createClient(): RouteSearchCacheRedisClient {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };
}

describe("route-search cache", () => {
  it("stores validated discovery data with the configured expiration", async () => {
    const client = createClient();
    const cache = createRouteSearchCache({
      client,
      ttlSeconds: 900,
    });

    await cache.set("route-search:v1:key", discovery);

    expect(client.set).toHaveBeenCalledWith("route-search:v1:key", JSON.stringify(discovery), {
      EX: 900,
    });
  });

  it("loads and validates cached discovery data", async () => {
    const client = createClient();
    vi.mocked(client.get).mockResolvedValue(JSON.stringify(discovery));

    const cache = createRouteSearchCache({
      client,
      ttlSeconds: 900,
    });

    await expect(cache.get("route-search:v1:key")).resolves.toEqual(discovery);
  });

  it("returns null for a missing cache key", async () => {
    const client = createClient();
    const cache = createRouteSearchCache({
      client,
      ttlSeconds: 900,
    });

    await expect(cache.get("route-search:v1:missing")).resolves.toBeNull();
    expect(client.del).not.toHaveBeenCalled();
  });

  it("deletes malformed JSON and treats it as a cache miss", async () => {
    const client = createClient();
    vi.mocked(client.get).mockResolvedValue("{bad-json");

    const cache = createRouteSearchCache({
      client,
      ttlSeconds: 900,
    });

    await expect(cache.get("route-search:v1:bad")).resolves.toBeNull();
    expect(client.del).toHaveBeenCalledWith("route-search:v1:bad");
  });

  it("deletes schema-invalid data and treats it as a cache miss", async () => {
    const client = createClient();
    vi.mocked(client.get).mockResolvedValue(
      JSON.stringify({
        ...discovery,
        route: {
          ...discovery.route,
          geometry: {
            type: "Point",
            coordinates: [-118.6, 34.17],
          },
        },
      }),
    );

    const cache = createRouteSearchCache({
      client,
      ttlSeconds: 900,
    });

    await expect(cache.get("route-search:v1:invalid")).resolves.toBeNull();
    expect(client.del).toHaveBeenCalledWith("route-search:v1:invalid");
  });

  it("rejects a nonpositive cache TTL", () => {
    expect(() =>
      createRouteSearchCache({
        client: createClient(),
        ttlSeconds: 0,
      }),
    ).toThrow("Route-search cache TTL must be a positive integer");
  });
});
