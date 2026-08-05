import { describe, expect, it, vi } from "vitest";

import type {
  RouteDiscovery,
  RouteSearchInput,
  RouteSearchServiceOptions,
} from "./route-search-service.js";
import { createRouteSearchService } from "./route-search-service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const vehicleId = "22222222-2222-4222-8222-222222222222";
const stationId = "33333333-3333-4333-8333-333333333333";

const input: RouteSearchInput = {
  userId,
  origin: "Woodland Hills, CA",
  destination: "UC San Diego, La Jolla, CA",
  vehicleId,
  corridorMeters: 8046.72,
  filters: {
    compatibleOnly: true,
    networks: [],
    chargingLevels: ["DC_FAST"],
    publicOnly: true,
    operatingOnly: true,
  },
};

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
      sourceStationId: "fixture-station",
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
      connectorCodes: ["CCS"],
      level2PortCount: 0,
      dcFastPortCount: 10,
      accessCode: "public",
      sourceStatus: "E",
      sourceUpdatedAt: "2026-08-01T12:00:00.000Z",
    },
  ],
};

function createOptions(cachedDiscovery: RouteDiscovery | null): RouteSearchServiceOptions {
  return {
    vehicles: {
      findByIdForUser: vi.fn().mockResolvedValue({
        connectorTypes: ["CCS"],
      }),
    } as unknown as RouteSearchServiceOptions["vehicles"],
    geocodingProvider: {
      geocode: vi
        .fn()
        .mockResolvedValueOnce([discovery.origin])
        .mockResolvedValueOnce([discovery.destination]),
    },
    routingProvider: {
      createRoute: vi.fn().mockResolvedValue(discovery.route),
    },
    stationProvider: {
      findAlongRoute: vi.fn().mockResolvedValue(discovery.stations),
    },
    stationRepository: {
      upsertMany: vi.fn().mockResolvedValue([
        {
          sourceStationId: "fixture-station",
          id: stationId,
        },
      ]),
    },
    favorites: {
      findStationIdsByUser: vi.fn().mockResolvedValue([]),
    },
    cache: {
      get: vi.fn().mockResolvedValue(cachedDiscovery),
      set: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("route-search performance observability", () => {
  it.each([
    {
      description: "cache hit",
      cachedDiscovery: discovery,
      expectedCacheStatus: "hit",
    },
    {
      description: "cache miss",
      cachedDiscovery: null,
      expectedCacheStatus: "miss",
    },
  ] as const)(
    "reports a $description without changing the public result",
    async ({ cachedDiscovery, expectedCacheStatus }) => {
      const options = createOptions(cachedDiscovery);
      const onPerformance = vi.fn();
      const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125);

      const service = createRouteSearchService({
        ...options,
        now,
        onPerformance,
      });

      const result = await service.search(input);

      expect(result.meta.stationCount).toBe(1);
      expect(onPerformance).toHaveBeenCalledWith({
        cacheStatus: expectedCacheStatus,
        durationMs: 25,
        discoveredStationCount: 1,
        returnedStationCount: 1,
      });
    },
  );

  it("does not fail a successful search when the observer throws", async () => {
    const service = createRouteSearchService({
      ...createOptions(discovery),
      onPerformance: () => {
        throw new Error("observability failure");
      },
    });

    await expect(service.search(input)).resolves.toMatchObject({
      meta: {
        stationCount: 1,
      },
    });
  });
});
