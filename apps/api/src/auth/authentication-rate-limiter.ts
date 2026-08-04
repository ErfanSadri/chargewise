import { createHmac } from "node:crypto";

export type AuthenticationRateLimitScope = "register" | "login";

export const authenticationRateLimitWindowSeconds = 15 * 60;

export const authenticationRateLimitMaximumAttempts = {
  register: 5,
  login: 10,
} as const satisfies Record<AuthenticationRateLimitScope, number>;

const rateLimitKeyPrefix = "auth:rate-limit:";

const incrementRateLimitScript = `
local count = redis.call("INCR", KEYS[1])

if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end

local ttl = redis.call("TTL", KEYS[1])

return { count, ttl }
`;

export interface AuthenticationRateLimitRedisClient {
  eval(
    script: string,
    options: {
      keys: string[];
      arguments: string[];
    },
  ): Promise<unknown>;
}

export type AuthenticationRateLimitResult =
  | {
      allowed: true;
      remainingAttempts: number;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

export interface AuthenticationRateLimiter {
  check: (
    scope: AuthenticationRateLimitScope,
    clientIp: string,
  ) => Promise<AuthenticationRateLimitResult>;
}

export interface AuthenticationRateLimiterOptions {
  client: AuthenticationRateLimitRedisClient;
  sessionSecret: string;
}

function createRateLimitKey(
  scope: AuthenticationRateLimitScope,
  clientIp: string,
  sessionSecret: string,
): string {
  const digest = createHmac("sha256", sessionSecret)
    .update(scope)
    .update("\0")
    .update(clientIp)
    .digest("hex");

  return `${rateLimitKeyPrefix}${scope}:${digest}`;
}

function parseRedisResult(result: unknown): {
  attemptCount: number;
  ttlSeconds: number;
} {
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error("Redis returned an invalid rate-limit result");
  }

  const [attemptCount, ttlSeconds] = result;

  if (
    typeof attemptCount !== "number" ||
    !Number.isSafeInteger(attemptCount) ||
    attemptCount < 1 ||
    typeof ttlSeconds !== "number" ||
    !Number.isSafeInteger(ttlSeconds)
  ) {
    throw new Error("Redis returned an invalid rate-limit result");
  }

  return {
    attemptCount,
    ttlSeconds,
  };
}

export function createAuthenticationRateLimiter(
  options: AuthenticationRateLimiterOptions,
): AuthenticationRateLimiter {
  return {
    async check(scope, clientIp) {
      if (clientIp.trim() === "") {
        throw new TypeError("A client IP address is required");
      }

      const maximumAttempts = authenticationRateLimitMaximumAttempts[scope];

      const key = createRateLimitKey(scope, clientIp, options.sessionSecret);

      const redisResult = await options.client.eval(incrementRateLimitScript, {
        keys: [key],
        arguments: [String(authenticationRateLimitWindowSeconds)],
      });

      const { attemptCount, ttlSeconds } = parseRedisResult(redisResult);

      if (attemptCount <= maximumAttempts) {
        return {
          allowed: true,
          remainingAttempts: maximumAttempts - attemptCount,
        };
      }

      return {
        allowed: false,
        retryAfterSeconds: Math.max(ttlSeconds, 1),
      };
    },
  };
}
