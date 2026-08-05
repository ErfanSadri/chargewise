import type { PublicUser, PublicVehicle } from "@chargewise/shared";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticationService } from "../auth/authentication-service.js";
import type { AppLogger } from "../logging/logger.js";
import { createLogger } from "../logging/logger.js";
import { createVehicleRouter, type VehicleRouterOptions } from "./vehicle-router.js";
import { type VehicleService, VehicleNotFoundError } from "./vehicle-service.js";
import express from "express";
import { createHttpLogger } from "../logging/logger.js";

const webOrigin = "http://localhost:5173";
const sessionToken = "a".repeat(43);

const publicUser: PublicUser = {
  id: "73a9ec58-90f7-45b8-b53a-bc3a25a92ae4",
  email: "driver@example.com",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
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
  updatedAt: "2026-08-04T12:00:00.000Z",
};

function createAuthenticationService(): AuthenticationService {
  return {
    register: vi.fn(),
    login: vi.fn(),
    authenticate: vi.fn().mockResolvedValue(publicUser),
    logout: vi.fn(),
  };
}

function createVehicleService(): VehicleService {
  return {
    list: vi.fn().mockResolvedValue([publicVehicle]),
    get: vi.fn().mockResolvedValue(publicVehicle),
    create: vi.fn().mockResolvedValue(publicVehicle),
    update: vi.fn().mockResolvedValue(publicVehicle),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createTestApp(
  overrides: Partial<VehicleRouterOptions> = {},
  logger: AppLogger = createLogger("test"),
) {
  const authenticationService = overrides.authenticationService ?? createAuthenticationService();

  const service = overrides.service ?? createVehicleService();

  const app = express();

  app.use(createHttpLogger(logger));
  app.use(express.json());
  app.use(
    "/api/v1/vehicles",
    createVehicleRouter({
      authenticationService,
      service,
      isProduction: false,
      webOrigin,
      ...overrides,
    }),
  );

  return {
    app,
    authenticationService,
    service,
  };
}

function authenticatedRequest(app: ReturnType<typeof express>) {
  const cookie = `chargewise_session=${sessionToken}`;

  return {
    get: (path: string) => request(app).get(path).set("Cookie", cookie),

    post: (path: string) => request(app).post(path).set("Cookie", cookie),

    patch: (path: string) => request(app).patch(path).set("Cookie", cookie),

    delete: (path: string) => request(app).delete(path).set("Cookie", cookie),
  };
}

describe("vehicle router", () => {
  let authenticationService: AuthenticationService;
  let service: VehicleService;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    const setup = createTestApp();

    app = setup.app;
    authenticationService = setup.authenticationService;
    service = setup.service;
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/vehicles").expect(401);

    expect(response.body.error).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });

    expect(service.list).not.toHaveBeenCalled();
  });

  it("lists vehicles for the authenticated user", async () => {
    const response = await authenticatedRequest(app).get("/api/v1/vehicles").expect(200);

    expect(response.body).toEqual({
      data: [publicVehicle],
    });

    expect(service.list).toHaveBeenCalledWith(publicUser.id);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("creates a vehicle from a valid request", async () => {
    const body = {
      nickname: "My i5",
      make: "BMW",
      model: "i5 eDrive40",
      year: 2025,
      batteryCapacityKwh: "81.20",
      efficiencyMiPerKwh: "3.10",
      connectorTypes: ["CCS", "J1772"],
      preferredNetworks: ["Electrify America"],
      isDefault: true,
    };

    const response = await authenticatedRequest(app)
      .post("/api/v1/vehicles")
      .set("Origin", webOrigin)
      .send(body)
      .expect(201);

    expect(response.body).toEqual({
      data: publicVehicle,
    });

    expect(service.create).toHaveBeenCalledWith(publicUser.id, body);
  });

  it("rejects an invalid create request", async () => {
    const response = await authenticatedRequest(app)
      .post("/api/v1/vehicles")
      .set("Origin", webOrigin)
      .send({
        nickname: "",
        make: "BMW",
        model: "i5",
        year: 1989,
        connectorTypes: [],
      })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(service.create).not.toHaveBeenCalled();
  });

  it("returns one user-owned vehicle", async () => {
    const response = await authenticatedRequest(app)
      .get(`/api/v1/vehicles/${publicVehicle.id}`)
      .expect(200);

    expect(response.body).toEqual({
      data: publicVehicle,
    });

    expect(service.get).toHaveBeenCalledWith(publicUser.id, publicVehicle.id);
  });

  it("rejects malformed vehicle IDs before calling the service", async () => {
    await authenticatedRequest(app).get("/api/v1/vehicles/not-a-uuid").expect(400);

    expect(service.get).not.toHaveBeenCalled();
  });

  it("returns the same not-found response for a missing or unowned vehicle", async () => {
    vi.mocked(service.get).mockRejectedValue(new VehicleNotFoundError());

    const response = await authenticatedRequest(app)
      .get(`/api/v1/vehicles/${publicVehicle.id}`)
      .expect(404);

    expect(response.body.error).toEqual({
      code: "NOT_FOUND",
      message: "Resource not found",
      details: [],
    });
  });

  it("updates a user-owned vehicle", async () => {
    const update = {
      nickname: "Road trip car",
      isDefault: true,
    };

    const response = await authenticatedRequest(app)
      .patch(`/api/v1/vehicles/${publicVehicle.id}`)
      .set("Origin", webOrigin)
      .send(update)
      .expect(200);

    expect(response.body).toEqual({
      data: publicVehicle,
    });

    expect(service.update).toHaveBeenCalledWith(publicUser.id, publicVehicle.id, update);
  });

  it("rejects an empty update", async () => {
    await authenticatedRequest(app)
      .patch(`/api/v1/vehicles/${publicVehicle.id}`)
      .set("Origin", webOrigin)
      .send({})
      .expect(400);

    expect(service.update).not.toHaveBeenCalled();
  });

  it("deletes a user-owned vehicle", async () => {
    await authenticatedRequest(app)
      .delete(`/api/v1/vehicles/${publicVehicle.id}`)
      .set("Origin", webOrigin)
      .expect(204);

    expect(service.delete).toHaveBeenCalledWith(publicUser.id, publicVehicle.id);
  });

  it("rejects a mismatched supplied origin", async () => {
    await authenticatedRequest(app)
      .post("/api/v1/vehicles")
      .set("Origin", "https://attacker.example")
      .send({
        nickname: "My i5",
        make: "BMW",
        model: "i5",
        year: 2025,
        connectorTypes: ["CCS"],
      })
      .expect(403);

    expect(service.create).not.toHaveBeenCalled();
  });

  it("requires an exact origin in production", async () => {
    const production = createTestApp({
      isProduction: true,
    });

    await authenticatedRequest(production.app)
      .delete(`/api/v1/vehicles/${publicVehicle.id}`)
      .expect(403);

    expect(production.service.delete).not.toHaveBeenCalled();
  });

  it("returns service unavailable for a database failure", async () => {
    vi.mocked(service.list).mockRejectedValue(new Error("private database failure"));

    const response = await authenticatedRequest(app).get("/api/v1/vehicles").expect(503);

    expect(response.body.error).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "Service temporarily unavailable",
      details: [],
    });

    expect(JSON.stringify(response.body)).not.toContain("private database failure");
  });

  it("returns service unavailable when authentication infrastructure fails", async () => {
    vi.mocked(authenticationService.authenticate).mockRejectedValue(
      new Error("private Redis failure"),
    );

    const response = await authenticatedRequest(app).get("/api/v1/vehicles").expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(service.list).not.toHaveBeenCalled();
  });
});
