import cors from "cors";
import express from "express";
import helmet from "helmet";

import {
  createAuthenticationRouter,
  type AuthenticationRouterOptions,
} from "./auth/authentication-router.js";
import { createHealthRouter } from "./health/health-router.js";
import type { HealthChecks } from "./health/health-service.js";
import { errorHandler, notFoundHandler } from "./http/error-handlers.js";
import { createHttpLogger, type AppLogger } from "./logging/logger.js";

export interface AppOptions {
  authentication: AuthenticationRouterOptions;
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
  app.use("/api/v1/health", createHealthRouter(options.healthChecks));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
