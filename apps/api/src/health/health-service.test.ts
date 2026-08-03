import { afterEach, describe, expect, it, vi } from "vitest";

import { checkHealth, type DependencyCheck } from "./health-service.js";

const successfulCheck: DependencyCheck = () => Promise.resolve();

afterEach(() => {
  vi.useRealTimers();
});

describe("checkHealth", () => {
  it("reports ready when both dependencies respond", async () => {
    const result = await checkHealth({
      database: successfulCheck,
      cache: successfulCheck,
    });

    expect(result).toEqual({
      statusCode: 200,
      body: {
        data: {
          process: "up",
          readiness: "ready",
          dependencies: {
            database: "up",
            cache: "up",
          },
        },
      },
      failures: [],
    });
  });

  it("reports not ready without exposing a dependency error", async () => {
    const databaseError = new Error("private database failure details");
    const failedDatabaseCheck: DependencyCheck = () => Promise.reject(databaseError);

    const result = await checkHealth({
      database: failedDatabaseCheck,
      cache: successfulCheck,
    });

    expect(result.statusCode).toBe(503);
    expect(result.body).toEqual({
      data: {
        process: "up",
        readiness: "not_ready",
        dependencies: {
          database: "down",
          cache: "up",
        },
      },
    });
    expect(result.failures).toEqual([
      {
        dependency: "database",
        error: databaseError,
      },
    ]);
    expect(JSON.stringify(result.body)).not.toContain(databaseError.message);
  });

  it("reports not ready when a dependency exceeds its deadline", async () => {
    vi.useFakeTimers();

    const neverCompletes: DependencyCheck = () =>
      new Promise<void>(() => {
        // Intentionally remains pending to verify the service deadline.
      });
    const resultPromise = checkHealth({
      database: neverCompletes,
      cache: successfulCheck,
    });

    await vi.advanceTimersByTimeAsync(3_000);

    const result = await resultPromise;

    expect(result.statusCode).toBe(503);
    expect(result.body.data).toEqual({
      process: "up",
      readiness: "not_ready",
      dependencies: {
        database: "down",
        cache: "up",
      },
    });
  });
});
