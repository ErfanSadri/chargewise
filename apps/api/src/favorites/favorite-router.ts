import {
  favoriteListResponseSchema,
  favoritePathParametersSchema,
  favoriteResponseSchema,
} from "@chargewise/shared";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { createRequireAuthentication } from "../auth/authentication-middleware.js";
import {
  createAuthenticationOriginGuard,
  type AuthenticationOriginOptions,
} from "../auth/authentication-origin.js";
import type { AuthenticationService } from "../auth/authentication-service.js";
import {
  sendNotFoundError,
  sendServiceUnavailableError,
  sendValidationError,
} from "../http/error-handlers.js";
import { FavoriteStationNotFoundError, type FavoriteService } from "./favorite-service.js";

const emptyQuerySchema = z.object({}).strict();

const emptyRequestSchema = z
  .object({
    query: emptyQuerySchema,
    hasBody: z.literal(false),
  })
  .strict();

const itemRequestSchema = z
  .object({
    params: favoritePathParametersSchema,
    query: emptyQuerySchema,
    hasBody: z.literal(false),
  })
  .strict();

export interface FavoriteRouterOptions extends AuthenticationOriginOptions {
  authenticationService: AuthenticationService;
  service: FavoriteService;
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

function sendFavoriteServiceError(error: unknown, request: Request, response: Response): void {
  if (error instanceof FavoriteStationNotFoundError) {
    sendNotFoundError(request, response);
    return;
  }

  request.log.warn(
    {
      errorType: error instanceof Error ? error.name : typeof error,
    },
    "Favorite dependency request failed",
  );

  sendServiceUnavailableError(request, response);
}

export function createFavoriteRouter(options: FavoriteRouterOptions): Router {
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

  router.get("/", requireAuthentication, async (request, response) => {
    const validation = emptyRequestSchema.safeParse({
      query: request.query,
      hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    const userId = getAuthenticatedUserId(request);

    try {
      const favorites = await options.service.list(userId);

      response.status(200).json(
        favoriteListResponseSchema.parse({
          data: favorites,
        }),
      );
    } catch (error: unknown) {
      sendFavoriteServiceError(error, request, response);
    }
  });

  router.put("/:stationId", originGuard, requireAuthentication, async (request, response) => {
    const validation = itemRequestSchema.safeParse({
      params: request.params,
      query: request.query,
      hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    const userId = getAuthenticatedUserId(request);

    try {
      const favorite = await options.service.add(userId, validation.data.params.stationId);

      response.status(200).json(
        favoriteResponseSchema.parse({
          data: favorite,
        }),
      );
    } catch (error: unknown) {
      sendFavoriteServiceError(error, request, response);
    }
  });

  router.delete("/:stationId", originGuard, requireAuthentication, async (request, response) => {
    const validation = itemRequestSchema.safeParse({
      params: request.params,
      query: request.query,
      hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    const userId = getAuthenticatedUserId(request);

    try {
      await options.service.remove(userId, validation.data.params.stationId);

      response.status(204).end();
    } catch (error: unknown) {
      sendFavoriteServiceError(error, request, response);
    }
  });

  return router;
}
