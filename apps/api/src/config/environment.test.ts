import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_PORT: "3000",
  WEB_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://test-user:test-password@localhost:5433/chargewise",
  REDIS_URL: "redis://localhost:6379",
};

describe("parseEnvironment", () => {
  it("accepts valid local configuration", () => {
    expect(parseEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      API_PORT: 3000,
      WEB_ORIGIN: "http://localhost:5173",
    });
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
});
