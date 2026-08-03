import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import type { DependencyCheck, HealthChecks } from "./health/health-service.js";
import { errorHandler } from "./http/error-handlers.js";
import { createHttpLogger, createLogger } from "./logging/logger.js";

const webOrigin = "http://localhost:5173";
const successfulCheck: DependencyCheck = () => Promise.resolve();
const successfulHealthChecks: HealthChecks = {
  database: successfulCheck,
  cache: successfulCheck,
};

function createTestApp(healthChecks: HealthChecks = successfulHealthChecks) {
  return createApp({
    healthChecks,
    logger: createLogger("test"),
    webOrigin,
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
    expect(response.headers["access-control-allow-origin"]).toBe(webOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-expose-headers"]).toBe("X-Request-ID");
    expect(response.headers["x-powered-by"]).toBeUndefined();
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
