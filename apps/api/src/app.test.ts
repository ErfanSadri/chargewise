import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import type { DependencyCheck, HealthChecks } from "./health/health-service.js";
import { errorHandler } from "./http/error-handlers.js";
import { createHttpLogger, createLogger } from "./logging/logger.js";

import type { PublicUser, PublicVehicle } from "@chargewise/shared";

import type { RouteSearchService } from "./routes/route-search-service.js";
import type { VehicleService } from "./vehicles/vehicle-service.js";

import type { AuthenticationResult, AuthenticationService } from "./auth/authentication-service.js";

import type { AuthenticationRateLimiter } from "./auth/authentication-rate-limiter.js";

const sessionToken = "a".repeat(43);

const publicUser: PublicUser = {
  id: "8c30cbb4-f724-4e72-a994-f1429f758c54",
  email: "driver@example.com",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:05:00.000Z",
};

const publicVehicle: PublicVehicle = {
  id: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  nickname: "My i5",
  make: "BMW",
  model: "i5 eDrive40",
  year: 2025,
  batteryCapacityKwh: "81.20",
  efficiencyMiPerKwh: "3.10",
  connectorTypes: ["CCS", "J1772"],
  preferredNetworks: ["Electrify America"],
  isDefault: true,
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:05:00.000Z",
};

const successfulVehicleService: VehicleService = {
  list: async () => [publicVehicle],
  get: async () => publicVehicle,
  create: async () => publicVehicle,
  update: async () => publicVehicle,
  delete: async () => undefined,
};

const successfulRouteSearchService: RouteSearchService = {
  search: async () => {
    throw new Error("Route service should not run in the app mounting test");
  },
};

const authenticationResult: AuthenticationResult = {
  user: publicUser,
  sessionToken,
};

const successfulAuthenticationService: AuthenticationService = {
  register: async () => authenticationResult,
  login: async () => authenticationResult,
  authenticate: async () => publicUser,
  logout: async () => undefined,
};

const successfulAuthenticationRateLimiter: AuthenticationRateLimiter = {
  check: async () => ({
    allowed: true,
    remainingAttempts: 4,
  }),
};

const webOrigin = "http://localhost:5173";
const successfulCheck: DependencyCheck = () => Promise.resolve();
const successfulHealthChecks: HealthChecks = {
  database: successfulCheck,
  cache: successfulCheck,
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

async function createTestWebDistribution(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "chargewise-web-"));
  const assetsDirectory = join(directory, "assets");

  temporaryDirectories.push(directory);
  await mkdir(assetsDirectory);
  await writeFile(
    join(directory, "index.html"),
    '<!doctype html><html><body><div id="root"></div></body></html>',
  );
  await writeFile(join(assetsDirectory, "application.js"), "window.__chargewise = true;");

  return directory;
}

function createTestApp(healthChecks: HealthChecks = successfulHealthChecks, webDistPath?: string) {
  return createApp({
    authentication: {
      service: successfulAuthenticationService,
      rateLimiter: successfulAuthenticationRateLimiter,
      isProduction: false,
      webOrigin,
    },
    healthChecks,
    logger: createLogger("test"),
    ...(webDistPath === undefined ? {} : { webDistPath }),
    webOrigin,

    routes: {
      service: successfulRouteSearchService,
      authenticationService: successfulAuthenticationService,
      isProduction: false,
      webOrigin,
    },

    vehicles: {
      service: successfulVehicleService,
      authenticationService: successfulAuthenticationService,
      isProduction: false,
      webOrigin,
    },
  });
}

function expectRequestId(response: request.Response): string {
  const requestId = response.headers["x-request-id"];

  expect(requestId).toMatch(/^req_[0-9a-f-]{36}$/);

  return String(requestId);
}

describe("API middleware", () => {
  it("adds request, security, and configured-origin headers", async () => {
    const response = await request(createTestApp())
      .get("/api/v1/health")
      .set("Origin", webOrigin)
      .set("X-Request-ID", "client-supplied-id")
      .expect(200);

    expect(expectRequestId(response)).not.toBe("client-supplied-id");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain(
      "https://*.tile.openstreetmap.org",
    );
    expect(response.headers["access-control-allow-origin"]).toBe(webOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-expose-headers"]).toBe("X-Request-ID");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("mounts the authentication router", async () => {
    const response = await request(createTestApp()).get("/api/v1/auth/me").expect(401);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.error).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });
  });

  it("mounts the authenticated vehicle router", async () => {
    const response = await request(createTestApp()).get("/api/v1/vehicles").expect(401);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.error).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });
  });

  it("mounts the authenticated route-search router", async () => {
    const response = await request(createTestApp()).post("/api/v1/routes/search").expect(401);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.error).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });
  });
});

describe("production web application", () => {
  it("serves immutable hashed assets and the SPA entry point", async () => {
    const webDistPath = await createTestWebDistribution();
    const app = createTestApp(successfulHealthChecks, webDistPath);

    const assetResponse = await request(app).get("/assets/application.js").expect(200);

    expect(assetResponse.headers["cache-control"]).toContain("immutable");
    expect(assetResponse.text).toContain("__chargewise");

    const routeResponse = await request(app).get("/login").set("Accept", "text/html").expect(200);

    expect(routeResponse.headers["cache-control"]).toBe("no-store");
    expect(routeResponse.text).toContain('<div id="root"></div>');
  });

  it("keeps unknown API and non-HTML requests outside the SPA fallback", async () => {
    const webDistPath = await createTestWebDistribution();
    const app = createTestApp(successfulHealthChecks, webDistPath);

    const apiResponse = await request(app).get("/api/v1/not-a-route").expect(404);

    expect(apiResponse.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Route not found",
    });

    const textResponse = await request(app)
      .get("/not-a-document")
      .set("Accept", "text/plain")
      .expect(404);

    expect(textResponse.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Route not found",
    });
  });
});

it("returns the standard error envelope for an unknown route", async () => {
  const response = await request(createTestApp()).get("/missing").expect(404);
  const requestId = expectRequestId(response);

  expect(response.body).toEqual({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
      details: [],
    },
    requestId,
  });
});

it("returns a safe validation error for malformed JSON", async () => {
  const response = await request(createTestApp())
    .post("/missing")
    .set("Content-Type", "application/json")
    .send('{"incomplete":')
    .expect(400);
  const requestId = expectRequestId(response);

  expect(response.body).toEqual({
    error: {
      code: "VALIDATION_ERROR",
      message: "Request body is not valid JSON",
      details: [],
    },
    requestId,
  });
});

it("rejects a JSON body over 100 KiB", async () => {
  const response = await request(createTestApp())
    .post("/missing")
    .send({ value: "x".repeat(101 * 1_024) })
    .expect(413);
  const requestId = expectRequestId(response);

  expect(response.body).toEqual({
    error: {
      code: "VALIDATION_ERROR",
      message: "Request body is too large",
      details: [],
    },
    requestId,
  });
});

describe("GET /api/v1/health", () => {
  it("reports ready when both infrastructure checks respond", async () => {
    const response = await request(createTestApp()).get("/api/v1/health").expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      data: {
        process: "up",
        readiness: "ready",
        dependencies: {
          database: "up",
          cache: "up",
        },
      },
    });
  });

  it("reports not ready without returning a dependency error", async () => {
    const privateError = new Error("private database failure details");
    const response = await request(
      createTestApp({
        database: () => Promise.reject(privateError),
        cache: successfulCheck,
      }),
    )
      .get("/api/v1/health")
      .expect(503);

    expect(response.body).toEqual({
      data: {
        process: "up",
        readiness: "not_ready",
        dependencies: {
          database: "down",
          cache: "up",
        },
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(privateError.message);
  });

  it("rejects unexpected query parameters", async () => {
    const response = await request(createTestApp())
      .get("/api/v1/health?unexpected=value")
      .expect(400);
    const requestId = expectRequestId(response);

    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [],
      },
      requestId,
    });
  });

  it("rejects an unexpected request body", async () => {
    const response = await request(createTestApp())
      .get("/api/v1/health")
      .send({ unexpected: true })
      .expect(400);
    const requestId = expectRequestId(response);

    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [],
      },
      requestId,
    });
  });
});

describe("central error handling", () => {
  it("returns a safe error when a route throws unexpectedly", async () => {
    const privateMessage = "private unexpected failure details";
    const app = express();

    app.use(createHttpLogger(createLogger("test")));
    app.get("/failure", () => {
      throw new Error(privateMessage);
    });
    app.use(errorHandler);

    const response = await request(app).get("/failure").expect(500);
    const requestId = expectRequestId(response);

    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        details: [],
      },
      requestId,
    });
    expect(JSON.stringify(response.body)).not.toContain(privateMessage);
  });
});
