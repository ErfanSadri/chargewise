import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import type { VehicleConnectorType } from "@chargewise/shared";
import { z } from "zod";

import {
  geoJsonLineStringToWkt,
  type GeocodedLocation,
  type GeocodingProvider,
  type NormalizedRoute,
  type NormalizedStation,
  type ProviderName,
  type RoutingProvider,
  type StationProvider,
} from "../providers/index.js";
import type { VehicleRepository } from "../vehicles/vehicle-repository.js";

const maximumCorridorMeters = 100 * 1609.344;

const routeSearchFiltersSchema = z
  .object({
    compatibleOnly: z.boolean(),
    networks: z
      .array(z.string().trim().min(1).max(120))
      .max(25)
      .refine(hasUniqueCaseInsensitiveValues, {
        message: "Networks must not contain duplicates",
      }),
    chargingLevels: z
      .array(z.enum(["LEVEL_2", "DC_FAST"]))
      .max(2)
      .refine(hasUniqueValues, {
        message: "Charging levels must not contain duplicates",
      }),
    publicOnly: z.boolean(),
    operatingOnly: z.boolean(),
  })
  .strict();

export const routeSearchInputSchema = z
  .object({
    userId: z.string().uuid(),
    origin: z.string().trim().min(1).max(240),
    destination: z.string().trim().min(1).max(240),
    vehicleId: z.string().uuid(),
    corridorMeters: z.number().finite().positive().max(maximumCorridorMeters),
    filters: routeSearchFiltersSchema,
  })
  .strict();

export type RouteSearchInput = z.infer<typeof routeSearchInputSchema>;
export type RouteSearchFilters = z.infer<typeof routeSearchFiltersSchema>;
export type ChargingLevel = RouteSearchFilters["chargingLevels"][number];

export interface RouteDiscovery {
  origin: GeocodedLocation;
  destination: GeocodedLocation;
  route: NormalizedRoute;
  stations: NormalizedStation[];
}

export interface RouteSearchCache {
  get: (key: string) => Promise<RouteDiscovery | null>;
  set: (key: string, value: RouteDiscovery) => Promise<void>;
}

export interface PersistedStationIdentity {
  sourceStationId: string;
  id: string;
}

export interface RouteSearchStationRepository {
  upsertMany: (
    stations: readonly NormalizedStation[],
  ) => Promise<readonly PersistedStationIdentity[]>;
}

export interface RouteSearchFavoriteRepository {
  findStationIdsByUser: (userId: string) => Promise<string[]>;
}

export interface RouteSearchLocation {
  label: string;
  longitude: number;
  latitude: number;
}

export interface RouteSearchStation {
  id: string;
  name: string;
  network: string | null;
  longitude: number;
  latitude: number;
  distanceFromRouteMeters: number;
  connectorCodes: NormalizedStation["connectorCodes"];
  compatible: boolean;
  level2PortCount: number;
  dcFastPortCount: number;
  accessCode: string;
  sourceStatus: string;
  lastSyncedAt: string;
  isFavorite: boolean;
}

export interface RouteSearchResult {
  route: {
    geometry: NormalizedRoute["geometry"];
    distanceMeters: number;
    durationSeconds: number;
    origin: RouteSearchLocation;
    destination: RouteSearchLocation;
  };
  stations: RouteSearchStation[];
  meta: {
    stationSource: "NLR_AFDC";
    routeSource: "OPENROUTESERVICE";
    stationCount: number;
  };
}

export interface RouteSearchService {
  search: (input: RouteSearchInput) => Promise<RouteSearchResult>;
}

export type RouteSearchCacheStatus = "hit" | "miss";

export interface RouteSearchPerformanceMeasurement {
  cacheStatus: RouteSearchCacheStatus;
  durationMs: number;
  discoveredStationCount: number;
  returnedStationCount: number;
}

export interface RouteSearchServiceOptions {
  vehicles: Pick<VehicleRepository, "findByIdForUser">;
  geocodingProvider: GeocodingProvider;
  routingProvider: RoutingProvider;
  stationProvider: StationProvider;
  stationRepository: RouteSearchStationRepository;
  favorites?: RouteSearchFavoriteRepository;
  cache: RouteSearchCache;
  now?: () => number;
  onCacheError?: (operation: "read" | "write", error: unknown) => void;
  onPerformance?: (measurement: RouteSearchPerformanceMeasurement) => void;
}

export class InvalidRouteSearchInputError extends TypeError {
  constructor() {
    super("Route search input is invalid");
    this.name = "InvalidRouteSearchInputError";
  }
}

export class RouteSearchVehicleNotFoundError extends Error {
  constructor() {
    super("Vehicle not found");
    this.name = "RouteSearchVehicleNotFoundError";
  }
}

export class LocationNotResolvedError extends Error {
  readonly location: "origin" | "destination";

  constructor(location: "origin" | "destination") {
    super(`${location === "origin" ? "Origin" : "Destination"} location could not be resolved`);
    this.name = "LocationNotResolvedError";
    this.location = location;
  }
}

export class RouteSearchProviderUnavailableError extends Error {
  readonly provider: ProviderName;

  constructor(provider: ProviderName, cause: unknown) {
    super("Route search provider is unavailable", { cause });
    this.name = "RouteSearchProviderUnavailableError";
    this.provider = provider;
  }
}

export class RouteSearchPersistenceError extends Error {
  constructor(cause: unknown) {
    super("Route search station persistence failed", { cause });
    this.name = "RouteSearchPersistenceError";
  }
}

export function createRouteSearchCacheKey(
  input: Pick<RouteSearchInput, "origin" | "destination" | "corridorMeters">,
): string {
  const canonicalInput = JSON.stringify({
    origin: normalizeLocationQuery(input.origin).toLowerCase(),
    destination: normalizeLocationQuery(input.destination).toLowerCase(),
    corridorMeters: input.corridorMeters,
  });

  const digest = createHash("sha256").update(canonicalInput).digest("hex");

  return `route-search:v1:${digest}`;
}

export function createRouteSearchService(options: RouteSearchServiceOptions): RouteSearchService {
  const now = options.now ?? (() => performance.now());

  return {
    async search(untrustedInput) {
      const startedAt = now();
      const parsedInput = routeSearchInputSchema.safeParse(untrustedInput);

      if (!parsedInput.success) {
        throw new InvalidRouteSearchInputError();
      }

      const input: RouteSearchInput = {
        ...parsedInput.data,
        origin: normalizeLocationQuery(parsedInput.data.origin),
        destination: normalizeLocationQuery(parsedInput.data.destination),
      };

      const vehicle = await options.vehicles.findByIdForUser(input.userId, input.vehicleId);

      if (vehicle === null) {
        throw new RouteSearchVehicleNotFoundError();
      }

      const cacheKey = createRouteSearchCacheKey(input);
      let discovery = await readDiscoveryFromCache(options, cacheKey);
      let cacheStatus: RouteSearchCacheStatus = "hit";

      if (discovery === null) {
        cacheStatus = "miss";
        discovery = await discoverRoute(options, input);
        await writeDiscoveryToCache(options, cacheKey, discovery);
      }

      const persistedStations = await persistStations(
        options.stationRepository,
        discovery.stations,
      );
      const stationIdBySourceId = new Map(
        persistedStations.map((station) => [station.sourceStationId, station.id]),
      );
      const favoriteStationIds = await findFavoriteStationIds(options, input.userId);

      const stations = discovery.stations
        .map((station) =>
          toRouteSearchStation(
            station,
            stationIdBySourceId,
            vehicle.connectorTypes,
            favoriteStationIds,
          ),
        )
        .filter((station) => matchesFilters(station, input.filters))
        .sort(compareStations);

      const result: RouteSearchResult = {
        route: {
          geometry: discovery.route.geometry,
          distanceMeters: discovery.route.distanceMeters,
          durationSeconds: discovery.route.durationSeconds,
          origin: toRouteSearchLocation(discovery.origin),
          destination: toRouteSearchLocation(discovery.destination),
        },
        stations,
        meta: {
          stationSource: "NLR_AFDC",
          routeSource: "OPENROUTESERVICE",
          stationCount: stations.length,
        },
      };

      reportPerformance(options, {
        cacheStatus,
        durationMs: Math.max(0, now() - startedAt),
        discoveredStationCount: discovery.stations.length,
        returnedStationCount: stations.length,
      });

      return result;
    },
  };
}

async function discoverRoute(
  options: RouteSearchServiceOptions,
  input: RouteSearchInput,
): Promise<RouteDiscovery> {
  const [originCandidates, destinationCandidates] = await Promise.all([
    runProvider("OPENROUTESERVICE_GEOCODING", () =>
      options.geocodingProvider.geocode(input.origin),
    ),
    runProvider("OPENROUTESERVICE_GEOCODING", () =>
      options.geocodingProvider.geocode(input.destination),
    ),
  ]);

  const origin = originCandidates[0];

  if (origin === undefined) {
    throw new LocationNotResolvedError("origin");
  }

  const destination = destinationCandidates[0];

  if (destination === undefined) {
    throw new LocationNotResolvedError("destination");
  }

  const route = await runProvider("OPENROUTESERVICE_ROUTING", () =>
    options.routingProvider.createRoute({
      origin: [origin.longitude, origin.latitude],
      destination: [destination.longitude, destination.latitude],
    }),
  );

  const routeWkt = geoJsonLineStringToWkt(route.geometry);
  const stations = await runProvider("NLR_AFDC", () =>
    options.stationProvider.findAlongRoute({
      routeWkt,
      corridorMeters: input.corridorMeters,
      limit: 200,
    }),
  );

  return {
    origin,
    destination,
    route,
    stations: [...stations],
  };
}

async function runProvider<Result>(
  provider: ProviderName,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw new RouteSearchProviderUnavailableError(provider, error);
  }
}

async function readDiscoveryFromCache(
  options: RouteSearchServiceOptions,
  key: string,
): Promise<RouteDiscovery | null> {
  try {
    return await options.cache.get(key);
  } catch (error: unknown) {
    reportCacheError(options, "read", error);
    return null;
  }
}

async function writeDiscoveryToCache(
  options: RouteSearchServiceOptions,
  key: string,
  discovery: RouteDiscovery,
): Promise<void> {
  try {
    await options.cache.set(key, discovery);
  } catch (error: unknown) {
    reportCacheError(options, "write", error);
  }
}

function reportCacheError(
  options: RouteSearchServiceOptions,
  operation: "read" | "write",
  error: unknown,
): void {
  try {
    options.onCacheError?.(operation, error);
  } catch {
    // Cache observability must never turn an optional optimization into a failure.
  }
}

function reportPerformance(
  options: RouteSearchServiceOptions,
  measurement: RouteSearchPerformanceMeasurement,
): void {
  try {
    options.onPerformance?.(measurement);
  } catch {
    // Performance observability must never turn a successful search into a failure.
  }
}

async function persistStations(
  repository: RouteSearchStationRepository,
  stations: readonly NormalizedStation[],
): Promise<readonly PersistedStationIdentity[]> {
  try {
    const identities = await repository.upsertMany(stations);
    const expectedSourceIds = new Set(stations.map((station) => station.sourceStationId));
    const returnedSourceIds = new Set<string>();

    for (const identity of identities) {
      if (
        !expectedSourceIds.has(identity.sourceStationId) ||
        returnedSourceIds.has(identity.sourceStationId)
      ) {
        throw new Error("Station repository returned inconsistent identities");
      }

      returnedSourceIds.add(identity.sourceStationId);
    }

    if (returnedSourceIds.size !== expectedSourceIds.size) {
      throw new Error("Station repository omitted a persisted station identity");
    }

    return identities;
  } catch (error: unknown) {
    if (error instanceof RouteSearchPersistenceError) {
      throw error;
    }

    throw new RouteSearchPersistenceError(error);
  }
}

async function findFavoriteStationIds(
  options: RouteSearchServiceOptions,
  userId: string,
): Promise<ReadonlySet<string>> {
  if (options.favorites === undefined) {
    return new Set<string>();
  }

  try {
    return new Set(await options.favorites.findStationIdsByUser(userId));
  } catch (error: unknown) {
    throw new RouteSearchPersistenceError(error);
  }
}

function toRouteSearchLocation(location: GeocodedLocation): RouteSearchLocation {
  return {
    label: location.label,
    longitude: location.longitude,
    latitude: location.latitude,
  };
}

function toRouteSearchStation(
  station: NormalizedStation,
  stationIdBySourceId: ReadonlyMap<string, string>,
  vehicleConnectorTypes: readonly VehicleConnectorType[],
  favoriteStationIds: ReadonlySet<string>,
): RouteSearchStation {
  const id = stationIdBySourceId.get(station.sourceStationId);

  if (id === undefined) {
    throw new RouteSearchPersistenceError(new Error("Persisted station identity was not returned"));
  }

  return {
    id,
    name: station.name,
    network: station.network,
    longitude: station.longitude,
    latitude: station.latitude,
    distanceFromRouteMeters: station.distanceFromRouteMeters,
    connectorCodes: station.connectorCodes,
    compatible: station.connectorCodes.some((connectorCode) =>
      vehicleConnectorTypes.includes(connectorCode),
    ),
    level2PortCount: station.level2PortCount,
    dcFastPortCount: station.dcFastPortCount,
    accessCode: station.accessCode,
    sourceStatus: station.sourceStatus,
    lastSyncedAt: station.sourceUpdatedAt,
    isFavorite: favoriteStationIds.has(id),
  };
}

function matchesFilters(station: RouteSearchStation, filters: RouteSearchFilters): boolean {
  if (filters.compatibleOnly && !station.compatible) {
    return false;
  }

  if (
    filters.networks.length > 0 &&
    (station.network === null ||
      !filters.networks.some(
        (network) => normalizeComparable(network) === normalizeComparable(station.network ?? ""),
      ))
  ) {
    return false;
  }

  if (
    filters.chargingLevels.length > 0 &&
    !filters.chargingLevels.some((level) => stationSupportsLevel(station, level))
  ) {
    return false;
  }

  if (filters.publicOnly && normalizeComparable(station.accessCode) !== "public") {
    return false;
  }

  if (filters.operatingOnly && station.sourceStatus.toUpperCase() !== "E") {
    return false;
  }

  return true;
}

function stationSupportsLevel(station: RouteSearchStation, level: ChargingLevel): boolean {
  return level === "LEVEL_2" ? station.level2PortCount > 0 : station.dcFastPortCount > 0;
}

function compareStations(left: RouteSearchStation, right: RouteSearchStation): number {
  return (
    left.distanceFromRouteMeters - right.distanceFromRouteMeters ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

function normalizeLocationQuery(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase();
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function hasUniqueCaseInsensitiveValues(values: readonly string[]): boolean {
  return new Set(values.map(normalizeComparable)).size === values.length;
}
