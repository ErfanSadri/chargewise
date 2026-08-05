import { createClient } from "redis";

import { createRouteSearchCache, type RouteSearchCacheRedisClient } from "./route-search-cache.js";
import type { RouteSearchCache } from "./route-search-service.js";

export interface RouteSearchCacheConnectionClient extends RouteSearchCacheRedisClient {
  readonly isOpen: boolean;
  readonly isReady: boolean;

  connect: () => Promise<void>;
  close: () => Promise<void>;
  destroy: () => void;
  onError: (listener: (error: Error) => void) => void;
}

export interface RouteSearchCacheInfrastructureOptions {
  redisUrl: string;
  ttlSeconds: number;
  onBackgroundError?: (error: unknown) => void;
  client?: RouteSearchCacheConnectionClient;
}

export interface RouteSearchCacheInfrastructure {
  cache: RouteSearchCache;
  close: () => Promise<void>;
}

function createNodeRedisClient(redisUrl: string): RouteSearchCacheConnectionClient {
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

    async get(key) {
      return client.get(key);
    },

    async set(key, value, options) {
      return client.set(key, value, options);
    },

    async del(key) {
      return client.del(key);
    },
  };
}

export function createRouteSearchCacheInfrastructure(
  options: RouteSearchCacheInfrastructureOptions,
): RouteSearchCacheInfrastructure {
  const client = options.client ?? createNodeRedisClient(options.redisUrl);

  client.onError((error) => {
    options.onBackgroundError?.(error);
  });

  const repository = createRouteSearchCache({
    client,
    ttlSeconds: options.ttlSeconds,
  });

  let connectPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;

  async function ensureConnected(): Promise<void> {
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
    cache: {
      async get(key) {
        await ensureConnected();
        return repository.get(key);
      },

      async set(key, value) {
        await ensureConnected();
        await repository.set(key, value);
      },
    },
    close,
  };
}
