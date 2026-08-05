import type { PublicUser, RouteSearchRequest } from "@chargewise/shared";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticationService } from "../auth/authentication-service.js";
import { createHttpLogger, createLogger } from "../logging/logger.js";
import { createRouteSearchRouter, type RouteSearchRouterOptions } from "./route-search-router.js";
import {
  LocationNotResolvedError,
  RouteSearchPersistenceError,
  RouteSearchProviderUnavailableError,
  type RouteSearchResult,
  type RouteSearchService,
  RouteSearchVehicleNotFoundError,
} from "./route-search-service.js";

const webOrigin = "http://localhost:5173";
const sessionToken = "a".repeat(43);

const publicUser: PublicUser = {
  id: "73a9ec58-90f7-45b8-b53a-bc3a25a92ae4",
  email: "driver@example.com",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
};

const searchRequest: RouteSearchRequest = {
  origin: "Woodland Hills, CA",
  destination: "UC San Diego, La Jolla, CA",
  vehicleId: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  corridorMeters: 8000,
  filters: {
    compatibleOnly: true,
    networks: [],
    chargingLevels: ["DC_FAST"],
    publicOnly: true,
    operatingOnly: true,
  },
};

const searchResult: RouteSearchResult = {
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
  },
  stations: [
    {
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
    },
  ],
  meta: {
    stationSource: "NLR_AFDC",
    routeSource: "OPENROUTESERVICE",
    stationCount: 1,
  },
};

function createAuthenticationService(): AuthenticationService {
  return {
    register: vi.fn(),
    login: vi.fn(),
    authenticate: vi.fn().mockResolvedValue(publicUser),
    logout: vi.fn(),
  };
}

function createService(): RouteSearchService {
  return {
    search: vi.fn().mockResolvedValue(searchResult),
  };
}

function createTestApp(overrides: Partial<RouteSearchRouterOptions> = {}) {
  const authenticationService = overrides.authenticationService ?? createAuthenticationService();
  const service = overrides.service ?? createService();
  const app = express();

  app.use(createHttpLogger(createLogger("test")));
  app.use(express.json());
  app.use(
    "/api/v1/routes",
    createRouteSearchRouter({
      authenticationService,
      service,
      isProduction: false,
      webOrigin,
      ...overrides,
    }),
  );

  return {
    app,
    service,
  };
}

function authenticatedPost(app: ReturnType<typeof express>) {
  return request(app)
    .post("/api/v1/routes/search")
    .set("Cookie", `chargewise_session=${sessionToken}`)
    .set("Origin", webOrigin);
}

describe("route-search router", () => {
  let app: ReturnType<typeof express>;
  let service: RouteSearchService;

  beforeEach(() => {
    const setup = createTestApp();
    app = setup.app;
    service = setup.service;
  });

  it("requires authentication", async () => {
    const response = await request(app)
      .post("/api/v1/routes/search")
      .set("Origin", webOrigin)
      .send(searchRequest)
      .expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(service.search).not.toHaveBeenCalled();
  });

  it("searches as the authenticated user", async () => {
    const response = await authenticatedPost(app).send(searchRequest).expect(200);

    expect(response.body).toEqual({
      data: {
        route: searchResult.route,
        stations: searchResult.stations,
      },
      meta: searchResult.meta,
    });
    expect(service.search).toHaveBeenCalledWith({
      userId: publicUser.id,
      ...searchRequest,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("rejects invalid input before calling the service", async () => {
    await authenticatedPost(app)
      .send({
        ...searchRequest,
        origin: "",
      })
      .expect(400);

    expect(service.search).not.toHaveBeenCalled();
  });

  it("rejects unexpected query parameters", async () => {
    await authenticatedPost(app).query({ unexpected: "value" }).send(searchRequest).expect(400);

    expect(service.search).not.toHaveBeenCalled();
  });

  it("returns not found for a missing or unowned vehicle", async () => {
    vi.mocked(service.search).mockRejectedValue(new RouteSearchVehicleNotFoundError());

    const response = await authenticatedPost(app).send(searchRequest).expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("returns a location-specific unresolvable response", async () => {
    vi.mocked(service.search).mockRejectedValue(new LocationNotResolvedError("destination"));

    const response = await authenticatedPost(app).send(searchRequest).expect(422);

    expect(response.body.error).toEqual({
      code: "LOCATION_NOT_RESOLVED",
      message: "Destination location could not be resolved",
      details: [],
    });
  });

  it("returns a safe provider-unavailable response", async () => {
    vi.mocked(service.search).mockRejectedValue(
      new RouteSearchProviderUnavailableError(
        "OPENROUTESERVICE_ROUTING",
        new Error("private provider failure"),
      ),
    );

    const response = await authenticatedPost(app).send(searchRequest).expect(503);

    expect(response.body.error).toEqual({
      code: "PROVIDER_UNAVAILABLE",
      message: "Route provider temporarily unavailable",
      details: [],
    });
    expect(JSON.stringify(response.body)).not.toContain("private provider failure");
  });

  it("returns service unavailable for station persistence failures", async () => {
    vi.mocked(service.search).mockRejectedValue(
      new RouteSearchPersistenceError(new Error("private database failure")),
    );

    const response = await authenticatedPost(app).send(searchRequest).expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("private database failure");
  });
});
