import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createAuthenticationOriginGuard,
  isAuthenticationOriginAllowed,
} from "./authentication-origin.js";
import { createHttpLogger, createLogger } from "../logging/logger.js";

const webOrigin = "http://localhost:5173";

function createTestApp(isProduction: boolean) {
  const app = express();

  app.use(createHttpLogger(createLogger("test")));
  app.post(
    "/auth-action",
    createAuthenticationOriginGuard({
      isProduction,
      webOrigin,
    }),
    (_request, response) => {
      response.status(204).end();
    },
  );

  return app;
}

describe("authentication origin policy", () => {
  it("requires the exact configured origin in production", async () => {
    await request(createTestApp(true)).post("/auth-action").set("Origin", webOrigin).expect(204);
  });

  it("rejects a missing origin in production", async () => {
    const response = await request(createTestApp(true)).post("/auth-action").expect(403);

    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Request is not allowed",
        details: [],
      },
      requestId: expect.stringMatching(/^req_[0-9a-f-]{36}$/u),
    });
  });

  it("rejects a different supplied origin", async () => {
    const response = await request(createTestApp(false))
      .post("/auth-action")
      .set("Origin", "https://attacker.example")
      .expect(403);

    expect(response.body.error).toEqual({
      code: "FORBIDDEN",
      message: "Request is not allowed",
      details: [],
    });
  });

  it("allows a missing origin outside production", async () => {
    await request(createTestApp(false)).post("/auth-action").expect(204);
  });

  it("allows the configured origin outside production", async () => {
    await request(createTestApp(false)).post("/auth-action").set("Origin", webOrigin).expect(204);
  });

  it("exposes the policy as a focused pure function", () => {
    expect(
      isAuthenticationOriginAllowed(undefined, {
        isProduction: false,
        webOrigin,
      }),
    ).toBe(true);

    expect(
      isAuthenticationOriginAllowed(undefined, {
        isProduction: true,
        webOrigin,
      }),
    ).toBe(false);

    expect(
      isAuthenticationOriginAllowed(webOrigin, {
        isProduction: true,
        webOrigin,
      }),
    ).toBe(true);
  });
});
