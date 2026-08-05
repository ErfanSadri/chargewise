import type { Server } from "node:http";

import { createAnalyticsDatabase } from "./analytics/analytics-database.js";
import { createAnalyticsService } from "./analytics/analytics-service.js";
import { createApp } from "./app.js";
import { createAuthenticationDatabase } from "./auth/authentication-database.js";
import { createAuthenticationService } from "./auth/authentication-service.js";
import { argon2PasswordHasher } from "./auth/password-hasher.js";
import { createSessionInfrastructure } from "./auth/session-infrastructure.js";
import { createChargingSessionDatabase } from "./charging-sessions/charging-session-database.js";
import { createChargingSessionService } from "./charging-sessions/charging-session-service.js";
import { loadLocalEnvironment, parseEnvironment } from "./config/environment.js";
import { createFavoriteDatabase } from "./favorites/favorite-database.js";
import { createFavoriteService } from "./favorites/favorite-service.js";
import { createInfrastructureHealthChecks } from "./health/infrastructure-health-checks.js";
import { createLogger } from "./logging/logger.js";
import {
  createFixtureRouteProviders,
  NlrStationProvider,
  OpenRouteServiceGeocodingProvider,
  OpenRouteServiceRoutingProvider,
} from "./providers/index.js";
import { createRouteSearchCacheInfrastructure } from "./routes/route-search-cache-infrastructure.js";
import { createRouteSearchDatabase } from "./routes/route-search-database.js";
import { createRouteSearchService } from "./routes/route-search-service.js";
import { createVehicleDatabase } from "./vehicles/vehicle-database.js";
import { createVehicleService } from "./vehicles/vehicle-service.js";

const shutdownTimeoutMilliseconds = 5_000;

loadLocalEnvironment();

const environment = parseEnvironment();
const logger = createLogger(environment.NODE_ENV);

function requireProviderCredential(value: string | undefined, environmentName: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${environmentName} is required to start route search`);
  }

  return value.trim();
}

const routeProviders =
  environment.ROUTE_PROVIDER_MODE === "fixture"
    ? createFixtureRouteProviders()
    : {
        geocodingProvider: new OpenRouteServiceGeocodingProvider(
          requireProviderCredential(
            environment.OPENROUTESERVICE_API_KEY,
            "OPENROUTESERVICE_API_KEY",
          ),
        ),
        routingProvider: new OpenRouteServiceRoutingProvider(
          requireProviderCredential(
            environment.OPENROUTESERVICE_API_KEY,
            "OPENROUTESERVICE_API_KEY",
          ),
        ),
        stationProvider: new NlrStationProvider(
          requireProviderCredential(environment.NLR_API_KEY, "NLR_API_KEY"),
        ),
      };

const infrastructureHealthChecks = createInfrastructureHealthChecks({
  databaseUrl: environment.DATABASE_URL,
  redisUrl: environment.REDIS_URL,
  onBackgroundError: (dependency, error) => {
    logger.warn(
      {
        dependency,
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "Health dependency client error",
    );
  },
});

const sessionInfrastructure = createSessionInfrastructure({
  redisUrl: environment.REDIS_URL,
  sessionSecret: environment.SESSION_SECRET,
  onBackgroundError: (error) => {
    logger.warn(
      {
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "Session Redis client error",
    );
  },
});

const routeSearchCacheInfrastructure = createRouteSearchCacheInfrastructure({
  redisUrl: environment.REDIS_URL,
  ttlSeconds: environment.ROUTE_SEARCH_CACHE_TTL_SECONDS,
  onBackgroundError: (error) => {
    logger.warn(
      {
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "Route-search Redis client error",
    );
  },
});

const authenticationDatabase = createAuthenticationDatabase(environment.DATABASE_URL);

const authenticationService = createAuthenticationService({
  users: authenticationDatabase.users,
  sessions: sessionInfrastructure.repository,
  passwordHasher: argon2PasswordHasher,
  runUserTransaction: authenticationDatabase.runUserTransaction,
});

const vehicleDatabase = createVehicleDatabase(environment.DATABASE_URL);

const vehicleService = createVehicleService({
  vehicles: vehicleDatabase.vehicles,
  runVehicleTransaction: vehicleDatabase.runVehicleTransaction,
});

const favoriteDatabase = createFavoriteDatabase(environment.DATABASE_URL);

const favoriteService = createFavoriteService({
  favorites: favoriteDatabase.favorites,
});

const chargingSessionDatabase = createChargingSessionDatabase(environment.DATABASE_URL);

const chargingSessionService = createChargingSessionService({
  sessions: chargingSessionDatabase.sessions,
  vehicles: vehicleDatabase.vehicles,
});

const analyticsDatabase = createAnalyticsDatabase(environment.DATABASE_URL);

const analyticsService = createAnalyticsService({
  analytics: analyticsDatabase.analytics,
});

const routeSearchDatabase = createRouteSearchDatabase(environment.DATABASE_URL);

const routeSearchService = createRouteSearchService({
  vehicles: vehicleDatabase.vehicles,
  geocodingProvider: routeProviders.geocodingProvider,
  routingProvider: routeProviders.routingProvider,
  stationProvider: routeProviders.stationProvider,
  stationRepository: routeSearchDatabase.stations,
  favorites: favoriteDatabase.favorites,
  cache: routeSearchCacheInfrastructure.cache,
  onCacheError: (operation, error) => {
    logger.warn(
      {
        operation,
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "Route-search cache operation failed",
    );
  },
  onPerformance: (measurement) => {
    logger.info(
      {
        cacheStatus: measurement.cacheStatus,
        durationMs: Number(measurement.durationMs.toFixed(3)),
        discoveredStationCount: measurement.discoveredStationCount,
        returnedStationCount: measurement.returnedStationCount,
      },
      "Route search completed",
    );
  },
});

const app = createApp({
  analytics: {
    service: analyticsService,
    authenticationService,
  },
  authentication: {
    service: authenticationService,
    rateLimiter: sessionInfrastructure.rateLimiter,
    isProduction: environment.NODE_ENV === "production",
    webOrigin: environment.WEB_ORIGIN,
  },
  chargingSessions: {
    service: chargingSessionService,
    authenticationService,
    isProduction: environment.NODE_ENV === "production",
    webOrigin: environment.WEB_ORIGIN,
  },
  favorites: {
    service: favoriteService,
    authenticationService,
    isProduction: environment.NODE_ENV === "production",
    webOrigin: environment.WEB_ORIGIN,
  },
  routes: {
    service: routeSearchService,
    authenticationService,
    isProduction: environment.NODE_ENV === "production",
    webOrigin: environment.WEB_ORIGIN,
  },
  healthChecks: infrastructureHealthChecks.checks,
  logger,
  trustProxyHops: environment.TRUST_PROXY_HOPS,
  webOrigin: environment.WEB_ORIGIN,
  vehicles: {
    service: vehicleService,
    authenticationService,
    isProduction: environment.NODE_ENV === "production",
    webOrigin: environment.WEB_ORIGIN,
  },
});

let server: Server | undefined;
let infrastructureClosePromise: Promise<void> | undefined;

function closeInfrastructure(): Promise<void> {
  infrastructureClosePromise ??= Promise.all([
    sessionInfrastructure.close(),
    routeSearchCacheInfrastructure.close(),
    authenticationDatabase.close(),
    vehicleDatabase.close(),
    favoriteDatabase.close(),
    chargingSessionDatabase.close(),
    analyticsDatabase.close(),
    routeSearchDatabase.close(),
    infrastructureHealthChecks.close(),
  ]).then(() => undefined);

  return infrastructureClosePromise;
}

async function handleServerError(error: Error): Promise<void> {
  logger.fatal(
    {
      errorType: error.name,
    },
    "ChargeWise API failed to start",
  );

  process.exitCode = 1;

  try {
    await closeInfrastructure();
  } catch (closeError: unknown) {
    logger.error(
      {
        errorType: closeError instanceof Error ? closeError.name : typeof closeError,
      },
      "ChargeWise infrastructure cleanup failed",
    );
  }
}

async function closeHttpServer(): Promise<void> {
  const activeServer = server;

  if (activeServer === undefined) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let hasSettled = false;

    const settle = (error?: Error): void => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      clearTimeout(timeout);

      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    };

    const timeout = setTimeout(() => {
      logger.warn(
        { timeoutMilliseconds: shutdownTimeoutMilliseconds },
        "ChargeWise API shutdown timed out; closing active connections",
      );

      activeServer.closeAllConnections();
      settle(new Error("HTTP server shutdown timed out"));
    }, shutdownTimeoutMilliseconds);

    timeout.unref();

    activeServer.close((error) => {
      settle(error);
    });
  });
}

let isShuttingDown = false;

async function shutDown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  process.off("SIGINT", handleSigint);
  process.off("SIGTERM", handleSigterm);

  logger.info({ signal }, "ChargeWise API shutting down");

  let shutdownFailed = false;

  try {
    await closeHttpServer();
  } catch (error: unknown) {
    shutdownFailed = true;

    logger.error(
      {
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "ChargeWise HTTP server shutdown failed",
    );
  }

  try {
    await closeInfrastructure();
  } catch (error: unknown) {
    shutdownFailed = true;

    logger.error(
      {
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "ChargeWise infrastructure shutdown failed",
    );
  }

  if (shutdownFailed) {
    process.exitCode = 1;
    return;
  }

  logger.info("ChargeWise API stopped");
}

function handleSigint(): void {
  void shutDown("SIGINT");
}

function handleSigterm(): void {
  void shutDown("SIGTERM");
}

process.once("SIGINT", handleSigint);
process.once("SIGTERM", handleSigterm);

async function startServer(): Promise<void> {
  try {
    await sessionInfrastructure.connect();
  } catch (error: unknown) {
    logger.fatal(
      {
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "ChargeWise session infrastructure failed to start",
    );

    process.exitCode = 1;

    try {
      await closeInfrastructure();
    } catch (closeError: unknown) {
      logger.error(
        {
          errorType: closeError instanceof Error ? closeError.name : typeof closeError,
        },
        "ChargeWise infrastructure cleanup failed",
      );
    }

    return;
  }

  server = app.listen(environment.API_PORT, () => {
    logger.info(
      {
        port: environment.API_PORT,
      },
      "ChargeWise API started",
    );
  });

  server.on("error", (error: Error) => {
    void handleServerError(error);
  });
}

void startServer();
