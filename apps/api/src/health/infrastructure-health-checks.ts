import { Pool } from "pg";
import { createClient } from "redis";

import type { HealthChecks, HealthDependencyName } from "./health-service.js";

const healthCheckTimeoutMilliseconds = 2_000;

export interface InfrastructureHealthCheckOptions {
  databaseUrl: string;
  redisUrl: string;
  onBackgroundError?: (dependency: HealthDependencyName, error: unknown) => void;
}

export interface InfrastructureHealthChecks {
  checks: HealthChecks;
  close: () => Promise<void>;
}

export function createInfrastructureHealthChecks(
  options: InfrastructureHealthCheckOptions,
): InfrastructureHealthChecks {
  const databasePool = new Pool({
    connectionString: options.databaseUrl,
    max: 2,
    connectionTimeoutMillis: healthCheckTimeoutMilliseconds,
    query_timeout: healthCheckTimeoutMilliseconds,
  });

  databasePool.on("error", (error: Error) => {
    options.onBackgroundError?.("database", error);
  });

  async function runCacheCheck(): Promise<void> {
    const client = createClient({
      url: options.redisUrl,
      socket: {
        connectTimeout: healthCheckTimeoutMilliseconds,
        reconnectStrategy: false,
        socketTimeout: healthCheckTimeoutMilliseconds,
      },
    });

    client.on("error", (error: Error) => {
      options.onBackgroundError?.("cache", error);
    });

    try {
      await client.connect();
      await client.ping();
    } finally {
      if (client.isOpen) {
        client.destroy();
      }
    }
  }

  let cacheCheckInFlight: Promise<void> | undefined;

  async function checkCache(): Promise<void> {
    if (cacheCheckInFlight !== undefined) {
      await cacheCheckInFlight;
      return;
    }

    const currentCheck = runCacheCheck();
    cacheCheckInFlight = currentCheck;

    try {
      await currentCheck;
    } finally {
      if (cacheCheckInFlight === currentCheck) {
        cacheCheckInFlight = undefined;
      }
    }
  }

  return {
    checks: {
      database: async () => {
        await databasePool.query("SELECT PostGIS_Version()");
      },
      cache: checkCache,
    },
    close: async () => {
      await databasePool.end();
    },
  };
}
