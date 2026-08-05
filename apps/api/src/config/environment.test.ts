import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_PORT: "3000",
  WEB_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://test-user:test-password@localhost:5433/chargewise",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters",
};

describe("parseEnvironment", () => {
  it("accepts valid local configuration", () => {
    expect(parseEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      API_PORT: 3000,
      WEB_ORIGIN: "http://localhost:5173",
    });
  });

  it("requires a session secret", () => {
    const environmentWithoutSessionSecret = Object.fromEntries(
      Object.entries(validEnvironment).filter(([key]) => key !== "SESSION_SECRET"),
    );

    expect(() => parseEnvironment(environmentWithoutSessionSecret)).toThrowError(
      "Invalid environment configuration",
    );
  });

  it("rejects a session secret shorter than 32 characters", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        SESSION_SECRET: "too-short",
      }),
    ).toThrowError("Invalid environment configuration");
  });

  it("reports an invalid database URL as a configuration error", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: "not-a-url",
      }),
    ).toThrowError("Invalid environment configuration");
  });

  it("rejects a web URL that is not an origin", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        WEB_ORIGIN: "http://localhost:5173/application",
      }),
    ).toThrowError("Invalid environment configuration");
  });

  it("rejects a non-HTTP web origin", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        WEB_ORIGIN: "ftp://localhost:5173",
      }),
    ).toThrowError("Invalid environment configuration");
  });
  it("accepts explicit secure production transport and proxy configuration", () => {
    expect(
      parseEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        WEB_ORIGIN: "https://chargewise.example",
        REDIS_URL: "rediss://cache.example:6380",
        TRUST_PROXY_HOPS: "1",
      }),
    ).toMatchObject({
      NODE_ENV: "production",
      WEB_ORIGIN: "https://chargewise.example",
      REDIS_URL: "rediss://cache.example:6380",
      TRUST_PROXY_HOPS: 1,
    });
  });

  it("rejects an insecure production web origin", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        REDIS_URL: "rediss://cache.example:6380",
        TRUST_PROXY_HOPS: "1",
      }),
    ).toThrowError("Invalid environment configuration");
  });

  it("rejects non-TLS Redis in production", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        WEB_ORIGIN: "https://chargewise.example",
        TRUST_PROXY_HOPS: "1",
      }),
    ).toThrowError("Invalid environment configuration");
  });

  it("requires an explicit trusted proxy hop count in production", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        WEB_ORIGIN: "https://chargewise.example",
        REDIS_URL: "rediss://cache.example:6380",
      }),
    ).toThrowError("Invalid environment configuration");
  });
});
