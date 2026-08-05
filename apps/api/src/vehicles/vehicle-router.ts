import {
  createVehicleRequestSchema,
  updateVehicleRequestSchema,
  vehicleListResponseSchema,
  vehiclePathParametersSchema,
  vehicleResponseSchema,
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
import { type VehicleService, VehicleNotFoundError } from "./vehicle-service.js";

const emptyQuerySchema = z.object({}).strict();

const emptyRequestSchema = z
  .object({
    query: emptyQuerySchema,
    hasBody: z.literal(false),
  })
  .strict();

const createRequestSchema = z
  .object({
    body: createVehicleRequestSchema,
    query: emptyQuerySchema,
  })
  .strict();

const itemRequestSchema = z
  .object({
    params: vehiclePathParametersSchema,
    query: emptyQuerySchema,
    hasBody: z.literal(false),
  })
  .strict();

const updateRequestSchema = z
  .object({
    params: vehiclePathParametersSchema,
    body: updateVehicleRequestSchema,
    query: emptyQuerySchema,
  })
  .strict();

export interface VehicleRouterOptions extends AuthenticationOriginOptions {
  authenticationService: AuthenticationService;
  service: VehicleService;
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

function sendVehicleServiceError(error: unknown, request: Request, response: Response): void {
  if (error instanceof VehicleNotFoundError) {
    sendNotFoundError(request, response);
    return;
  }

  request.log.warn(
    {
      errorType: error instanceof Error ? error.name : typeof error,
    },
    "Vehicle dependency request failed",
  );

  sendServiceUnavailableError(request, response);
}

export function createVehicleRouter(options: VehicleRouterOptions): Router {
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
      const vehicles = await options.service.list(userId);

      response.status(200).json(
        vehicleListResponseSchema.parse({
          data: vehicles,
        }),
      );
    } catch (error: unknown) {
      sendVehicleServiceError(error, request, response);
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
      const vehicle = await options.service.create(userId, validation.data.body);

      response.status(201).json(
        vehicleResponseSchema.parse({
          data: vehicle,
        }),
      );
    } catch (error: unknown) {
      sendVehicleServiceError(error, request, response);
    }
  });

  router.get("/:vehicleId", requireAuthentication, async (request, response) => {
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
      const vehicle = await options.service.get(userId, validation.data.params.vehicleId);

      response.status(200).json(
        vehicleResponseSchema.parse({
          data: vehicle,
        }),
      );
    } catch (error: unknown) {
      sendVehicleServiceError(error, request, response);
    }
  });

  router.patch("/:vehicleId", originGuard, requireAuthentication, async (request, response) => {
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
      const vehicle = await options.service.update(
        userId,
        validation.data.params.vehicleId,
        validation.data.body,
      );

      response.status(200).json(
        vehicleResponseSchema.parse({
          data: vehicle,
        }),
      );
    } catch (error: unknown) {
      sendVehicleServiceError(error, request, response);
    }
  });

  router.delete("/:vehicleId", originGuard, requireAuthentication, async (request, response) => {
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
      await options.service.delete(userId, validation.data.params.vehicleId);

      response.status(204).end();
    } catch (error: unknown) {
      sendVehicleServiceError(error, request, response);
    }
  });

  return router;
}
