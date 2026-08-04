import { parseCookie, stringifySetCookie } from "cookie";

import { isSessionToken, sessionCookieName, sessionLifetimeSeconds } from "./session-token.js";

export interface SessionCookieOptions {
  isProduction: boolean;
}

function createBaseCookieOptions(options: SessionCookieOptions) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options.isProduction,
    path: "/",
  };
}

export function createSessionCookie(token: string, options: SessionCookieOptions): string {
  if (!isSessionToken(token)) {
    throw new TypeError("Session token has an invalid format");
  }

  return stringifySetCookie({
    name: sessionCookieName,
    value: token,
    ...createBaseCookieOptions(options),
    maxAge: sessionLifetimeSeconds,
  });
}

export function createClearedSessionCookie(options: SessionCookieOptions): string {
  return stringifySetCookie({
    name: sessionCookieName,
    value: "",
    ...createBaseCookieOptions(options),
    maxAge: 0,
    expires: new Date(0),
  });
}

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined) {
    return null;
  }

  const cookies = parseCookie(cookieHeader);
  const token = cookies[sessionCookieName];

  return isSessionToken(token) ? token : null;
}
