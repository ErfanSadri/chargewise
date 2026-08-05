import type { PublicFavorite, PublicUser } from "@chargewise/shared";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHttpLogger, createLogger } from "../logging/logger.js";
import type { AuthenticationService } from "../auth/authentication-service.js";
import { createSessionCookie } from "../auth/session-cookie.js";
import { createSessionToken } from "../auth/session-token.js";
import { createFavoriteRouter } from "./favorite-router.js";
import { FavoriteStationNotFoundError, type FavoriteService } from "./favorite-service.js";

const webOrigin = "http://localhost:5173";
const user: PublicUser = {
  id: "2d9b977f-fac0-47f1-bf48-59406c414722",
  email: "driver@example.com",
  createdAt: "2026-08-05T05:00:00.000Z",
  updatedAt: "2026-08-05T05:00:00.000Z",
};

const favorite: PublicFavorite = {
  stationId: "ecba119c-963d-4931-acb8-1320791258be",
  name: "Westfield Fast Charging",
  network: "Electrify America",
  longitude: -118.605,
  latitude: 34.19,
  connectorCodes: ["CCS"],
  level2PortCount: 0,
  dcFastPortCount: 8,
  accessCode: "public",
  sourceStatus: "E",
  lastSyncedAt: "2026-08-02T20:00:00.000Z",
  favoritedAt: "2026-08-05T06:00:00.000Z",
  isFavorite: true,
};

const authenticationService: AuthenticationService = {
  register: vi.fn(),
  login: vi.fn(),
  authenticate: vi.fn().mockResolvedValue(user),
  logout: vi.fn(),
};

const service: FavoriteService = {
  list: vi.fn().mockResolvedValue([favorite]),
  add: vi.fn().mockResolvedValue(favorite),
  remove: vi.fn().mockResolvedValue(undefined),
};

function createTestApp() {
  const app = express();

  app.use(createHttpLogger(createLogger("test")));
  app.use(express.json());
  app.use(
    "/api/v1/favorites",
    createFavoriteRouter({
      service,
      authenticationService,
      isProduction: false,
      webOrigin,
    }),
  );

  return app;
}

function authenticatedCookie(): string {
  const setCookie = createSessionCookie(createSessionToken(), {
    isProduction: false,
  });
  const cookie = setCookie.split(";")[0];

  if (cookie === undefined) {
    throw new Error("Session cookie was not created");
  }

  return cookie;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("favorite router", () => {
  it("lists favorites for the authenticated user", async () => {
    const response = await request(createTestApp())
      .get("/api/v1/favorites")
      .set("Cookie", authenticatedCookie())
      .expect(200);

    expect(response.body).toEqual({
      data: [favorite],
    });
    expect(service.list).toHaveBeenCalledWith(user.id);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("idempotently saves a favorite", async () => {
    const response = await request(createTestApp())
      .put(`/api/v1/favorites/${favorite.stationId}`)
      .set("Cookie", authenticatedCookie())
      .set("Origin", webOrigin)
      .expect(200);

    expect(response.body).toEqual({
      data: favorite,
    });
    expect(service.add).toHaveBeenCalledWith(user.id, favorite.stationId);
  });

  it("idempotently removes a favorite", async () => {
    await request(createTestApp())
      .delete(`/api/v1/favorites/${favorite.stationId}`)
      .set("Cookie", authenticatedCookie())
      .set("Origin", webOrigin)
      .expect(204);

    expect(service.remove).toHaveBeenCalledWith(user.id, favorite.stationId);
  });

  it("rejects an invalid station identifier", async () => {
    const response = await request(createTestApp())
      .put("/api/v1/favorites/not-a-uuid")
      .set("Cookie", authenticatedCookie())
      .set("Origin", webOrigin)
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(service.add).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const response = await request(createTestApp()).get("/api/v1/favorites").expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(service.list).not.toHaveBeenCalled();
  });

  it("requires the configured origin for mutations", async () => {
    const response = await request(createTestApp())
      .put(`/api/v1/favorites/${favorite.stationId}`)
      .set("Cookie", authenticatedCookie())
      .set("Origin", "https://attacker.example")
      .expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(service.add).not.toHaveBeenCalled();
  });

  it("returns not found when the station does not exist", async () => {
    vi.mocked(service.add).mockRejectedValueOnce(new FavoriteStationNotFoundError());

    const response = await request(createTestApp())
      .put(`/api/v1/favorites/${favorite.stationId}`)
      .set("Cookie", authenticatedCookie())
      .set("Origin", webOrigin)
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("hides dependency failures behind the standard service error", async () => {
    vi.mocked(service.list).mockRejectedValueOnce(new Error("private database failure"));

    const response = await request(createTestApp())
      .get("/api/v1/favorites")
      .set("Cookie", authenticatedCookie())
      .expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("private database failure");
  });
});
