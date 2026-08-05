import type {
  AnalyticsNetworkBreakdown,
  AnalyticsStationBreakdown,
  AnalyticsSummary,
  PublicUser,
} from "@chargewise/shared";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticationService } from "../auth/authentication-service.js";
import { createSessionCookie } from "../auth/session-cookie.js";
import { createSessionToken } from "../auth/session-token.js";
import { createHttpLogger, createLogger } from "../logging/logger.js";
import { createAnalyticsRouter } from "./analytics-router.js";
import type { AnalyticsService } from "./analytics-service.js";

const user: PublicUser = {
  id: "2d9b977f-fac0-47f1-bf48-59406c414722",
  email: "driver@example.com",
  createdAt: "2026-08-05T05:00:00.000Z",
  updatedAt: "2026-08-05T05:00:00.000Z",
};

const summary: AnalyticsSummary = {
  sessionCount: 4,
  totalEnergyKwh: "155.400",
  totalCost: "24.10",
  averageCostPerKwh: "0.1551",
  averageChargingMinutes: "29.50",
  averageWaitMinutes: "6.25",
  averageObservedPowerKw: "79.02",
  issueFreePercentage: "75.00",
};

const network: AnalyticsNetworkBreakdown = {
  network: "Electrify America",
  sessionCount: 2,
  totalEnergyKwh: "70.000",
  totalCost: "14.00",
  averageCostPerKwh: "0.2000",
  averageObservedPowerKw: "84.00",
  issueFreePercentage: "50.00",
};

const station: AnalyticsStationBreakdown = {
  stationId: "ecba119c-963d-4931-acb8-1320791258be",
  name: "Westfield Fast Charging",
  network: "Electrify America",
  sessionCount: 2,
  totalEnergyKwh: "70.000",
  totalCost: "14.00",
  averageCostPerKwh: "0.2000",
  averageChargingMinutes: "25.00",
  averageWaitMinutes: "2.50",
  averageObservedPowerKw: "84.00",
  issueFreePercentage: "50.00",
  lastSessionAt: "2026-08-02T12:00:00.000Z",
};

const authenticationService: AuthenticationService = {
  register: vi.fn(),
  login: vi.fn(),
  authenticate: vi.fn().mockResolvedValue(user),
  logout: vi.fn(),
};

const service: AnalyticsService = {
  summary: vi.fn().mockResolvedValue(summary),
  networks: vi.fn().mockResolvedValue([network]),
  stations: vi.fn().mockResolvedValue([station]),
};

function createTestApp() {
  const app = express();

  app.use(createHttpLogger(createLogger("test")));
  app.use(express.json());
  app.use(
    "/api/v1/analytics",
    createAnalyticsRouter({
      service,
      authenticationService,
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

describe("analytics router", () => {
  it("returns summary, network, and station analytics", async () => {
    const cookie = authenticatedCookie();

    await request(createTestApp())
      .get("/api/v1/analytics/summary?from=2026-08-01&to=2026-08-31")
      .set("Cookie", cookie)
      .expect(200, {
        data: summary,
      });

    await request(createTestApp())
      .get("/api/v1/analytics/networks")
      .set("Cookie", cookie)
      .expect(200, {
        data: [network],
      });

    const response = await request(createTestApp())
      .get("/api/v1/analytics/stations")
      .set("Cookie", cookie)
      .expect(200, {
        data: [station],
      });

    expect(service.summary).toHaveBeenCalledWith(user.id, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(service.networks).toHaveBeenCalledWith(user.id, {});
    expect(service.stations).toHaveBeenCalledWith(user.id, {});
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("requires authentication", async () => {
    const response = await request(createTestApp()).get("/api/v1/analytics/summary").expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(service.summary).not.toHaveBeenCalled();
  });

  it("rejects invalid ranges, unexpected parameters, and bodies", async () => {
    const cookie = authenticatedCookie();

    const invalidRange = await request(createTestApp())
      .get("/api/v1/analytics/summary?from=2026-08-10&to=2026-08-01")
      .set("Cookie", cookie)
      .expect(400);

    expect(invalidRange.body.error.code).toBe("VALIDATION_ERROR");

    await request(createTestApp())
      .get("/api/v1/analytics/networks?unexpected=value")
      .set("Cookie", cookie)
      .expect(400);

    await request(createTestApp())
      .get("/api/v1/analytics/stations")
      .set("Cookie", cookie)
      .send({
        unexpected: true,
      })
      .expect(400);
  });

  it("hides dependency failures", async () => {
    vi.mocked(service.summary).mockRejectedValueOnce(new Error("private database failure"));

    const response = await request(createTestApp())
      .get("/api/v1/analytics/summary")
      .set("Cookie", authenticatedCookie())
      .expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("private database failure");
  });
});
