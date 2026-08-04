import {
  currentUserResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
} from "@chargewise/shared";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
  sendConflictError,
  sendRateLimitedError,
  sendServiceUnavailableError,
  sendUnauthenticatedError,
  sendValidationError,
} from "../http/error-handlers.js";
import {
  createAuthenticationOriginGuard,
  type AuthenticationOriginOptions,
} from "./authentication-origin.js";
import {
  EmailConflictError,
  type AuthenticationService,
  UnauthenticatedError,
} from "./authentication-service.js";
import {
  createClearedSessionCookie,
  createSessionCookie,
  readSessionToken,
} from "./session-cookie.js";

import type {
  AuthenticationRateLimiter,
  AuthenticationRateLimitScope,
} from "./authentication-rate-limiter.js";

import { createRequireAuthentication } from "./authentication-middleware.js";

const emptyQuerySchema = z.object({}).strict();

const registerHttpRequestSchema = z
  .object({
    body: registerRequestSchema,
    query: emptyQuerySchema,
  })
  .strict();

const loginHttpRequestSchema = z
  .object({
    body: loginRequestSchema,
    query: emptyQuerySchema,
  })
  .strict();

const emptyHttpRequestSchema = z
  .object({
    query: emptyQuerySchema,
    hasBody: z.literal(false),
  })
  .strict();

export interface AuthenticationRouterOptions extends AuthenticationOriginOptions {
  service: AuthenticationService;
  rateLimiter: AuthenticationRateLimiter;
}

function requestHasBody(
  contentLength: string | undefined,
  transferEncoding: string | undefined,
): boolean {
  return (
    (contentLength !== undefined && Number(contentLength) > 0) || transferEncoding !== undefined
  );
}

function sendAuthenticationServiceError(
  error: unknown,
  request: Request,
  response: Response,
): void {
  if (error instanceof UnauthenticatedError) {
    sendUnauthenticatedError(request, response);
    return;
  }

  if (error instanceof EmailConflictError) {
    sendConflictError(request, response);
    return;
  }

  request.log.warn(
    {
      errorType: error instanceof Error ? error.name : typeof error,
    },
    "Authentication dependency request failed",
  );

  sendServiceUnavailableError(request, response);
}

async function passesAuthenticationRateLimit(
  scope: AuthenticationRateLimitScope,
  options: AuthenticationRouterOptions,
  request: Request,
  response: Response,
): Promise<boolean> {
  try {
    const clientIp = request.ip ?? request.socket.remoteAddress;

    if (clientIp === undefined || clientIp.trim() === "") {
      throw new Error("Client IP address is unavailable");
    }

    const result = await options.rateLimiter.check(scope, clientIp);

    if (!result.allowed) {
      sendRateLimitedError(request, response, result.retryAfterSeconds);
      return false;
    }

    return true;
  } catch (error: unknown) {
    request.log.warn(
      {
        scope,
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "Authentication rate-limit check failed",
    );

    sendServiceUnavailableError(request, response);
    return false;
  }
}

export function createAuthenticationRouter(options: AuthenticationRouterOptions): Router {
  const router = Router();

  const originGuard = createAuthenticationOriginGuard({
    isProduction: options.isProduction,
    webOrigin: options.webOrigin,
  });

  const requireAuthentication = createRequireAuthentication(options.service);

  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.post("/register", originGuard, async (request, response) => {
    const validation = registerHttpRequestSchema.safeParse({
      body: request.body,
      query: request.query,
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    if (!(await passesAuthenticationRateLimit("register", options, request, response))) {
      return;
    }

    const existingSessionToken = readSessionToken(request.get("cookie"));

    try {
      const result = await options.service.register(validation.data.body, existingSessionToken);

      response.set(
        "Set-Cookie",
        createSessionCookie(result.sessionToken, {
          isProduction: options.isProduction,
        }),
      );

      response.status(201).json(
        registerResponseSchema.parse({
          data: result.user,
        }),
      );
    } catch (error: unknown) {
      sendAuthenticationServiceError(error, request, response);
    }
  });

  router.post("/login", originGuard, async (request, response) => {
    const validation = loginHttpRequestSchema.safeParse({
      body: request.body,
      query: request.query,
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    if (!(await passesAuthenticationRateLimit("login", options, request, response))) {
      return;
    }

    const existingSessionToken = readSessionToken(request.get("cookie"));

    try {
      const result = await options.service.login(validation.data.body, existingSessionToken);

      response.set(
        "Set-Cookie",
        createSessionCookie(result.sessionToken, {
          isProduction: options.isProduction,
        }),
      );

      response.status(200).json(
        loginResponseSchema.parse({
          data: result.user,
        }),
      );
    } catch (error: unknown) {
      sendAuthenticationServiceError(error, request, response);
    }
  });

  router.post("/logout", originGuard, async (request, response) => {
    const validation = emptyHttpRequestSchema.safeParse({
      query: request.query,
      hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
    });

    if (!validation.success) {
      sendValidationError(request, response);
      return;
    }

    const sessionToken = readSessionToken(request.get("cookie"));

    response.set(
      "Set-Cookie",
      createClearedSessionCookie({
        isProduction: options.isProduction,
      }),
    );

    try {
      await options.service.logout(sessionToken);
      response.status(204).end();
    } catch (error: unknown) {
      sendAuthenticationServiceError(error, request, response);
    }
  });

  router.get(
    "/me",
    async (request, response, next) => {
      const validation = emptyHttpRequestSchema.safeParse({
        query: request.query,
        hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
      });

      if (!validation.success) {
        sendValidationError(request, response);
        return;
      }

      await requireAuthentication(request, response, next);
    },
    (request, response) => {
      const user = request.authenticatedUser;

      if (user === undefined) {
        throw new Error("Authenticated user was not attached to the request");
      }

      response.status(200).json(
        currentUserResponseSchema.parse({
          data: user,
        }),
      );
    },
  );

  return router;
}
