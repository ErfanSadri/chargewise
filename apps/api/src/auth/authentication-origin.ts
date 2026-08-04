import type { RequestHandler } from "express";

import { sendForbiddenError } from "../http/error-handlers.js";

export interface AuthenticationOriginOptions {
  isProduction: boolean;
  webOrigin: string;
}

export function isAuthenticationOriginAllowed(
  origin: string | undefined,
  options: AuthenticationOriginOptions,
): boolean {
  if (origin === undefined) {
    return !options.isProduction;
  }

  return origin === options.webOrigin;
}

export function createAuthenticationOriginGuard(
  options: AuthenticationOriginOptions,
): RequestHandler {
  return (request, response, next) => {
    const origin = request.get("origin");

    if (!isAuthenticationOriginAllowed(origin, options)) {
      sendForbiddenError(request, response);
      return;
    }

    next();
  };
}
