import { createClient } from "redis";

import {
  createAuthenticationRateLimiter,
  type AuthenticationRateLimiter,
  type AuthenticationRateLimitRedisClient,
} from "./authentication-rate-limiter.js";
import {
  createSessionRepository,
  type SessionRedisClient,
  type SessionRepository,
} from "./session-repository.js";

export interface SessionConnectionClient
  extends SessionRedisClient, AuthenticationRateLimitRedisClient {
  readonly isOpen: boolean;
  readonly isReady: boolean;

  connect: () => Promise<void>;
  close: () => Promise<void>;
  destroy: () => void;
  onError: (listener: (error: Error) => void) => void;
}

export interface SessionInfrastructureOptions {
  redisUrl: string;
  sessionSecret: string;
  onBackgroundError?: (error: unknown) => void;

  /**
   * Allows focused lifecycle testing without connecting to real Redis.
   */
  client?: SessionConnectionClient;
}

export interface SessionInfrastructure {
  repository: SessionRepository;
  rateLimiter: AuthenticationRateLimiter;
  connect: () => Promise<void>;
  close: () => Promise<void>;
}

function createNodeRedisSessionClient(redisUrl: string): SessionConnectionClient {
  const client = createClient({
    url: redisUrl,
  });

  return {
    get isOpen() {
      return client.isOpen;
    },

    get isReady() {
      return client.isReady;
    },

    async connect() {
      await client.connect();
    },

    async close() {
      await client.close();
    },

    destroy() {
      client.destroy();
    },

    onError(listener) {
      client.on("error", listener);
    },

    async set(key, value, options) {
      const result = await client.set(key, value, options);

      return result === "OK" ? "OK" : null;
    },

    async get(key) {
      return client.get(key);
    },

    async del(key) {
      return client.del(key);
    },

    async eval(script, options) {
      return client.eval(script, options);
    },
  };
}

export function createSessionInfrastructure(
  options: SessionInfrastructureOptions,
): SessionInfrastructure {
  const client = options.client ?? createNodeRedisSessionClient(options.redisUrl);

  client.onError((error) => {
    options.onBackgroundError?.(error);
  });

  const repository = createSessionRepository({
    client,
    sessionSecret: options.sessionSecret,
  });

  const rateLimiter = createAuthenticationRateLimiter({
    client,
    sessionSecret: options.sessionSecret,
  });

  let connectPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;

  async function connect(): Promise<void> {
    if (client.isReady) {
      return;
    }

    connectPromise ??= client.connect().finally(() => {
      connectPromise = undefined;
    });

    await connectPromise;
  }

  async function close(): Promise<void> {
    closePromise ??= (async () => {
      if (!client.isOpen) {
        return;
      }

      if (client.isReady) {
        await client.close();
        return;
      }

      client.destroy();
    })();

    await closePromise;
  }

  return {
    repository,
    rateLimiter,
    connect,
    close,
  };
}
