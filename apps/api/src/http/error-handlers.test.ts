import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  sendConflictError,
  sendForbiddenError,
  sendRateLimitedError,
  sendServiceUnavailableError,
  sendUnauthenticatedError,
} from "./error-handlers.js";
import { createHttpLogger, createLogger } from "../logging/logger.js";

function createTestApp() {
  const app = express();

  app.use(createHttpLogger(createLogger("test")));

  app.get("/unauthenticated", (request, response) => {
    sendUnauthenticatedError(request, response);
  });

  app.get("/forbidden", (request, response) => {
    sendForbiddenError(request, response);
  });

  app.get("/conflict", (request, response) => {
    sendConflictError(request, response);
  });

  app.get("/rate-limited", (request, response) => {
    sendRateLimitedError(request, response, 900);
  });

  app.get("/service-unavailable", (request, response) => {
    sendServiceUnavailableError(request, response);
  });

  return app;
}

function expectErrorResponse(
  response: request.Response,
  expectedCode: string,
  expectedMessage: string,
): void {
  expect(response.body).toEqual({
    error: {
      code: expectedCode,
      message: expectedMessage,
      details: [],
    },
    requestId: expect.stringMatching(/^req_[0-9a-f-]{36}$/u),
  });
}

describe("authentication HTTP errors", () => {
  it("returns a generic unauthenticated response", async () => {
    const response = await request(createTestApp()).get("/unauthenticated").expect(401);

    expectErrorResponse(response, "UNAUTHENTICATED", "Authentication required");
  });

  it("returns a safe forbidden response", async () => {
    const response = await request(createTestApp()).get("/forbidden").expect(403);

    expectErrorResponse(response, "FORBIDDEN", "Request is not allowed");
  });

  it("returns the account conflict response", async () => {
    const response = await request(createTestApp()).get("/conflict").expect(409);

    expectErrorResponse(response, "CONFLICT", "An account with this email already exists");
  });

  it("returns a rate-limit response with Retry-After", async () => {
    const response = await request(createTestApp()).get("/rate-limited").expect(429);

    expect(response.headers["retry-after"]).toBe("900");

    expectErrorResponse(response, "RATE_LIMITED", "Too many requests");
  });

  it("returns a safe dependency-failure response", async () => {
    const response = await request(createTestApp()).get("/service-unavailable").expect(503);

    expectErrorResponse(response, "SERVICE_UNAVAILABLE", "Service temporarily unavailable");
  });
});
