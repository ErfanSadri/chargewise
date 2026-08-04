import type { PublicUser } from "@chargewise/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { type AuthenticationService, UnauthenticatedError } from "./authentication-service.js";
import { createRequireAuthentication } from "./authentication-middleware.js";
import { sessionCookieName } from "./session-token.js";
import { createHttpLogger, createLogger } from "../logging/logger.js";

const sessionToken = "a".repeat(43);

const publicUser: PublicUser = {
  id: "8c30cbb4-f724-4e72-a994-f1429f758c54",
  email: "driver@example.com",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:05:00.000Z",
};

function createService(): AuthenticationService {
  return {
    register: vi.fn(),
    login: vi.fn(),
    authenticate: vi.fn(async () => publicUser),
    logout: vi.fn(),
  };
}

function createTestApp(service: AuthenticationService) {
  const app = express();

  app.use(createHttpLogger(createLogger("test")));

  app.get("/protected", createRequireAuthentication(service), (request, response) => {
    response.status(200).json({
      data: request.authenticatedUser,
    });
  });

  return app;
}

describe("authentication middleware", () => {
  it("loads the current user from a valid session", async () => {
    const service = createService();

    const response = await request(createTestApp(service))
      .get("/protected")
      .set("Cookie", `${sessionCookieName}=${sessionToken}`)
      .expect(200);

    expect(response.body).toEqual({
      data: publicUser,
    });

    expect(service.authenticate).toHaveBeenCalledWith(sessionToken);
  });

  it("rejects a missing session cookie without calling the service", async () => {
    const service = createService();

    const response = await request(createTestApp(service)).get("/protected").expect(401);

    expect(response.body.error).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });

    expect(service.authenticate).not.toHaveBeenCalled();
  });

  it("rejects a malformed session cookie without calling the service", async () => {
    const service = createService();

    await request(createTestApp(service))
      .get("/protected")
      .set("Cookie", `${sessionCookieName}=malformed-token`)
      .expect(401);

    expect(service.authenticate).not.toHaveBeenCalled();
  });

  it("returns the generic unauthenticated response for an invalid session", async () => {
    const service = createService();

    vi.mocked(service.authenticate).mockRejectedValueOnce(new UnauthenticatedError());

    const response = await request(createTestApp(service))
      .get("/protected")
      .set("Cookie", `${sessionCookieName}=${sessionToken}`)
      .expect(401);

    expect(response.body.error).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });
  });

  it("fails closed when an authentication dependency is unavailable", async () => {
    const service = createService();

    vi.mocked(service.authenticate).mockRejectedValueOnce(
      new Error("private Redis or PostgreSQL failure"),
    );

    const response = await request(createTestApp(service))
      .get("/protected")
      .set("Cookie", `${sessionCookieName}=${sessionToken}`)
      .expect(503);

    expect(response.body.error).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "Service temporarily unavailable",
      details: [],
    });
  });
});
