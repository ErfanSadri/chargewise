import {
  analyticsDateRangeQuerySchema,
  analyticsNetworksResponseSchema,
  analyticsStationsResponseSchema,
  analyticsSummaryResponseSchema,
} from "@chargewise/shared";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { createRequireAuthentication } from "../auth/authentication-middleware.js";
import type { AuthenticationService } from "../auth/authentication-service.js";
import { sendServiceUnavailableError, sendValidationError } from "../http/error-handlers.js";
import { InvalidAnalyticsQueryError, type AnalyticsService } from "./analytics-service.js";

const analyticsRequestSchema = z
  .object({
    query: analyticsDateRangeQuerySchema,
    hasBody: z.literal(false),
  })
  .strict();

export interface AnalyticsRouterOptions {
  authenticationService: AuthenticationService;
  service: AnalyticsService;
}

function requestHasBody(
  contentLength: string | undefined,
  transferEncoding: string | undefined,
): boolean {
  return (
    (contentLength !== undefined && Number(contentLength) > 0) || transferEncoding !== undefined
  );
}

function getAuthenticatedUserId(request: Request): string {
  const user = request.authenticatedUser;

  if (user === undefined) {
    throw new Error("Authentication middleware did not attach a user");
  }

  return user.id;
}

function sendAnalyticsServiceError(error: unknown, request: Request, response: Response): void {
  if (error instanceof InvalidAnalyticsQueryError) {
    sendValidationError(request, response);
    return;
  }

  request.log.warn(
    {
      errorType: error instanceof Error ? error.name : typeof error,
    },
    "Analytics dependency request failed",
  );

  sendServiceUnavailableError(request, response);
}

export function createAnalyticsRouter(options: AnalyticsRouterOptions): Router {
  const router = Router();
  const requireAuthentication = createRequireAuthentication(options.authenticationService);

  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.get("/summary", requireAuthentication, async (request, response) => {
    const validation = analyticsRequestSchema.safeParse({
      query: request.query,
      hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    try {
      const summary = await options.service.summary(
        getAuthenticatedUserId(request),
        validation.data.query,
      );

      response.status(200).json(
        analyticsSummaryResponseSchema.parse({
          data: summary,
        }),
      );
    } catch (error: unknown) {
      sendAnalyticsServiceError(error, request, response);
    }
  });

  router.get("/networks", requireAuthentication, async (request, response) => {
    const validation = analyticsRequestSchema.safeParse({
      query: request.query,
      hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    try {
      const networks = await options.service.networks(
        getAuthenticatedUserId(request),
        validation.data.query,
      );

      response.status(200).json(
        analyticsNetworksResponseSchema.parse({
          data: networks,
        }),
      );
    } catch (error: unknown) {
      sendAnalyticsServiceError(error, request, response);
    }
  });

  router.get("/stations", requireAuthentication, async (request, response) => {
    const validation = analyticsRequestSchema.safeParse({
      query: request.query,
      hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    try {
      const stations = await options.service.stations(
        getAuthenticatedUserId(request),
        validation.data.query,
      );

      response.status(200).json(
        analyticsStationsResponseSchema.parse({
          data: stations,
        }),
      );
    } catch (error: unknown) {
      sendAnalyticsServiceError(error, request, response);
    }
  });

  return router;
}
