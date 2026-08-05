import type {
  RouteChargingLevel,
  RouteSearchResponse,
  VehicleConnectorType,
} from "@chargewise/shared";

export type RouteStation = RouteSearchResponse["data"]["stations"][number];

export type StationCompatibilityFilter = "ALL" | "COMPATIBLE" | "INCOMPATIBLE";

export interface RouteStationFilters {
  query: string;
  network: string;
  connector: VehicleConnectorType | "ALL";
  chargingLevel: RouteChargingLevel | "ALL";
  compatibility: StationCompatibilityFilter;
  publicOnly: boolean;
  operatingOnly: boolean;
}

export interface RouteStationFilterOptions {
  networks: string[];
  connectors: VehicleConnectorType[];
}

export function createDefaultRouteStationFilters(): RouteStationFilters {
  return {
    query: "",
    network: "ALL",
    connector: "ALL",
    chargingLevel: "ALL",
    compatibility: "ALL",
    publicOnly: false,
    operatingOnly: false,
  };
}

function matchesQuery(station: RouteStation, normalizedQuery: string): boolean {
  if (normalizedQuery === "") {
    return true;
  }

  const searchableValues = [station.name, station.network ?? "", ...station.connectorCodes];

  return searchableValues.some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
}

function matchesChargingLevel(
  station: RouteStation,
  chargingLevel: RouteStationFilters["chargingLevel"],
): boolean {
  if (chargingLevel === "ALL") {
    return true;
  }

  if (chargingLevel === "DC_FAST") {
    return station.dcFastPortCount > 0;
  }

  return station.level2PortCount > 0;
}

function matchesCompatibility(
  station: RouteStation,
  compatibility: StationCompatibilityFilter,
): boolean {
  if (compatibility === "ALL") {
    return true;
  }

  return compatibility === "COMPATIBLE" ? station.compatible : !station.compatible;
}

export function filterRouteStations(
  stations: readonly RouteStation[],
  filters: RouteStationFilters,
): RouteStation[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase();

  return stations.filter(
    (station) =>
      matchesQuery(station, normalizedQuery) &&
      (filters.network === "ALL" || station.network === filters.network) &&
      (filters.connector === "ALL" || station.connectorCodes.includes(filters.connector)) &&
      matchesChargingLevel(station, filters.chargingLevel) &&
      matchesCompatibility(station, filters.compatibility) &&
      (!filters.publicOnly || station.accessCode.toLocaleLowerCase() === "public") &&
      (!filters.operatingOnly || station.sourceStatus.toLocaleUpperCase() === "E"),
  );
}

export function getRouteStationFilterOptions(
  stations: readonly RouteStation[],
): RouteStationFilterOptions {
  const networkSet = new Set<string>();
  const connectorSet = new Set<VehicleConnectorType>();

  for (const station of stations) {
    if (station.network !== null) {
      networkSet.add(station.network);
    }

    for (const connector of station.connectorCodes) {
      connectorSet.add(connector);
    }
  }

  return {
    networks: [...networkSet].sort((left, right) => left.localeCompare(right)),
    connectors: [...connectorSet].sort((left, right) => left.localeCompare(right)),
  };
}
