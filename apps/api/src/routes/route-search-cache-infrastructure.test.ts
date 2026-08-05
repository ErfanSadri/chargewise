import { describe, expect, it, vi } from "vitest";

import {
  createRouteSearchCacheInfrastructure,
  type RouteSearchCacheConnectionClient,
} from "./route-search-cache-infrastructure.js";

function createClient(): RouteSearchCacheConnectionClient {
  let open = false;
  let ready = false;

  return {
    get isOpen() {
      return open;
    },

    get isReady() {
      return ready;
    },

    connect: vi.fn(async () => {
      open = true;
      ready = true;
    }),

    close: vi.fn(async () => {
      open = false;
      ready = false;
    }),

    destroy: vi.fn(() => {
      open = false;
      ready = false;
    }),

    onError: vi.fn(),

    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };
}

describe("route-search cache infrastructure", () => {
  it("connects lazily before the first cache operation", async () => {
    const client = createClient();
    const infrastructure = createRouteSearchCacheInfrastructure({
      redisUrl: "redis://localhost:6379",
      ttlSeconds: 900,
      client,
    });

    await infrastructure.cache.get("route-search:v1:key");
    await infrastructure.cache.get("route-search:v1:key");

    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("forwards background Redis errors", () => {
    const client = createClient();
    const onBackgroundError = vi.fn();

    createRouteSearchCacheInfrastructure({
      redisUrl: "redis://localhost:6379",
      ttlSeconds: 900,
      client,
      onBackgroundError,
    });

    const listener = vi.mocked(client.onError).mock.calls[0]?.[0];
    const error = new Error("private Redis failure");

    listener?.(error);

    expect(onBackgroundError).toHaveBeenCalledWith(error);
  });

  it("closes a ready connection", async () => {
    const client = createClient();
    const infrastructure = createRouteSearchCacheInfrastructure({
      redisUrl: "redis://localhost:6379",
      ttlSeconds: 900,
      client,
    });

    await infrastructure.cache.get("route-search:v1:key");
    await infrastructure.close();

    expect(client.close).toHaveBeenCalledTimes(1);
    expect(client.destroy).not.toHaveBeenCalled();
  });

  it("does nothing when the client was never opened", async () => {
    const client = createClient();
    const infrastructure = createRouteSearchCacheInfrastructure({
      redisUrl: "redis://localhost:6379",
      ttlSeconds: 900,
      client,
    });

    await infrastructure.close();

    expect(client.close).not.toHaveBeenCalled();
    expect(client.destroy).not.toHaveBeenCalled();
  });
});
