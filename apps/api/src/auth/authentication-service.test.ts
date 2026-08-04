import type { AuthenticationCredentials } from "@chargewise/shared";
import { describe, expect, it, vi } from "vitest";

import {
  createAuthenticationService,
  EmailConflictError,
  type RunUserTransaction,
  UnauthenticatedError,
} from "./authentication-service.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { SessionRecord, SessionRepository } from "./session-repository.js";
import type { UserRecord, UserRepository } from "./user-repository.js";

const currentTime = new Date("2026-08-04T12:30:00.000Z");
const sessionToken = "a".repeat(43);
const existingSessionToken = "b".repeat(43);
const replacementSessionToken = "c".repeat(43);

const credentials: AuthenticationCredentials = {
  email: "driver@example.com",
  password: "exact-password-value",
};

const userRecord: UserRecord = {
  id: "8c30cbb4-f724-4e72-a994-f1429f758c54",
  email: "driver@example.com",
  passwordHash: "$argon2id$test-password-hash",
  createdAt: new Date("2026-08-04T12:00:00.000Z"),
  updatedAt: new Date("2026-08-04T12:05:00.000Z"),
};

const sessionRecord: SessionRecord = {
  userId: userRecord.id,
  createdAt: currentTime.toISOString(),
};

function createDependencies() {
  const users: UserRepository = {
    create: vi.fn(async () => userRecord),
    findByEmail: vi.fn(async () => userRecord),
    findById: vi.fn(async () => userRecord),
  };

  const sessions: SessionRepository = {
    store: vi.fn(async () => true),
    find: vi.fn(async () => sessionRecord),
    revoke: vi.fn(async () => undefined),
  };

  const passwordHasher: PasswordHasher = {
    hash: vi.fn(async () => "$argon2id$generated-password-hash"),
    verify: vi.fn(async () => true),
  };

  const runUserTransaction: RunUserTransaction = async (operation) => operation(users);

  return {
    users,
    sessions,
    passwordHasher,
    runUserTransaction,
  };
}

describe("authentication service", () => {
  it("registers a user and session inside the transaction", async () => {
    const dependencies = createDependencies();
    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    await expect(service.register(credentials)).resolves.toEqual({
      user: {
        id: userRecord.id,
        email: userRecord.email,
        createdAt: userRecord.createdAt.toISOString(),
        updatedAt: userRecord.updatedAt.toISOString(),
      },
      sessionToken,
    });

    expect(dependencies.passwordHasher.hash).toHaveBeenCalledWith(credentials.password);

    expect(dependencies.users.create).toHaveBeenCalledWith({
      email: credentials.email,
      passwordHash: "$argon2id$generated-password-hash",
    });

    expect(dependencies.sessions.store).toHaveBeenCalledWith(sessionToken, sessionRecord);
  });

  it("maps a wrapped normalized-email constraint error to a safe conflict", async () => {
    const dependencies = createDependencies();

    const duplicateEmailError = Object.assign(new Error("private PostgreSQL duplicate details"), {
      code: "23505",
      constraint: "users_email_unique",
    });

    const wrappedDatabaseError = new Error("Failed query: insert into users", {
      cause: duplicateEmailError,
    });

    vi.mocked(dependencies.users.create).mockRejectedValue(wrappedDatabaseError);

    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    await expect(service.register(credentials)).rejects.toEqual(new EmailConflictError());

    expect(dependencies.sessions.store).not.toHaveBeenCalled();
  });

  it("does not complete the transaction when session storage fails", async () => {
    const dependencies = createDependencies();
    const redisError = new Error("private Redis failure");
    let transactionCompleted = false;

    dependencies.runUserTransaction = async (operation) => {
      const result = await operation(dependencies.users);
      transactionCompleted = true;
      return result;
    };

    vi.mocked(dependencies.sessions.store).mockRejectedValue(redisError);

    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    await expect(service.register(credentials)).rejects.toBe(redisError);

    expect(transactionCompleted).toBe(false);
  });

  it("removes the new session when the database transaction fails to commit", async () => {
    const dependencies = createDependencies();
    const commitError = new Error("private PostgreSQL commit failure");

    dependencies.runUserTransaction = async (operation) => {
      await operation(dependencies.users);
      throw commitError;
    };

    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    await expect(service.register(credentials)).rejects.toBe(commitError);

    expect(dependencies.sessions.revoke).toHaveBeenCalledWith(sessionToken);
  });

  it("rotates the current browser session during registration", async () => {
    const dependencies = createDependencies();
    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    await service.register(credentials, existingSessionToken);

    expect(dependencies.sessions.revoke).toHaveBeenCalledWith(existingSessionToken);
  });

  it("logs in with a fresh session and returns only public user data", async () => {
    const dependencies = createDependencies();
    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    const result = await service.login(credentials);

    expect(result).toEqual({
      user: {
        id: userRecord.id,
        email: userRecord.email,
        createdAt: userRecord.createdAt.toISOString(),
        updatedAt: userRecord.updatedAt.toISOString(),
      },
      sessionToken,
    });

    expect(result.user).not.toHaveProperty("passwordHash");

    expect(dependencies.passwordHasher.verify).toHaveBeenCalledWith(
      userRecord.passwordHash,
      credentials.password,
    );

    expect(dependencies.sessions.store).toHaveBeenCalledWith(sessionToken, sessionRecord);
  });

  it("uses the same generic failure for an unknown email", async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.users.findByEmail).mockResolvedValue(null);

    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    await expect(service.login(credentials)).rejects.toEqual(new UnauthenticatedError());

    expect(dependencies.passwordHasher.verify).not.toHaveBeenCalled();
    expect(dependencies.sessions.store).not.toHaveBeenCalled();
  });

  it("uses the same generic failure for an incorrect password", async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.passwordHasher.verify).mockResolvedValue(false);

    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    await expect(service.login(credentials)).rejects.toEqual(new UnauthenticatedError());

    expect(dependencies.sessions.store).not.toHaveBeenCalled();
  });

  it("rotates the session presented by the current browser", async () => {
    const dependencies = createDependencies();
    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    await service.login(credentials, existingSessionToken);

    expect(dependencies.sessions.store).toHaveBeenCalledWith(sessionToken, sessionRecord);

    expect(dependencies.sessions.revoke).toHaveBeenCalledWith(existingSessionToken);
  });

  it("removes the new session when rotation of the old session fails", async () => {
    const dependencies = createDependencies();
    const redisError = new Error("private Redis failure");

    vi.mocked(dependencies.sessions.revoke)
      .mockRejectedValueOnce(redisError)
      .mockResolvedValueOnce(undefined);

    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken: () => sessionToken,
      now: () => currentTime,
    });

    await expect(service.login(credentials, existingSessionToken)).rejects.toBe(redisError);

    expect(dependencies.sessions.revoke).toHaveBeenNthCalledWith(1, existingSessionToken);

    expect(dependencies.sessions.revoke).toHaveBeenNthCalledWith(2, sessionToken);
  });

  it("retries when a generated token collides with an existing key", async () => {
    const dependencies = createDependencies();
    const createSessionToken = vi
      .fn()
      .mockReturnValueOnce(sessionToken)
      .mockReturnValueOnce(replacementSessionToken);

    vi.mocked(dependencies.sessions.store).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const service = createAuthenticationService({
      ...dependencies,
      createSessionToken,
      now: () => currentTime,
    });

    const result = await service.login(credentials);

    expect(result.sessionToken).toBe(replacementSessionToken);
    expect(dependencies.sessions.store).toHaveBeenCalledTimes(2);

    expect(dependencies.sessions.store).toHaveBeenNthCalledWith(1, sessionToken, sessionRecord);

    expect(dependencies.sessions.store).toHaveBeenNthCalledWith(
      2,
      replacementSessionToken,
      sessionRecord,
    );
  });

  it("authenticates a valid session using the current database user", async () => {
    const dependencies = createDependencies();
    const service = createAuthenticationService({
      ...dependencies,
    });

    await expect(service.authenticate(sessionToken)).resolves.toEqual({
      id: userRecord.id,
      email: userRecord.email,
      createdAt: userRecord.createdAt.toISOString(),
      updatedAt: userRecord.updatedAt.toISOString(),
    });

    expect(dependencies.sessions.find).toHaveBeenCalledWith(sessionToken);
    expect(dependencies.users.findById).toHaveBeenCalledWith(userRecord.id);
  });

  it("revokes an orphaned session and returns the generic failure", async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.users.findById).mockResolvedValue(null);

    const service = createAuthenticationService({
      ...dependencies,
    });

    await expect(service.authenticate(sessionToken)).rejects.toEqual(new UnauthenticatedError());

    expect(dependencies.sessions.revoke).toHaveBeenCalledWith(sessionToken);
  });

  it("makes logout idempotent when no session token is present", async () => {
    const dependencies = createDependencies();
    const service = createAuthenticationService({
      ...dependencies,
    });

    await service.logout(null);

    expect(dependencies.sessions.revoke).not.toHaveBeenCalled();

    await service.logout(sessionToken);

    expect(dependencies.sessions.revoke).toHaveBeenCalledWith(sessionToken);
  });
});
