import type { RequestHandler } from "express";

import { sendServiceUnavailableError, sendUnauthenticatedError } from "../http/error-handlers.js";
import { type AuthenticationService, UnauthenticatedError } from "./authentication-service.js";
import { readSessionToken } from "./session-cookie.js";

export function createRequireAuthentication(service: AuthenticationService): RequestHandler {
  return async (request, response, next) => {
    const sessionToken = readSessionToken(request.get("cookie"));

    if (sessionToken === null) {
      sendUnauthenticatedError(request, response);
      return;
    }

    try {
      request.authenticatedUser = await service.authenticate(sessionToken);

      next();
    } catch (error: unknown) {
      if (error instanceof UnauthenticatedError) {
        sendUnauthenticatedError(request, response);
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
  };
}
