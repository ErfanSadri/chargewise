import { describe, expect, it } from "vitest";

import { createFixtureRouteProviders } from "./fixture-route-providers.js";

describe("fixture route providers", () => {
  it("returns deterministic route discovery data", async () => {
    const providers = createFixtureRouteProviders();

    const origin = await providers.geocodingProvider.geocode("Woodland Hills, CA");
    const destination = await providers.geocodingProvider.geocode("UC San Diego, La Jolla, CA");

    expect(origin[0]).toMatchObject({
      label: "Woodland Hills, Los Angeles, California, United States",
      longitude: -118.593153,
      latitude: 34.15404,
    });
    expect(destination[0]).toMatchObject({
      label: "UC San Diego, La Jolla, California, United States",
      longitude: -117.23952,
      latitude: 32.877207,
    });

    const route = await providers.routingProvider.createRoute({
      origin: [-118.593153, 34.15404],
      destination: [-117.23952, 32.877207],
    });

    expect(route).toMatchObject({
      distanceMeters: 219514.4,
      durationSeconds: 8928.2,
    });
    expect(route.geometry.coordinates).toHaveLength(3);

    const stations = await providers.stationProvider.findAlongRoute({
      routeWkt: "LINESTRING(-118.593153 34.15404,-117.23952 32.877207)",
      corridorMeters: 8046.72,
    });

    expect(stations.map((station) => station.name)).toEqual([
      "Westfield Topanga",
      "Campus Charging",
    ]);
  });

  it("returns no candidate for an unsupported location", async () => {
    const providers = createFixtureRouteProviders();

    await expect(providers.geocodingProvider.geocode("Unknown place")).resolves.toEqual([]);
  });
});
