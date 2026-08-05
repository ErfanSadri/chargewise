import { routeSearchRequestSchema, routeSearchResponseSchema } from "@chargewise/shared";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { createRequireAuthentication } from "../auth/authentication-middleware.js";
import {
  createAuthenticationOriginGuard,
  type AuthenticationOriginOptions,
} from "../auth/authentication-origin.js";
import type { AuthenticationService } from "../auth/authentication-service.js";
import {
  sendLocationNotResolvedError,
  sendNotFoundError,
  sendProviderUnavailableError,
  sendServiceUnavailableError,
  sendValidationError,
} from "../http/error-handlers.js";
import {
  InvalidRouteSearchInputError,
  LocationNotResolvedError,
  RouteSearchPersistenceError,
  RouteSearchProviderUnavailableError,
  type RouteSearchService,
  RouteSearchVehicleNotFoundError,
} from "./route-search-service.js";

const emptyQuerySchema = z.object({}).strict();

const searchRequestSchema = z
  .object({
    body: routeSearchRequestSchema,
    query: emptyQuerySchema,
  })
  .strict();

export interface RouteSearchRouterOptions extends AuthenticationOriginOptions {
  authenticationService: AuthenticationService;
  service: RouteSearchService;
}

function getAuthenticatedUserId(request: Request): string {
  const user = request.authenticatedUser;

  if (user === undefined) {
    throw new Error("Authentication middleware did not attach a user");
  }

  return user.id;
}

function sendRouteSearchServiceError(error: unknown, request: Request, response: Response): void {
  if (error instanceof InvalidRouteSearchInputError) {
    sendValidationError(request, response);
    return;
  }

  if (error instanceof RouteSearchVehicleNotFoundError) {
    sendNotFoundError(request, response);
    return;
  }

  if (error instanceof LocationNotResolvedError) {
    sendLocationNotResolvedError(request, response, error.location);
    return;
  }

  if (error instanceof RouteSearchProviderUnavailableError) {
    request.log.warn(
      {
        errorType: error.name,
        provider: error.provider,
      },
      "Route-search provider request failed",
    );

    sendProviderUnavailableError(request, response);
    return;
  }

  if (error instanceof RouteSearchPersistenceError) {
    request.log.warn(
      {
        errorType: error.name,
      },
      "Route-search persistence request failed",
    );

    sendServiceUnavailableError(request, response);
    return;
  }

  request.log.warn(
    {
      errorType: error instanceof Error ? error.name : typeof error,
    },
    "Route-search dependency request failed",
  );

  sendServiceUnavailableError(request, response);
}

export function createRouteSearchRouter(options: RouteSearchRouterOptions): Router {
  const router = Router();
  const requireAuthentication = createRequireAuthentication(options.authenticationService);
  const originGuard = createAuthenticationOriginGuard({
    isProduction: options.isProduction,
    webOrigin: options.webOrigin,
  });

  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.post("/search", originGuard, requireAuthentication, async (request, response) => {
    const validation = searchRequestSchema.safeParse({
      body: request.body,
      query: request.query,
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    try {
      const result = await options.service.search({
        userId: getAuthenticatedUserId(request),
        ...validation.data.body,
      });

      response.status(200).json(
        routeSearchResponseSchema.parse({
          data: {
            route: result.route,
            stations: result.stations,
          },
          meta: result.meta,
        }),
      );
    } catch (error: unknown) {
      sendRouteSearchServiceError(error, request, response);
    }
  });

  return router;
}
