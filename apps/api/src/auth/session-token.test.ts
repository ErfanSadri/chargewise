import { describe, expect, it } from "vitest";

import {
  createSessionKey,
  createSessionToken,
  isSessionToken,
  sessionCookieName,
  sessionKeyPrefix,
  sessionLifetimeSeconds,
} from "./session-token.js";

const sessionSecret = "test-session-secret-that-is-at-least-32-characters";

describe("session token utilities", () => {
  it("creates a token containing 32 random bytes", () => {
    const token = createSessionToken();

    expect(isSessionToken(token)).toBe(true);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("recognizes only the expected token format", () => {
    expect(isSessionToken("a".repeat(43))).toBe(true);

    expect(isSessionToken(undefined)).toBe(false);
    expect(isSessionToken("a".repeat(42))).toBe(false);
    expect(isSessionToken("a".repeat(44))).toBe(false);
    expect(isSessionToken(`${"a".repeat(42)}+`)).toBe(false);
  });

  it("derives the same Redis key for the same token and secret", () => {
    const token = "a".repeat(43);

    expect(createSessionKey(token, sessionSecret)).toBe(createSessionKey(token, sessionSecret));
  });

  it("derives different Redis keys when the token changes", () => {
    expect(createSessionKey("a".repeat(43), sessionSecret)).not.toBe(
      createSessionKey("b".repeat(43), sessionSecret),
    );
  });

  it("derives different Redis keys when the secret changes", () => {
    const token = "a".repeat(43);

    expect(createSessionKey(token, sessionSecret)).not.toBe(
      createSessionKey(token, "another-test-session-secret-that-is-at-least-32-characters"),
    );
  });

  it("does not place the raw token in the Redis key", () => {
    const token = "a".repeat(43);
    const key = createSessionKey(token, sessionSecret);

    expect(key).toMatch(/^auth:session:[a-f0-9]{64}$/u);
    expect(key.startsWith(sessionKeyPrefix)).toBe(true);
    expect(key).not.toContain(token);
  });

  it("defines the documented cookie name and fixed lifetime", () => {
    expect(sessionCookieName).toBe("chargewise_session");
    expect(sessionLifetimeSeconds).toBe(604_800);
  });
});
