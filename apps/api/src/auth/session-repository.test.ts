import { describe, expect, it, vi } from "vitest";

import {
  createSessionRepository,
  type SessionRecord,
  type SessionRedisClient,
} from "./session-repository.js";
import { createSessionKey, sessionLifetimeSeconds } from "./session-token.js";

const sessionSecret = "test-session-secret-that-is-at-least-32-characters";
const sessionToken = "a".repeat(43);

const sessionRecord: SessionRecord = {
  userId: "8c30cbb4-f724-4e72-a994-f1429f758c54",
  createdAt: "2026-08-04T12:00:00.000Z",
};

function createRedisClient(): SessionRedisClient {
  return {
    set: vi.fn(async () => "OK" as const),
    get: vi.fn(async () => null as string | null),
    del: vi.fn(async () => 1),
  };
}

describe("session repository", () => {
  it("stores a session under its derived key with a fixed expiration", async () => {
    const client = createRedisClient();
    const repository = createSessionRepository({
      client,
      sessionSecret,
    });

    await expect(repository.store(sessionToken, sessionRecord)).resolves.toBe(true);

    const expectedKey = createSessionKey(sessionToken, sessionSecret);

    expect(client.set).toHaveBeenCalledWith(expectedKey, JSON.stringify(sessionRecord), {
      EX: sessionLifetimeSeconds,
      NX: true,
    });

    expect(expectedKey).not.toContain(sessionToken);
  });

  it("reports a collision without overwriting an existing session", async () => {
    const client = createRedisClient();

    vi.mocked(client.set).mockResolvedValue(null);

    const repository = createSessionRepository({
      client,
      sessionSecret,
    });

    await expect(repository.store(sessionToken, sessionRecord)).resolves.toBe(false);
  });

  it("loads and validates a stored session without extending its lifetime", async () => {
    const client = createRedisClient();

    vi.mocked(client.get).mockResolvedValue(JSON.stringify(sessionRecord));

    const repository = createSessionRepository({
      client,
      sessionSecret,
    });

    await expect(repository.find(sessionToken)).resolves.toEqual(sessionRecord);

    expect(client.get).toHaveBeenCalledWith(createSessionKey(sessionToken, sessionSecret));
    expect(client.set).not.toHaveBeenCalled();
  });

  it("returns null when a session does not exist", async () => {
    const client = createRedisClient();
    const repository = createSessionRepository({
      client,
      sessionSecret,
    });

    await expect(repository.find(sessionToken)).resolves.toBeNull();
  });

  it("returns null for malformed or unsafe stored data", async () => {
    const client = createRedisClient();
    const repository = createSessionRepository({
      client,
      sessionSecret,
    });

    vi.mocked(client.get)
      .mockResolvedValueOnce("{malformed")
      .mockResolvedValueOnce(
        JSON.stringify({
          ...sessionRecord,
          passwordHash: "must-not-be-accepted",
        }),
      );

    await expect(repository.find(sessionToken)).resolves.toBeNull();
    await expect(repository.find(sessionToken)).resolves.toBeNull();
  });

  it("does not query Redis for a malformed browser token", async () => {
    const client = createRedisClient();
    const repository = createSessionRepository({
      client,
      sessionSecret,
    });

    await expect(repository.find("malformed-token")).resolves.toBeNull();
    await repository.revoke("malformed-token");

    expect(client.get).not.toHaveBeenCalled();
    expect(client.del).not.toHaveBeenCalled();
  });

  it("revokes a session using its derived Redis key", async () => {
    const client = createRedisClient();
    const repository = createSessionRepository({
      client,
      sessionSecret,
    });

    await repository.revoke(sessionToken);

    expect(client.del).toHaveBeenCalledWith(createSessionKey(sessionToken, sessionSecret));
  });
});
