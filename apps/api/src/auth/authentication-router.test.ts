import type { AuthenticationCredentials, PublicUser } from "@chargewise/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticationRateLimiter } from "./authentication-rate-limiter.js";

import {
  EmailConflictError,
  type AuthenticationResult,
  type AuthenticationService,
  UnauthenticatedError,
} from "./authentication-service.js";
import { createAuthenticationRouter } from "./authentication-router.js";
import { sessionCookieName, sessionLifetimeSeconds } from "./session-token.js";
import { errorHandler } from "../http/error-handlers.js";
import { createHttpLogger, createLogger } from "../logging/logger.js";

const webOrigin = "http://localhost:5173";
const sessionToken = "a".repeat(43);
const existingSessionToken = "b".repeat(43);
const password = "exact-password-value";

const publicUser: PublicUser = {
  id: "8c30cbb4-f724-4e72-a994-f1429f758c54",
  email: "driver@example.com",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:05:00.000Z",
};

const authenticationResult: AuthenticationResult = {
  user: publicUser,
  sessionToken,
};

function createRateLimiter() {
  const check = vi.fn<AuthenticationRateLimiter["check"]>();

  check.mockResolvedValue({
    allowed: true,
    remainingAttempts: 4,
  });

  return {
    check,
  };
}

function createService() {
  return {
    register: vi.fn(async () => authenticationResult),
    login: vi.fn(async () => authenticationResult),
    authenticate: vi.fn(async () => publicUser),
    logout: vi.fn(async () => undefined),
  } satisfies AuthenticationService;
}

function createTestApp(
  service: AuthenticationService,
  isProduction = false,
  rateLimiter: AuthenticationRateLimiter = createRateLimiter(),
) {
  const app = express();

  app.use(createHttpLogger(createLogger("test")));
  app.use(express.json({ limit: "100kb" }));
  app.use(
    "/api/v1/auth",
    createAuthenticationRouter({
      service,
      rateLimiter,
      isProduction,
      webOrigin,
    }),
  );
  app.use(errorHandler);

  return app;
}

function expectRequestId(value: unknown): void {
  expect(value).toEqual(expect.stringMatching(/^req_[0-9a-f-]{36}$/u));
}

function getSetCookieHeader(response: request.Response): string {
  const header = response.headers["set-cookie"];

  expect(Array.isArray(header)).toBe(true);
  expect(header).toHaveLength(1);

  return String(header?.[0]);
}

describe("authentication router", () => {
  it("registers with normalized credentials and sets a session cookie", async () => {
    const service = createService();

    const response = await request(createTestApp(service))
      .post("/api/v1/auth/register")
      .send({
        email: " Driver@Example.com ",
        password,
      })
      .expect(201);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      data: publicUser,
    });

    expect(service.register).toHaveBeenCalledWith(
      {
        email: "driver@example.com",
        password,
      } satisfies AuthenticationCredentials,
      null,
    );

    const cookie = getSetCookieHeader(response);

    expect(cookie).toContain(`${sessionCookieName}=${sessionToken}`);
    expect(cookie).toContain(`Max-Age=${sessionLifetimeSeconds}`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("rejects unknown registration fields before calling the service", async () => {
    const service = createService();

    const response = await request(createTestApp(service))
      .post("/api/v1/auth/register")
      .send({
        email: "driver@example.com",
        password,
        role: "administrator",
      })
      .expect(400);

    expect(response.body.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: [],
    });

    expectRequestId(response.body.requestId);
    expect(service.register).not.toHaveBeenCalled();
  });

  it("maps duplicate registration emails to conflict", async () => {
    const service = createService();

    service.register.mockRejectedValueOnce(new EmailConflictError());

    const response = await request(createTestApp(service))
      .post("/api/v1/auth/register")
      .send({
        email: "driver@example.com",
        password,
      })
      .expect(409);

    expect(response.body.error).toEqual({
      code: "CONFLICT",
      message: "An account with this email already exists",
      details: [],
    });

    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("passes the current browser session to login and rotates its cookie", async () => {
    const service = createService();

    const response = await request(createTestApp(service))
      .post("/api/v1/auth/login")
      .set("Cookie", `${sessionCookieName}=${existingSessionToken}`)
      .send({
        email: "driver@example.com",
        password,
      })
      .expect(200);

    expect(service.login).toHaveBeenCalledWith(
      {
        email: "driver@example.com",
        password,
      },
      existingSessionToken,
    );

    expect(response.body).toEqual({
      data: publicUser,
    });

    expect(getSetCookieHeader(response)).toContain(`${sessionCookieName}=${sessionToken}`);
  });

  it("returns the generic unauthenticated response for invalid credentials", async () => {
    const service = createService();

    service.login.mockRejectedValueOnce(new UnauthenticatedError());

    const response = await request(createTestApp(service))
      .post("/api/v1/auth/login")
      .send({
        email: "driver@example.com",
        password,
      })
      .expect(401);

    expect(response.body.error).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });

    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("returns the current user for a valid session", async () => {
    const service = createService();

    const response = await request(createTestApp(service))
      .get("/api/v1/auth/me")
      .set("Cookie", `${sessionCookieName}=${sessionToken}`)
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      data: publicUser,
    });

    expect(service.authenticate).toHaveBeenCalledWith(sessionToken);
  });

  it("does not call authentication when the session cookie is missing", async () => {
    const service = createService();

    const response = await request(createTestApp(service)).get("/api/v1/auth/me").expect(401);

    expect(response.body.error).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });

    expect(service.authenticate).not.toHaveBeenCalled();
  });

  it("clears the cookie and makes logout idempotent", async () => {
    const service = createService();

    const response = await request(createTestApp(service))
      .post("/api/v1/auth/logout")
      .set("Cookie", `${sessionCookieName}=${sessionToken}`)
      .expect(204);

    expect(response.text).toBe("");
    expect(service.logout).toHaveBeenCalledWith(sessionToken);

    const cookie = getSetCookieHeader(response);

    expect(cookie).toContain(`${sessionCookieName}=`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("still clears the cookie when Redis logout fails", async () => {
    const service = createService();

    service.logout.mockRejectedValueOnce(new Error("private Redis failure"));

    const response = await request(createTestApp(service))
      .post("/api/v1/auth/logout")
      .set("Cookie", `${sessionCookieName}=${sessionToken}`)
      .expect(503);

    expect(response.body.error).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "Service temporarily unavailable",
      details: [],
    });

    expect(getSetCookieHeader(response)).toContain(`${sessionCookieName}=`);
  });

  it("rejects a missing production origin before registration", async () => {
    const service = createService();

    const response = await request(createTestApp(service, true))
      .post("/api/v1/auth/register")
      .send({
        email: "driver@example.com",
        password,
      })
      .expect(403);

    expect(response.body.error).toEqual({
      code: "FORBIDDEN",
      message: "Request is not allowed",
      details: [],
    });

    expect(service.register).not.toHaveBeenCalled();
  });

  it("allows the configured production origin and uses Secure cookies", async () => {
    const service = createService();

    const response = await request(createTestApp(service, true))
      .post("/api/v1/auth/login")
      .set("Origin", webOrigin)
      .send({
        email: "driver@example.com",
        password,
      })
      .expect(200);

    expect(getSetCookieHeader(response)).toContain("Secure");
  });

  it("rejects unexpected query parameters", async () => {
    const service = createService();

    const response = await request(createTestApp(service))
      .get("/api/v1/auth/me?unexpected=value")
      .set("Cookie", `${sessionCookieName}=${sessionToken}`)
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(service.authenticate).not.toHaveBeenCalled();
  });

  it("blocks registration attempts beyond the configured limit", async () => {
    const service = createService();
    const rateLimiter = createRateLimiter();

    rateLimiter.check.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 725,
    });

    const response = await request(createTestApp(service, false, rateLimiter))
      .post("/api/v1/auth/register")
      .send({
        email: "driver@example.com",
        password,
      })
      .expect(429);

    expect(response.headers["retry-after"]).toBe("725");

    expect(response.body.error).toEqual({
      code: "RATE_LIMITED",
      message: "Too many requests",
      details: [],
    });

    expect(rateLimiter.check).toHaveBeenCalledWith("register", expect.any(String));

    expect(service.register).not.toHaveBeenCalled();
  });

  it("fails closed when the login rate-limit store is unavailable", async () => {
    const service = createService();
    const rateLimiter = createRateLimiter();

    rateLimiter.check.mockRejectedValueOnce(new Error("private Redis failure"));

    const response = await request(createTestApp(service, false, rateLimiter))
      .post("/api/v1/auth/login")
      .send({
        email: "driver@example.com",
        password,
      })
      .expect(503);

    expect(response.body.error).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "Service temporarily unavailable",
      details: [],
    });

    expect(rateLimiter.check).toHaveBeenCalledWith("login", expect.any(String));

    expect(service.login).not.toHaveBeenCalled();
  });
});
