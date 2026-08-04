import { describe, expect, it, vi } from "vitest";

import {
  createSessionInfrastructure,
  type SessionConnectionClient,
} from "./session-infrastructure.js";

const redisUrl = "redis://localhost:6379";
const sessionSecret = "test-session-secret-that-is-at-least-32-characters";

function createFakeClient() {
  let isOpen = false;
  let isReady = false;
  let errorListener: ((error: Error) => void) | undefined;

  const client: SessionConnectionClient = {
    get isOpen() {
      return isOpen;
    },

    get isReady() {
      return isReady;
    },

    connect: vi.fn(async () => {
      isOpen = true;
      isReady = true;
    }),

    close: vi.fn(async () => {
      isOpen = false;
      isReady = false;
    }),

    destroy: vi.fn(() => {
      isOpen = false;
      isReady = false;
    }),

    onError: vi.fn((listener) => {
      errorListener = listener;
    }),

    set: vi.fn(async () => "OK" as const),
    get: vi.fn(async () => null),
    del: vi.fn(async () => 1),
    eval: vi.fn(async () => [1, 900]),
  };

  return {
    client,

    setConnectionState(open: boolean, ready: boolean) {
      isOpen = open;
      isReady = ready;
    },

    emitError(error: Error) {
      errorListener?.(error);
    },
  };
}

describe("session infrastructure", () => {
  it("connects the long-lived Redis client only when needed", async () => {
    const fake = createFakeClient();
    const infrastructure = createSessionInfrastructure({
      redisUrl,
      sessionSecret,
      client: fake.client,
    });

    await infrastructure.connect();
    await infrastructure.connect();

    expect(fake.client.connect).toHaveBeenCalledTimes(1);
  });

  it("forwards Redis background errors without exposing them itself", () => {
    const fake = createFakeClient();
    const onBackgroundError = vi.fn();

    createSessionInfrastructure({
      redisUrl,
      sessionSecret,
      client: fake.client,
      onBackgroundError,
    });

    const error = new Error("private Redis failure");

    fake.emitError(error);

    expect(onBackgroundError).toHaveBeenCalledWith(error);
  });

  it("gracefully closes a ready Redis connection", async () => {
    const fake = createFakeClient();
    fake.setConnectionState(true, true);

    const infrastructure = createSessionInfrastructure({
      redisUrl,
      sessionSecret,
      client: fake.client,
    });

    await infrastructure.close();

    expect(fake.client.close).toHaveBeenCalledTimes(1);
    expect(fake.client.destroy).not.toHaveBeenCalled();
  });

  it("destroys an open connection that is not ready", async () => {
    const fake = createFakeClient();
    fake.setConnectionState(true, false);

    const infrastructure = createSessionInfrastructure({
      redisUrl,
      sessionSecret,
      client: fake.client,
    });

    await infrastructure.close();

    expect(fake.client.destroy).toHaveBeenCalledTimes(1);
    expect(fake.client.close).not.toHaveBeenCalled();
  });

  it("does nothing when the Redis connection is already closed", async () => {
    const fake = createFakeClient();

    const infrastructure = createSessionInfrastructure({
      redisUrl,
      sessionSecret,
      client: fake.client,
    });

    await infrastructure.close();

    expect(fake.client.close).not.toHaveBeenCalled();
    expect(fake.client.destroy).not.toHaveBeenCalled();
  });
  it("exposes a rate limiter backed by the long-lived Redis client", async () => {
    const fake = createFakeClient();
    const infrastructure = createSessionInfrastructure({
      redisUrl,
      sessionSecret,
      client: fake.client,
    });

    await expect(infrastructure.rateLimiter.check("register", "203.0.113.42")).resolves.toEqual({
      allowed: true,
      remainingAttempts: 4,
    });

    expect(fake.client.eval).toHaveBeenCalledTimes(1);

    const evalCall = vi.mocked(fake.client.eval).mock.calls[0];

    expect(evalCall?.[1]).toEqual({
      keys: [expect.stringMatching(/^auth:rate-limit:register:[a-f0-9]{64}$/u)],
      arguments: ["900"],
    });
  });
});
