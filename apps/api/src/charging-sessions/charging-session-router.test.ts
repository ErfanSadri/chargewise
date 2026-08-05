import type { PublicChargingSession, PublicUser } from "@chargewise/shared";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticationService } from "../auth/authentication-service.js";
import { createSessionCookie } from "../auth/session-cookie.js";
import { createSessionToken } from "../auth/session-token.js";
import { createHttpLogger, createLogger } from "../logging/logger.js";
import { createChargingSessionRouter } from "./charging-session-router.js";
import {
  ChargingSessionNotFoundError,
  type ChargingSessionService,
} from "./charging-session-service.js";

const webOrigin = "http://localhost:5173";
const user: PublicUser = {
  id: "2d9b977f-fac0-47f1-bf48-59406c414722",
  email: "driver@example.com",
  createdAt: "2026-08-05T05:00:00.000Z",
  updatedAt: "2026-08-05T05:00:00.000Z",
};

const session: PublicChargingSession = {
  id: "0f30c755-32c8-49c7-9aef-f53f761355c5",
  vehicleId: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  stationId: "ecba119c-963d-4931-acb8-1320791258be",
  startedAt: "2026-08-01T19:00:00.000Z",
  chargingMinutes: 31,
  waitMinutes: 8,
  energyAddedKwh: "42.700",
  totalCost: "0.00",
  startingSoc: 18,
  endingSoc: 79,
  odometerMiles: 15420,
  issueType: "NONE",
  notes: "Successful session",
  createdAt: "2026-08-01T20:00:00.000Z",
  updatedAt: "2026-08-01T20:00:00.000Z",
};

const createInput = {
  vehicleId: session.vehicleId,
  stationId: session.stationId,
  startedAt: session.startedAt,
  chargingMinutes: session.chargingMinutes,
  waitMinutes: session.waitMinutes,
  energyAddedKwh: session.energyAddedKwh,
  totalCost: session.totalCost,
  startingSoc: session.startingSoc,
  endingSoc: session.endingSoc,
  odometerMiles: session.odometerMiles,
  issueType: session.issueType,
  notes: session.notes,
};

const authenticationService: AuthenticationService = {
  register: vi.fn(),
  login: vi.fn(),
  authenticate: vi.fn().mockResolvedValue(user),
  logout: vi.fn(),
};

const service: ChargingSessionService = {
  list: vi.fn().mockResolvedValue({
    sessions: [session],
    nextCursor: null,
  }),
  get: vi.fn().mockResolvedValue(session),
  create: vi.fn().mockResolvedValue(session),
  update: vi.fn().mockResolvedValue(session),
  delete: vi.fn().mockResolvedValue(undefined),
};

function createTestApp() {
  const app = express();

  app.use(createHttpLogger(createLogger("test")));
  app.use(express.json());
  app.use(
    "/api/v1/charging-sessions",
    createChargingSessionRouter({
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

describe("charging-session router", () => {
  it("lists authenticated sessions with date and cursor filters", async () => {
    const response = await request(createTestApp())
      .get(`/api/v1/charging-sessions?from=2026-08-01&to=2026-08-31&cursor=${session.id}`)
      .set("Cookie", authenticatedCookie())
      .expect(200);

    expect(response.body).toEqual({
      data: [session],
      meta: {
        nextCursor: null,
      },
    });
    expect(service.list).toHaveBeenCalledWith(user.id, {
      from: "2026-08-01",
      to: "2026-08-31",
      cursor: session.id,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("creates a charging session", async () => {
    const response = await request(createTestApp())
      .post("/api/v1/charging-sessions")
      .set("Cookie", authenticatedCookie())
      .set("Origin", webOrigin)
      .send(createInput)
      .expect(201);

    expect(response.body).toEqual({
      data: session,
    });
    expect(service.create).toHaveBeenCalledWith(user.id, createInput);
  });

  it("reads, updates, and deletes an owned session", async () => {
    await request(createTestApp())
      .get(`/api/v1/charging-sessions/${session.id}`)
      .set("Cookie", authenticatedCookie())
      .expect(200);

    await request(createTestApp())
      .patch(`/api/v1/charging-sessions/${session.id}`)
      .set("Cookie", authenticatedCookie())
      .set("Origin", webOrigin)
      .send({
        notes: "Updated note",
      })
      .expect(200);

    await request(createTestApp())
      .delete(`/api/v1/charging-sessions/${session.id}`)
      .set("Cookie", authenticatedCookie())
      .set("Origin", webOrigin)
      .expect(204);

    expect(service.get).toHaveBeenCalledWith(user.id, session.id);
    expect(service.update).toHaveBeenCalledWith(user.id, session.id, {
      notes: "Updated note",
    });
    expect(service.delete).toHaveBeenCalledWith(user.id, session.id);
  });

  it("rejects invalid session invariants before calling the service", async () => {
    const response = await request(createTestApp())
      .post("/api/v1/charging-sessions")
      .set("Cookie", authenticatedCookie())
      .set("Origin", webOrigin)
      .send({
        ...createInput,
        endingSoc: createInput.startingSoc,
      })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(service.create).not.toHaveBeenCalled();
  });

  it("requires authentication and the configured mutation origin", async () => {
    await request(createTestApp()).get("/api/v1/charging-sessions").expect(401);

    const response = await request(createTestApp())
      .post("/api/v1/charging-sessions")
      .set("Cookie", authenticatedCookie())
      .set("Origin", "https://attacker.example")
      .send(createInput)
      .expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(service.create).not.toHaveBeenCalled();
  });

  it("uses not found for absent and cross-user resources", async () => {
    vi.mocked(service.get).mockRejectedValueOnce(new ChargingSessionNotFoundError());

    const response = await request(createTestApp())
      .get(`/api/v1/charging-sessions/${session.id}`)
      .set("Cookie", authenticatedCookie())
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("hides dependency failures behind the standard service error", async () => {
    vi.mocked(service.list).mockRejectedValueOnce(new Error("private database failure"));

    const response = await request(createTestApp())
      .get("/api/v1/charging-sessions")
      .set("Cookie", authenticatedCookie())
      .expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("private database failure");
  });
});
