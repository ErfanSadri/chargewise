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

const validProductionEnvironment = {
  ...validEnvironment,
  NODE_ENV: "production",
  WEB_ORIGIN: "https://chargewise.example",
  WEB_DIST_PATH: "/app/web",
  REDIS_URL: "rediss://cache.example:6380",
  TRUST_PROXY_HOPS: "1",
};

describe("parseEnvironment", () => {
  it("accepts valid local configuration", () => {
    expect(parseEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      API_PORT: 3000,
      WEB_ORIGIN: "http://localhost:5173",
    });
  });

  it("accepts Render platform port and origin fallbacks", () => {
    expect(
      parseEnvironment({
        ...validProductionEnvironment,
        API_PORT: undefined,
        WEB_ORIGIN: undefined,
        PORT: "10000",
        RENDER_EXTERNAL_URL: "https://chargewise.onrender.com",
      }),
    ).toMatchObject({
      API_PORT: 10000,
      WEB_ORIGIN: "https://chargewise.onrender.com",
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
    expect(parseEnvironment(validProductionEnvironment)).toMatchObject({
      NODE_ENV: "production",
      WEB_ORIGIN: "https://chargewise.example",
      REDIS_URL: "rediss://cache.example:6380",
      TRUST_PROXY_HOPS: 1,
    });
  });

  it("rejects an insecure production web origin", () => {
    expect(() =>
      parseEnvironment({
        ...validProductionEnvironment,
        WEB_ORIGIN: validEnvironment.WEB_ORIGIN,
      }),
    ).toThrowError("Invalid environment configuration");
  });

  it("rejects non-TLS Redis in production", () => {
    expect(() =>
      parseEnvironment({
        ...validProductionEnvironment,
        REDIS_URL: validEnvironment.REDIS_URL,
      }),
    ).toThrowError("Invalid environment configuration");
  });

  it("requires an explicit trusted proxy hop count in production", () => {
    expect(() =>
      parseEnvironment({
        ...validProductionEnvironment,
        TRUST_PROXY_HOPS: "0",
      }),
    ).toThrowError("Invalid environment configuration");
  });
  it("requires the production web distribution path", () => {
    expect(() =>
      parseEnvironment({
        ...validProductionEnvironment,
        WEB_DIST_PATH: undefined,
      }),
    ).toThrowError("Invalid environment configuration");
  });

  it("accepts deterministic fixture providers outside production", () => {
    expect(
      parseEnvironment({
        ...validEnvironment,
        ROUTE_PROVIDER_MODE: "fixture",
      }).ROUTE_PROVIDER_MODE,
    ).toBe("fixture");
  });

  it("rejects fixture providers in production", () => {
    expect(() =>
      parseEnvironment({
        ...validProductionEnvironment,
        ROUTE_PROVIDER_MODE: "fixture",
      }),
    ).toThrowError("Invalid environment configuration");
  });
});
