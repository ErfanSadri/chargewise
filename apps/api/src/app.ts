import cors from "cors";
import express from "express";
import helmet from "helmet";

import {
  createAnalyticsRouter,
  type AnalyticsRouterOptions,
} from "./analytics/analytics-router.js";
import {
  createAuthenticationRouter,
  type AuthenticationRouterOptions,
} from "./auth/authentication-router.js";
import {
  createChargingSessionRouter,
  type ChargingSessionRouterOptions,
} from "./charging-sessions/charging-session-router.js";
import { createFavoriteRouter, type FavoriteRouterOptions } from "./favorites/favorite-router.js";
import { createHealthRouter } from "./health/health-router.js";
import type { HealthChecks } from "./health/health-service.js";
import { errorHandler, notFoundHandler } from "./http/error-handlers.js";
import { createHttpLogger, type AppLogger } from "./logging/logger.js";
import {
  createRouteSearchRouter,
  type RouteSearchRouterOptions,
} from "./routes/route-search-router.js";
import { createVehicleRouter, type VehicleRouterOptions } from "./vehicles/vehicle-router.js";

export interface AppOptions {
  analytics?: AnalyticsRouterOptions;
  authentication: AuthenticationRouterOptions;
  chargingSessions?: ChargingSessionRouterOptions;
  favorites?: FavoriteRouterOptions;
  routes: RouteSearchRouterOptions;
  vehicles: VehicleRouterOptions;
  healthChecks: HealthChecks;
  logger: AppLogger;
  webOrigin: string;
}

export function createApp(options: AppOptions) {
  const app = express();

  app.disable("x-powered-by");
  app.use(createHttpLogger(options.logger));
  app.use(helmet());
  app.use(
    cors({
      origin: options.webOrigin,
      credentials: true,
      exposedHeaders: ["X-Request-ID"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/v1/auth", createAuthenticationRouter(options.authentication));

  if (options.analytics !== undefined) {
    app.use("/api/v1/analytics", createAnalyticsRouter(options.analytics));
  }

  if (options.chargingSessions !== undefined) {
    app.use("/api/v1/charging-sessions", createChargingSessionRouter(options.chargingSessions));
  }

  if (options.favorites !== undefined) {
    app.use("/api/v1/favorites", createFavoriteRouter(options.favorites));
  }
  app.use("/api/v1/routes", createRouteSearchRouter(options.routes));
  app.use("/api/v1/vehicles", createVehicleRouter(options.vehicles));
  app.use("/api/v1/health", createHealthRouter(options.healthChecks));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
