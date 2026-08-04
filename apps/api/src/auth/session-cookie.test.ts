import { describe, expect, it } from "vitest";

import {
  createClearedSessionCookie,
  createSessionCookie,
  readSessionToken,
} from "./session-cookie.js";
import { sessionCookieName, sessionLifetimeSeconds } from "./session-token.js";

const sessionToken = "a".repeat(43);

describe("session cookie utilities", () => {
  it("creates a development session cookie with the fixed lifetime", () => {
    const cookie = createSessionCookie(sessionToken, {
      isProduction: false,
    });

    expect(cookie).toContain(`${sessionCookieName}=${sessionToken}`);
    expect(cookie).toContain(`Max-Age=${sessionLifetimeSeconds}`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("Domain=");
  });

  it("adds Secure to production session cookies", () => {
    const cookie = createSessionCookie(sessionToken, {
      isProduction: true,
    });

    expect(cookie).toContain("Secure");
  });

  it("rejects an invalid session token", () => {
    expect(() =>
      createSessionCookie("invalid-token", {
        isProduction: false,
      }),
    ).toThrowError("Session token has an invalid format");
  });

  it("reads the session token from a cookie header", () => {
    expect(
      readSessionToken(`unrelated=value; ${sessionCookieName}=${sessionToken}; preference=compact`),
    ).toBe(sessionToken);
  });

  it("returns null when the cookie is missing or malformed", () => {
    expect(readSessionToken(undefined)).toBeNull();
    expect(readSessionToken("unrelated=value")).toBeNull();
    expect(readSessionToken(`${sessionCookieName}=malformed-token`)).toBeNull();
  });

  it("creates a cleared development cookie with matching attributes", () => {
    const cookie = createClearedSessionCookie({
      isProduction: false,
    });

    expect(cookie).toContain(`${sessionCookieName}=`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("Domain=");
  });

  it("uses Secure when clearing a production cookie", () => {
    const cookie = createClearedSessionCookie({
      isProduction: true,
    });

    expect(cookie).toContain("Secure");
  });
});
