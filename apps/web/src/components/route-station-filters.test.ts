import type { RouteSearchResponse } from "@chargewise/shared";
import { describe, expect, it } from "vitest";

import {
  createDefaultRouteStationFilters,
  filterRouteStations,
  getRouteStationFilterOptions,
  type RouteStation,
} from "./route-station-filters.ts";

const firstStation: RouteStation = {
  id: "ecba119c-963d-4931-acb8-1320791258be",
  name: "Westfield Fast Charging",
  network: "Electrify America",
  longitude: -118.605,
  latitude: 34.19,
  distanceFromRouteMeters: 1200,
  connectorCodes: ["CCS"],
  compatible: true,
  level2PortCount: 0,
  dcFastPortCount: 8,
  accessCode: "public",
  sourceStatus: "E",
  lastSyncedAt: "2026-08-02T20:00:00.000Z",
  isFavorite: false,
};

const secondStation: RouteStation = {
  id: "cb559763-3d59-474d-a7da-c2fd7ad5dbcc",
  name: "Campus Charging Hub",
  network: "EVgo",
  longitude: -117.232,
  latitude: 32.88,
  distanceFromRouteMeters: 650,
  connectorCodes: ["CCS", "CHADEMO"],
  compatible: false,
  level2PortCount: 4,
  dcFastPortCount: 6,
  accessCode: "private",
  sourceStatus: "T",
  lastSyncedAt: "2026-08-02T20:00:00.000Z",
  isFavorite: false,
};

const stations: RouteSearchResponse["data"]["stations"] = [firstStation, secondStation];

describe("route station filters", () => {
  it("derives a filtered array without changing source order or data", () => {
    const sourceSnapshot = structuredClone(stations);
    const filters = createDefaultRouteStationFilters();

    filters.query = "westfield";
    filters.network = "Electrify America";

    const result = filterRouteStations(stations, filters);

    expect(result).toEqual([firstStation]);
    expect(result).not.toBe(stations);
    expect(stations).toEqual(sourceSnapshot);
  });

  it("combines connector, charging-level, compatibility, access, and status filters", () => {
    const filters = createDefaultRouteStationFilters();

    filters.connector = "CHADEMO";
    filters.chargingLevel = "LEVEL_2";
    filters.compatibility = "INCOMPATIBLE";

    expect(filterRouteStations(stations, filters)).toEqual([secondStation]);

    filters.publicOnly = true;
    filters.operatingOnly = true;

    expect(filterRouteStations(stations, filters)).toEqual([]);
  });

  it("derives sorted unique filter options from the source stations", () => {
    expect(getRouteStationFilterOptions(stations)).toEqual({
      networks: ["Electrify America", "EVgo"],
      connectors: ["CCS", "CHADEMO"],
    });
  });
});
