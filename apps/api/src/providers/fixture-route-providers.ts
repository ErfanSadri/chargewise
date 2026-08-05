import {
  routeProviderInputSchema,
  stationCorridorQuerySchema,
  type GeocodedLocation,
  type GeocodingProvider,
  type NormalizedRoute,
  type NormalizedStation,
  type RoutingProvider,
  type StationProvider,
} from "./provider-models.js";

export interface FixtureRouteProviders {
  geocodingProvider: GeocodingProvider;
  routingProvider: RoutingProvider;
  stationProvider: StationProvider;
}

const woodlandHills: GeocodedLocation = {
  label: "Woodland Hills, Los Angeles, California, United States",
  longitude: -118.593153,
  latitude: 34.15404,
};

const ucSanDiego: GeocodedLocation = {
  label: "UC San Diego, La Jolla, California, United States",
  longitude: -117.23952,
  latitude: 32.877207,
};

const fixtureStations: readonly NormalizedStation[] = [
  {
    sourceStationId: "e2e-westfield-topanga",
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
    sourceUpdatedAt: "2026-08-01T12:00:00.000Z",
  },
  {
    sourceStationId: "e2e-campus-charging",
    name: "Campus Charging",
    streetAddress: "9500 Gilman Drive",
    city: "La Jolla",
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
    sourceUpdatedAt: "2026-08-01T12:00:00.000Z",
  },
];

function geocodeFixture(query: string): GeocodedLocation[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.includes("woodland hills")) {
    return [woodlandHills];
  }

  if (
    normalizedQuery.includes("uc san diego") ||
    normalizedQuery.includes("la jolla") ||
    normalizedQuery.includes("gilman")
  ) {
    return [ucSanDiego];
  }

  return [];
}

export function createFixtureRouteProviders(): FixtureRouteProviders {
  return {
    geocodingProvider: {
      async geocode(query) {
        return geocodeFixture(query);
      },
    },

    routingProvider: {
      async createRoute(input): Promise<NormalizedRoute> {
        const parsedInput = routeProviderInputSchema.parse(input);

        return {
          geometry: {
            type: "LineString",
            coordinates: [parsedInput.origin, [-118.24368, 34.05223], parsedInput.destination],
          },
          distanceMeters: 219514.4,
          durationSeconds: 8928.2,
        };
      },
    },

    stationProvider: {
      async findAlongRoute(input): Promise<NormalizedStation[]> {
        stationCorridorQuerySchema.parse(input);

        return fixtureStations.map((station) => ({
          ...station,
          connectorCodes: [...station.connectorCodes],
        }));
      },
    },
  };
}
