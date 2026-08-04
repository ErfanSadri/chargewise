import { createHmac, randomBytes } from "node:crypto";

export const sessionCookieName = "chargewise_session";
export const sessionKeyPrefix = "auth:session:";
export const sessionLifetimeSeconds = 7 * 24 * 60 * 60;

const sessionTokenByteLength = 32;
const encodedSessionTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

/**
 * Creates 32 cryptographically random bytes encoded using unpadded base64url.
 *
 * The raw value is sent only through the authentication cookie.
 */
export function createSessionToken(): string {
  return randomBytes(sessionTokenByteLength).toString("base64url");
}

/**
 * Checks that a value has the exact format produced by createSessionToken().
 */
export function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && encodedSessionTokenPattern.test(value);
}

/**
 * Derives the Redis key without exposing the raw browser session token.
 */
export function createSessionKey(token: string, sessionSecret: string): string {
  const digest = createHmac("sha256", sessionSecret).update(token).digest("hex");

  return `${sessionKeyPrefix}${digest}`;
}
