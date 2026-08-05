import type { VehicleRecord, VehicleRepository } from "../vehicles/vehicle-repository.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GeocodedLocation,
  GeocodingProvider,
  NormalizedRoute,
  NormalizedStation,
  RoutingProvider,
  StationProvider,
} from "../providers/index.js";
import {
  createRouteSearchCacheKey,
  createRouteSearchService,
  InvalidRouteSearchInputError,
  LocationNotResolvedError,
  type RouteDiscovery,
  type RouteSearchCache,
  type RouteSearchInput,
  type RouteSearchServiceOptions,
  type RouteSearchStationRepository,
  RouteSearchPersistenceError,
  RouteSearchProviderUnavailableError,
  RouteSearchVehicleNotFoundError,
} from "./route-search-service.js";

const userId = "73a9ec58-90f7-45b8-b53a-bc3a25a92ae4";
const vehicleId = "6f719184-e691-4c73-bf4f-4e353c40cd99";
const stationId = "ecba119c-963d-4931-acb8-1320791258be";

const origin: GeocodedLocation = {
  label: "Woodland Hills, Los Angeles, California",
  longitude: -118.593153,
  latitude: 34.15404,
};

const destination: GeocodedLocation = {
  label: "UC San Diego, La Jolla, California",
  longitude: -117.23952,
  latitude: 32.877207,
};

const route: NormalizedRoute = {
  geometry: {
    type: "LineString",
    coordinates: [
      [-118.593153, 34.15404],
      [-118.24368, 34.05223],
      [-117.23952, 32.877207],
    ],
  },
  distanceMeters: 219514.4,
  durationSeconds: 8928.2,
};

const compatibleStation: NormalizedStation = {
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
};

const incompatibleStation: NormalizedStation = {
  ...compatibleStation,
  sourceStationId: "1002",
  name: "Legacy Fast Charging",
  network: "Other Network",
  longitude: -118.1,
  latitude: 33.9,
  distanceFromRouteMeters: 2400,
  connectorCodes: ["CHADEMO"],
  dcFastPortCount: 2,
};

const vehicle: VehicleRecord = {
  id: vehicleId,
  userId,
  nickname: "My i5",
  make: "BMW",
  model: "i5 eDrive40",
  year: 2025,
  batteryCapacityKwh: "81.20",
  efficiencyMiPerKwh: "3.10",
  connectorTypes: ["CCS", "J1772"],
  preferredNetworks: ["Electrify America"],
  isDefault: true,
  createdAt: new Date("2026-08-04T12:00:00.000Z"),
  updatedAt: new Date("2026-08-04T12:00:00.000Z"),
};

const searchInput: RouteSearchInput = {
  userId,
  origin: "Woodland Hills, CA",
  destination: "UC San Diego, La Jolla, CA",
  vehicleId,
  corridorMeters: 8000,
  filters: {
    compatibleOnly: true,
    networks: [],
    chargingLevels: ["DC_FAST"],
    publicOnly: true,
    operatingOnly: true,
  },
};

interface TestDependencies {
  options: RouteSearchServiceOptions;
  findByIdForUser: VehicleRepository["findByIdForUser"];
  geocode: GeocodingProvider["geocode"];
  createRoute: RoutingProvider["createRoute"];
  findAlongRoute: StationProvider["findAlongRoute"];
  cacheGet: RouteSearchCache["get"];
  cacheSet: RouteSearchCache["set"];
  upsertMany: RouteSearchStationRepository["upsertMany"];
  onCacheError: NonNullable<RouteSearchServiceOptions["onCacheError"]>;
}

function createDependencies(): TestDependencies {
  const findByIdForUser = vi.fn<VehicleRepository["findByIdForUser"]>();
  const geocode = vi.fn<GeocodingProvider["geocode"]>();
  const createRoute = vi.fn<RoutingProvider["createRoute"]>();
  const findAlongRoute = vi.fn<StationProvider["findAlongRoute"]>();
  const cacheGet = vi.fn<RouteSearchCache["get"]>();
  const cacheSet = vi.fn<RouteSearchCache["set"]>();
  const upsertMany = vi.fn<RouteSearchStationRepository["upsertMany"]>();
  const onCacheError = vi.fn<NonNullable<RouteSearchServiceOptions["onCacheError"]>>();

  findByIdForUser.mockResolvedValue(vehicle);
  geocode.mockResolvedValueOnce([origin]).mockResolvedValueOnce([destination]);
  createRoute.mockResolvedValue(route);
  findAlongRoute.mockResolvedValue([compatibleStation, incompatibleStation]);
  cacheGet.mockResolvedValue(null);
  cacheSet.mockResolvedValue();
  upsertMany.mockResolvedValue([
    {
      sourceStationId: compatibleStation.sourceStationId,
      id: stationId,
    },
    {
      sourceStationId: incompatibleStation.sourceStationId,
      id: "418f7ba9-4c0e-4ff4-968f-f5efdc4aa972",
    },
  ]);

  return {
    options: {
      vehicles: { findByIdForUser },
      geocodingProvider: { geocode },
      routingProvider: { createRoute },
      stationProvider: { findAlongRoute },
      cache: {
        get: cacheGet,
        set: cacheSet,
      },
      stationRepository: { upsertMany },
      onCacheError,
    },
    findByIdForUser,
    geocode,
    createRoute,
    findAlongRoute,
    cacheGet,
    cacheSet,
    upsertMany,
    onCacheError,
  };
}

function createDiscovery(
  stations: NormalizedStation[] = [compatibleStation, incompatibleStation],
): RouteDiscovery {
  return {
    origin,
    destination,
    route,
    stations,
  };
}

describe("route search service", () => {
  let dependencies: TestDependencies;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  it("orchestrates providers, persists stations, filters compatibility, and returns the route", async () => {
    const service = createRouteSearchService(dependencies.options);

    await expect(service.search(searchInput)).resolves.toEqual({
      route: {
        geometry: route.geometry,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        origin,
        destination,
      },
      stations: [
        {
          id: stationId,
          name: compatibleStation.name,
          network: compatibleStation.network,
          longitude: compatibleStation.longitude,
          latitude: compatibleStation.latitude,
          distanceFromRouteMeters: compatibleStation.distanceFromRouteMeters,
          connectorCodes: ["CCS"],
          compatible: true,
          level2PortCount: 0,
          dcFastPortCount: 8,
          accessCode: "public",
          sourceStatus: "E",
          lastSyncedAt: compatibleStation.sourceUpdatedAt,
          isFavorite: false,
        },
      ],
      meta: {
        stationSource: "NLR_AFDC",
        routeSource: "OPENROUTESERVICE",
        stationCount: 1,
      },
    });

    expect(dependencies.findByIdForUser).toHaveBeenCalledWith(userId, vehicleId);
    expect(dependencies.geocode).toHaveBeenNthCalledWith(1, searchInput.origin);
    expect(dependencies.geocode).toHaveBeenNthCalledWith(2, searchInput.destination);
    expect(dependencies.createRoute).toHaveBeenCalledWith({
      origin: [origin.longitude, origin.latitude],
      destination: [destination.longitude, destination.latitude],
    });
    expect(dependencies.findAlongRoute).toHaveBeenCalledWith({
      routeWkt: "LINESTRING(-118.593153 34.15404,-118.24368 34.05223,-117.23952 32.877207)",
      corridorMeters: searchInput.corridorMeters,
      limit: 200,
    });
    expect(dependencies.upsertMany).toHaveBeenCalledWith([compatibleStation, incompatibleStation]);
    expect(dependencies.cacheSet).toHaveBeenCalledWith(
      createRouteSearchCacheKey(searchInput),
      createDiscovery(),
    );
  });

  it("uses cached discovery while still refreshing persisted station records", async () => {
    vi.mocked(dependencies.cacheGet).mockResolvedValue(createDiscovery());

    const service = createRouteSearchService(dependencies.options);

    await expect(service.search(searchInput)).resolves.toMatchObject({
      meta: {
        stationCount: 1,
      },
    });

    expect(dependencies.geocode).not.toHaveBeenCalled();
    expect(dependencies.createRoute).not.toHaveBeenCalled();
    expect(dependencies.findAlongRoute).not.toHaveBeenCalled();
    expect(dependencies.cacheSet).not.toHaveBeenCalled();
    expect(dependencies.upsertMany).toHaveBeenCalledWith([compatibleStation, incompatibleStation]);
  });

  it("checks vehicle ownership before reading cache or calling providers", async () => {
    vi.mocked(dependencies.findByIdForUser).mockResolvedValue(null);

    const service = createRouteSearchService(dependencies.options);

    await expect(service.search(searchInput)).rejects.toBeInstanceOf(
      RouteSearchVehicleNotFoundError,
    );

    expect(dependencies.cacheGet).not.toHaveBeenCalled();
    expect(dependencies.geocode).not.toHaveBeenCalled();
    expect(dependencies.upsertMany).not.toHaveBeenCalled();
  });

  it("reports an unresolved origin without calling routing or station providers", async () => {
    vi.mocked(dependencies.geocode).mockReset();
    vi.mocked(dependencies.geocode).mockResolvedValueOnce([]).mockResolvedValueOnce([destination]);

    const service = createRouteSearchService(dependencies.options);

    await expect(service.search(searchInput)).rejects.toEqual(
      new LocationNotResolvedError("origin"),
    );

    expect(dependencies.createRoute).not.toHaveBeenCalled();
    expect(dependencies.findAlongRoute).not.toHaveBeenCalled();
  });

  it("reports an unresolved destination without calling routing or station providers", async () => {
    vi.mocked(dependencies.geocode).mockReset();
    vi.mocked(dependencies.geocode).mockResolvedValueOnce([origin]).mockResolvedValueOnce([]);

    const service = createRouteSearchService(dependencies.options);

    await expect(service.search(searchInput)).rejects.toEqual(
      new LocationNotResolvedError("destination"),
    );

    expect(dependencies.createRoute).not.toHaveBeenCalled();
    expect(dependencies.findAlongRoute).not.toHaveBeenCalled();
  });

  it("converts a provider failure into a known service error", async () => {
    vi.mocked(dependencies.createRoute).mockRejectedValue(
      new Error("private upstream failure details"),
    );

    const service = createRouteSearchService(dependencies.options);

    await expect(service.search(searchInput)).rejects.toMatchObject({
      name: "RouteSearchProviderUnavailableError",
      provider: "OPENROUTESERVICE_ROUTING",
      message: "Route search provider is unavailable",
    } satisfies Partial<RouteSearchProviderUnavailableError>);

    expect(dependencies.findAlongRoute).not.toHaveBeenCalled();
    expect(dependencies.upsertMany).not.toHaveBeenCalled();
  });

  it("fails open when a cache read fails and reports the private error", async () => {
    const cacheError = new Error("private Redis read failure");
    vi.mocked(dependencies.cacheGet).mockRejectedValue(cacheError);

    const service = createRouteSearchService(dependencies.options);

    await expect(service.search(searchInput)).resolves.toMatchObject({
      meta: {
        stationCount: 1,
      },
    });

    expect(dependencies.onCacheError).toHaveBeenCalledWith("read", cacheError);
    expect(dependencies.geocode).toHaveBeenCalledTimes(2);
  });

  it("returns fresh results when a cache write fails", async () => {
    const cacheError = new Error("private Redis write failure");
    vi.mocked(dependencies.cacheSet).mockRejectedValue(cacheError);

    const service = createRouteSearchService(dependencies.options);

    await expect(service.search(searchInput)).resolves.toMatchObject({
      meta: {
        stationCount: 1,
      },
    });

    expect(dependencies.onCacheError).toHaveBeenCalledWith("write", cacheError);
  });

  it("applies network, charging-level, access, and operating-status filters", async () => {
    const stations: NormalizedStation[] = [
      {
        ...compatibleStation,
        sourceStationId: "2001",
        name: "Matching Level 2",
        level2PortCount: 4,
        dcFastPortCount: 0,
      },
      {
        ...compatibleStation,
        sourceStationId: "2002",
        name: "Wrong Network",
        network: "Other Network",
        level2PortCount: 4,
        dcFastPortCount: 0,
      },
      {
        ...compatibleStation,
        sourceStationId: "2003",
        name: "Private Station",
        accessCode: "private",
        level2PortCount: 4,
        dcFastPortCount: 0,
      },
      {
        ...compatibleStation,
        sourceStationId: "2004",
        name: "Planned Station",
        sourceStatus: "P",
        level2PortCount: 4,
        dcFastPortCount: 0,
      },
      {
        ...compatibleStation,
        sourceStationId: "2005",
        name: "Fast Only",
        level2PortCount: 0,
        dcFastPortCount: 8,
      },
    ];

    vi.mocked(dependencies.cacheGet).mockResolvedValue(createDiscovery(stations));
    vi.mocked(dependencies.upsertMany).mockResolvedValue(
      stations.map((station, index) => ({
        sourceStationId: station.sourceStationId,
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      })),
    );

    const service = createRouteSearchService(dependencies.options);
    const result = await service.search({
      ...searchInput,
      filters: {
        compatibleOnly: false,
        networks: ["electrify america"],
        chargingLevels: ["LEVEL_2"],
        publicOnly: true,
        operatingOnly: true,
      },
    });

    expect(result.stations.map((station) => station.name)).toEqual(["Matching Level 2"]);
  });

  it("rejects invalid input before reading user-owned data", async () => {
    const service = createRouteSearchService(dependencies.options);

    await expect(
      service.search({
        ...searchInput,
        origin: " ",
      }),
    ).rejects.toBeInstanceOf(InvalidRouteSearchInputError);

    expect(dependencies.findByIdForUser).not.toHaveBeenCalled();
  });

  it("rejects incomplete station persistence results", async () => {
    vi.mocked(dependencies.upsertMany).mockResolvedValue([
      {
        sourceStationId: compatibleStation.sourceStationId,
        id: stationId,
      },
    ]);

    const service = createRouteSearchService(dependencies.options);

    await expect(service.search(searchInput)).rejects.toBeInstanceOf(RouteSearchPersistenceError);
  });

  it("creates the same cache key for equivalent address casing and whitespace", () => {
    expect(
      createRouteSearchCacheKey({
        origin: "  Woodland   Hills, CA ",
        destination: "UC SAN DIEGO, LA JOLLA, CA",
        corridorMeters: 8000,
      }),
    ).toBe(
      createRouteSearchCacheKey({
        origin: "woodland hills, ca",
        destination: "uc san diego, la jolla, ca",
        corridorMeters: 8000,
      }),
    );
  });
});
