import {
  chargingSessionListQuerySchema,
  chargingSessionListResponseSchema,
  chargingSessionPathParametersSchema,
  chargingSessionResponseSchema,
  createChargingSessionRequestSchema,
  updateChargingSessionRequestSchema,
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
import {
  ChargingSessionNotFoundError,
  ChargingSessionStationNotFoundError,
  ChargingSessionVehicleNotFoundError,
  InvalidChargingSessionInputError,
  type ChargingSessionService,
} from "./charging-session-service.js";

const emptyQuerySchema = z.object({}).strict();

const listRequestSchema = z
  .object({
    query: chargingSessionListQuerySchema,
    hasBody: z.literal(false),
  })
  .strict();

const createRequestSchema = z
  .object({
    body: createChargingSessionRequestSchema,
    query: emptyQuerySchema,
  })
  .strict();

const itemRequestSchema = z
  .object({
    params: chargingSessionPathParametersSchema,
    query: emptyQuerySchema,
    hasBody: z.literal(false),
  })
  .strict();

const updateRequestSchema = z
  .object({
    params: chargingSessionPathParametersSchema,
    body: updateChargingSessionRequestSchema,
    query: emptyQuerySchema,
  })
  .strict();

export interface ChargingSessionRouterOptions extends AuthenticationOriginOptions {
  authenticationService: AuthenticationService;
  service: ChargingSessionService;
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

function sendChargingSessionServiceError(
  error: unknown,
  request: Request,
  response: Response,
): void {
  if (error instanceof InvalidChargingSessionInputError) {
    sendValidationError(request, response);
    return;
  }

  if (
    error instanceof ChargingSessionNotFoundError ||
    error instanceof ChargingSessionVehicleNotFoundError ||
    error instanceof ChargingSessionStationNotFoundError
  ) {
    sendNotFoundError(request, response);
    return;
  }

  request.log.warn(
    {
      errorType: error instanceof Error ? error.name : typeof error,
    },
    "Charging-session dependency request failed",
  );

  sendServiceUnavailableError(request, response);
}

export function createChargingSessionRouter(options: ChargingSessionRouterOptions): Router {
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
    const validation = listRequestSchema.safeParse({
      query: request.query,
      hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    const userId = getAuthenticatedUserId(request);

    try {
      const result = await options.service.list(userId, validation.data.query);

      response.status(200).json(
        chargingSessionListResponseSchema.parse({
          data: result.sessions,
          meta: {
            nextCursor: result.nextCursor,
          },
        }),
      );
    } catch (error: unknown) {
      sendChargingSessionServiceError(error, request, response);
    }
  });

  router.post("/", originGuard, requireAuthentication, async (request, response) => {
    const validation = createRequestSchema.safeParse({
      body: request.body,
      query: request.query,
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    const userId = getAuthenticatedUserId(request);

    try {
      const session = await options.service.create(userId, validation.data.body);

      response.status(201).json(
        chargingSessionResponseSchema.parse({
          data: session,
        }),
      );
    } catch (error: unknown) {
      sendChargingSessionServiceError(error, request, response);
    }
  });

  router.get("/:chargingSessionId", requireAuthentication, async (request, response) => {
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
      const session = await options.service.get(userId, validation.data.params.chargingSessionId);

      response.status(200).json(
        chargingSessionResponseSchema.parse({
          data: session,
        }),
      );
    } catch (error: unknown) {
      sendChargingSessionServiceError(error, request, response);
    }
  });

  router.patch(
    "/:chargingSessionId",
    originGuard,
    requireAuthentication,
    async (request, response) => {
      const validation = updateRequestSchema.safeParse({
        params: request.params,
        body: request.body,
        query: request.query,
      });

      if (!validation.success) {
        sendValidationError(request, response);
        return;
      }

      const userId = getAuthenticatedUserId(request);

      try {
        const session = await options.service.update(
          userId,
          validation.data.params.chargingSessionId,
          validation.data.body,
        );

        response.status(200).json(
          chargingSessionResponseSchema.parse({
            data: session,
          }),
        );
      } catch (error: unknown) {
        sendChargingSessionServiceError(error, request, response);
      }
    },
  );

  router.delete(
    "/:chargingSessionId",
    originGuard,
    requireAuthentication,
    async (request, response) => {
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
        await options.service.delete(userId, validation.data.params.chargingSessionId);

        response.status(204).end();
      } catch (error: unknown) {
        sendChargingSessionServiceError(error, request, response);
      }
    },
  );

  return router;
}
