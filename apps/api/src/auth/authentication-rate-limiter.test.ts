import { describe, expect, it, vi } from "vitest";

import {
  authenticationRateLimitMaximumAttempts,
  authenticationRateLimitWindowSeconds,
  createAuthenticationRateLimiter,
  type AuthenticationRateLimitRedisClient,
} from "./authentication-rate-limiter.js";

const sessionSecret = "test-session-secret-that-is-at-least-32-characters";
const clientIp = "203.0.113.42";

function createRedisClient(
  result: unknown = [1, authenticationRateLimitWindowSeconds],
): AuthenticationRateLimitRedisClient {
  return {
    eval: vi.fn(async () => result),
  };
}

describe("authentication rate limiter", () => {
  it("allows registration attempts within the five-attempt limit", async () => {
    const client = createRedisClient([3, 840]);
    const limiter = createAuthenticationRateLimiter({
      client,
      sessionSecret,
    });

    await expect(limiter.check("register", clientIp)).resolves.toEqual({
      allowed: true,
      remainingAttempts: 2,
    });

    expect(authenticationRateLimitMaximumAttempts.register).toBe(5);
  });

  it("allows login attempts within the ten-attempt limit", async () => {
    const client = createRedisClient([7, 700]);
    const limiter = createAuthenticationRateLimiter({
      client,
      sessionSecret,
    });

    await expect(limiter.check("login", clientIp)).resolves.toEqual({
      allowed: true,
      remainingAttempts: 3,
    });

    expect(authenticationRateLimitMaximumAttempts.login).toBe(10);
  });

  it("blocks an attempt beyond the configured limit", async () => {
    const client = createRedisClient([6, 725]);
    const limiter = createAuthenticationRateLimiter({
      client,
      sessionSecret,
    });

    await expect(limiter.check("register", clientIp)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 725,
    });
  });

  it("never returns a Retry-After value below one second", async () => {
    const client = createRedisClient([11, -1]);
    const limiter = createAuthenticationRateLimiter({
      client,
      sessionSecret,
    });

    await expect(limiter.check("login", clientIp)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it("uses an HMAC-derived key instead of storing the raw IP", async () => {
    const client = createRedisClient();
    const limiter = createAuthenticationRateLimiter({
      client,
      sessionSecret,
    });

    await limiter.check("register", clientIp);

    const evalMock = vi.mocked(client.eval);
    const options = evalMock.mock.calls[0]?.[1];
    const key = options?.keys[0];

    expect(key).toMatch(/^auth:rate-limit:register:[a-f0-9]{64}$/u);
    expect(key).not.toContain(clientIp);
    expect(options?.arguments).toEqual([String(authenticationRateLimitWindowSeconds)]);
  });

  it("uses distinct counters for registration and login", async () => {
    const client = createRedisClient();
    const limiter = createAuthenticationRateLimiter({
      client,
      sessionSecret,
    });

    await limiter.check("register", clientIp);
    await limiter.check("login", clientIp);

    const evalMock = vi.mocked(client.eval);
    const registerKey = evalMock.mock.calls[0]?.[1].keys[0];
    const loginKey = evalMock.mock.calls[1]?.[1].keys[0];

    expect(registerKey).not.toBe(loginKey);
  });

  it("rejects a missing client IP before querying Redis", async () => {
    const client = createRedisClient();
    const limiter = createAuthenticationRateLimiter({
      client,
      sessionSecret,
    });

    await expect(limiter.check("register", "   ")).rejects.toThrowError(
      "A client IP address is required",
    );

    expect(client.eval).not.toHaveBeenCalled();
  });

  it("rejects an invalid Redis script response", async () => {
    const client = createRedisClient(["unexpected"]);
    const limiter = createAuthenticationRateLimiter({
      client,
      sessionSecret,
    });

    await expect(limiter.check("register", clientIp)).rejects.toThrowError(
      "Redis returned an invalid rate-limit result",
    );
  });
});
