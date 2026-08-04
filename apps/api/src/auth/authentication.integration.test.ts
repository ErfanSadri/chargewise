import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { createDatabaseConnection, type DatabaseConnection, users } from "@chargewise/database";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createClient } from "redis";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createRunUserTransaction } from "./authentication-database.js";
import { createAuthenticationService } from "./authentication-service.js";
import { argon2PasswordHasher } from "./password-hasher.js";
import {
  createSessionInfrastructure,
  type SessionInfrastructure,
} from "./session-infrastructure.js";
import {
  createSessionKey,
  isSessionToken,
  sessionCookieName,
  sessionLifetimeSeconds,
} from "./session-token.js";
import { createUserRepository } from "./user-repository.js";
import { createLogger } from "../logging/logger.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const localEnvironmentPath = resolve(sourceDirectory, "../../../../.env");
const migrationsFolder = resolve(sourceDirectory, "../../../../packages/database/drizzle");

const originalNodeEnvironment = process.env.NODE_ENV;

if (existsSync(localEnvironmentPath)) {
  loadEnvFile(localEnvironmentPath);
}

/*
 * Preserve the test environment supplied by Vitest or the shell instead of
 * allowing the development value in .env to replace it.
 */
if (originalNodeEnvironment !== undefined) {
  process.env.NODE_ENV = originalNodeEnvironment;
}

const webOrigin = "http://localhost:5173";
const password = "  Pässword-for-ChargeWise 🔋  ";
const normalizedEmail = "driver@example.com";

let databaseConnection: DatabaseConnection | undefined;
let sessionInfrastructure: SessionInfrastructure | undefined;
let redisControlClient: ReturnType<typeof createClient> | undefined;
let app: ReturnType<typeof createApp> | undefined;
let sessionSecret: string;

function getRequiredEnvironment(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required for authentication integration tests`);
  }

  return value;
}

function getSafeTestDatabaseUrl(): string {
  const value = getRequiredEnvironment("TEST_DATABASE_URL");

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use the PostgreSQL protocol");
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/u, ""));

  if (databaseName !== "chargewise_test") {
    throw new Error('Authentication tests may run only against a database named "chargewise_test"');
  }

  return value;
}

function getTestRedisUrl(): string {
  const value = getRequiredEnvironment("REDIS_URL");

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis URL");
  }

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use the redis or rediss protocol");
  }

  /*
   * Redis database 15 is isolated from normal Chargewise development data.
   */
  parsedUrl.pathname = "/15";

  return parsedUrl.toString();
}

function requireDatabaseConnection(): DatabaseConnection {
  if (databaseConnection === undefined) {
    throw new Error("The authentication test database is not ready");
  }

  return databaseConnection;
}

function requireRedisControlClient(): ReturnType<typeof createClient> {
  if (redisControlClient === undefined) {
    throw new Error("The authentication Redis test client is not ready");
  }

  return redisControlClient;
}

function requireApp(): ReturnType<typeof createApp> {
  if (app === undefined) {
    throw new Error("The authentication test application is not ready");
  }

  return app;
}

function getCookiePair(response: request.Response): string {
  const header = response.headers["set-cookie"];

  if (!Array.isArray(header) || header.length !== 1) {
    throw new Error("Expected exactly one Set-Cookie header");
  }

  const [setCookie] = header;

  if (setCookie === undefined) {
    throw new Error("The Set-Cookie header was empty");
  }

  const [cookiePair] = setCookie.split(";");

  if (cookiePair === undefined) {
    throw new Error("The session cookie was malformed");
  }

  return cookiePair;
}

function getSessionToken(cookiePair: string): string {
  const prefix = `${sessionCookieName}=`;

  if (!cookiePair.startsWith(prefix)) {
    throw new Error("The Chargewise session cookie was not found");
  }

  const token = cookiePair.slice(prefix.length);

  if (!isSessionToken(token)) {
    throw new Error("The Chargewise session token was malformed");
  }

  return token;
}

describe("authentication lifecycle integration", () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV !== "test") {
      throw new Error('Authentication integration tests require NODE_ENV to equal "test"');
    }

    sessionSecret = getRequiredEnvironment("SESSION_SECRET");

    if (sessionSecret.length < 32) {
      throw new Error("SESSION_SECRET must contain at least 32 characters");
    }

    const testDatabaseUrl = getSafeTestDatabaseUrl();
    const testRedisUrl = getTestRedisUrl();

    databaseConnection = createDatabaseConnection(testDatabaseUrl);

    await migrate(databaseConnection.db, {
      migrationsFolder,
    });

    redisControlClient = createClient({
      url: testRedisUrl,
    });

    redisControlClient.on("error", () => {
      /*
       * Individual test requests verify dependency errors. The control client
       * listener prevents Redis EventEmitter errors from being unhandled.
       */
    });

    await redisControlClient.connect();

    sessionInfrastructure = createSessionInfrastructure({
      redisUrl: testRedisUrl,
      sessionSecret,
    });

    await sessionInfrastructure.connect();

    const usersRepository = createUserRepository(databaseConnection.db);

    const authenticationService = createAuthenticationService({
      users: usersRepository,
      sessions: sessionInfrastructure.repository,
      passwordHasher: argon2PasswordHasher,
      runUserTransaction: createRunUserTransaction(databaseConnection.db),
    });

    app = createApp({
      authentication: {
        service: authenticationService,
        rateLimiter: sessionInfrastructure.rateLimiter,
        isProduction: false,
        webOrigin,
      },
      healthChecks: {
        database: () => Promise.resolve(),
        cache: () => Promise.resolve(),
      },
      logger: createLogger("test"),
      webOrigin,
    });
  }, 30_000);

  beforeEach(async () => {
    const database = requireDatabaseConnection();
    const redis = requireRedisControlClient();

    await database.db.delete(users);
    await redis.flushDb();
  });

  afterAll(async () => {
    if (redisControlClient !== undefined) {
      if (redisControlClient.isOpen) {
        await redisControlClient.flushDb();
        await redisControlClient.close();
      }
    }

    if (sessionInfrastructure !== undefined) {
      await sessionInfrastructure.close();
    }

    if (databaseConnection !== undefined) {
      await databaseConnection.db.delete(users);
      await databaseConnection.close();
    }
  }, 30_000);

  it("registers, authenticates, logs out, and prevents token replay", async () => {
    const testApp = requireApp();
    const database = requireDatabaseConnection();
    const redis = requireRedisControlClient();
    const browser = request.agent(testApp);

    const registrationResponse = await browser
      .post("/api/v1/auth/register")
      .send({
        email: " Driver@Example.com ",
        password,
      })
      .expect(201);

    expect(registrationResponse.body).toEqual({
      data: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        email: normalizedEmail,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    const registrationCookie = getCookiePair(registrationResponse);
    const rawSessionToken = getSessionToken(registrationCookie);
    const sessionKey = createSessionKey(rawSessionToken, sessionSecret);

    expect(sessionKey).not.toContain(rawSessionToken);

    const sessionTtl = await redis.ttl(sessionKey);

    expect(sessionTtl).toBeGreaterThan(sessionLifetimeSeconds - 10);
    expect(sessionTtl).toBeLessThanOrEqual(sessionLifetimeSeconds);

    const storedSession = await redis.get(sessionKey);

    expect(storedSession).not.toBeNull();
    expect(JSON.parse(String(storedSession))).toEqual({
      userId: registrationResponse.body.data.id,
      createdAt: expect.any(String),
    });

    const [storedUser] = await database.db
      .select({
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    expect(storedUser).toBeDefined();
    expect(storedUser?.email).toBe(normalizedEmail);
    expect(storedUser?.passwordHash).toMatch(/^\$argon2id\$/u);
    expect(storedUser?.passwordHash).not.toBe(password);

    const currentUserResponse = await browser.get("/api/v1/auth/me").expect(200);

    expect(currentUserResponse.body).toEqual(registrationResponse.body);

    await browser.post("/api/v1/auth/logout").expect(204);

    expect(await redis.exists(sessionKey)).toBe(0);

    await request(testApp).get("/api/v1/auth/me").set("Cookie", registrationCookie).expect(401);
  });

  it("rejects a duplicate normalized email", async () => {
    const testApp = requireApp();

    await request(testApp)
      .post("/api/v1/auth/register")
      .send({
        email: normalizedEmail,
        password,
      })
      .expect(201);

    const duplicateResponse = await request(testApp)
      .post("/api/v1/auth/register")
      .send({
        email: " DRIVER@EXAMPLE.COM ",
        password,
      })
      .expect(409);

    expect(duplicateResponse.body.error).toEqual({
      code: "CONFLICT",
      message: "An account with this email already exists",
      details: [],
    });

    expect(duplicateResponse.headers["set-cookie"]).toBeUndefined();
  });

  it("rotates the current browser session during login", async () => {
    const testApp = requireApp();
    const redis = requireRedisControlClient();
    const browser = request.agent(testApp);

    const registrationResponse = await browser
      .post("/api/v1/auth/register")
      .send({
        email: normalizedEmail,
        password,
      })
      .expect(201);

    const originalCookie = getCookiePair(registrationResponse);
    const originalToken = getSessionToken(originalCookie);
    const originalKey = createSessionKey(originalToken, sessionSecret);

    const loginResponse = await browser
      .post("/api/v1/auth/login")
      .send({
        email: normalizedEmail,
        password,
      })
      .expect(200);

    const replacementCookie = getCookiePair(loginResponse);
    const replacementToken = getSessionToken(replacementCookie);
    const replacementKey = createSessionKey(replacementToken, sessionSecret);

    expect(replacementToken).not.toBe(originalToken);
    expect(await redis.exists(originalKey)).toBe(0);
    expect(await redis.exists(replacementKey)).toBe(1);

    await request(testApp).get("/api/v1/auth/me").set("Cookie", originalCookie).expect(401);

    await request(testApp).get("/api/v1/auth/me").set("Cookie", replacementCookie).expect(200);
  });

  it("limits registration to five attempts per client IP in 15 minutes", async () => {
    const testApp = requireApp();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(testApp)
        .post("/api/v1/auth/register")
        .send({
          email: `driver-${attempt}@example.com`,
          password,
        })
        .expect(201);
    }

    const blockedResponse = await request(testApp)
      .post("/api/v1/auth/register")
      .send({
        email: "blocked-driver@example.com",
        password,
      })
      .expect(429);

    expect(blockedResponse.body.error).toEqual({
      code: "RATE_LIMITED",
      message: "Too many requests",
      details: [],
    });

    const retryAfter = Number(blockedResponse.headers["retry-after"]);

    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(900);

    const database = requireDatabaseConnection();

    const [blockedUser] = await database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "blocked-driver@example.com"))
      .limit(1);

    expect(blockedUser).toBeUndefined();
  });

  it("limits login to ten attempts per client IP in 15 minutes", async () => {
    const testApp = requireApp();

    await request(testApp)
      .post("/api/v1/auth/register")
      .send({
        email: normalizedEmail,
        password,
      })
      .expect(201);

    /*
     * Registration and login use separate counters, so registration does not
     * consume one of the ten login attempts.
     */
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await request(testApp)
        .post("/api/v1/auth/login")
        .send({
          email: normalizedEmail,
          password: `incorrect-password-${attempt}`,
        })
        .expect(401);

      expect(response.body.error).toEqual({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
        details: [],
      });
    }

    const blockedResponse = await request(testApp)
      .post("/api/v1/auth/login")
      .send({
        email: normalizedEmail,
        password,
      })
      .expect(429);

    expect(blockedResponse.body.error).toEqual({
      code: "RATE_LIMITED",
      message: "Too many requests",
      details: [],
    });

    const retryAfter = Number(blockedResponse.headers["retry-after"]);

    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(900);
  });

  it("does not extend the fixed session lifetime when the session is read", async () => {
    const testApp = requireApp();
    const redis = requireRedisControlClient();

    const registrationResponse = await request(testApp)
      .post("/api/v1/auth/register")
      .send({
        email: normalizedEmail,
        password,
      })
      .expect(201);

    const sessionCookie = getCookiePair(registrationResponse);
    const sessionToken = getSessionToken(sessionCookie);
    const sessionKey = createSessionKey(sessionToken, sessionSecret);

    /*
     * Reduce the remaining lifetime so a reset to seven days would be
     * immediately visible without waiting for several minutes.
     */
    await redis.expire(sessionKey, 30);

    const ttlBeforeRead = await redis.ttl(sessionKey);

    await request(testApp).get("/api/v1/auth/me").set("Cookie", sessionCookie).expect(200);

    const ttlAfterRead = await redis.ttl(sessionKey);

    expect(ttlBeforeRead).toBeGreaterThan(0);
    expect(ttlAfterRead).toBeGreaterThan(0);
    expect(ttlAfterRead).toBeLessThanOrEqual(ttlBeforeRead);
    expect(ttlAfterRead).toBeLessThan(sessionLifetimeSeconds);
  });

  it("invalidates a session when its database user no longer exists", async () => {
    const testApp = requireApp();
    const database = requireDatabaseConnection();
    const redis = requireRedisControlClient();

    const registrationResponse = await request(testApp)
      .post("/api/v1/auth/register")
      .send({
        email: normalizedEmail,
        password,
      })
      .expect(201);

    const userId = String(registrationResponse.body.data.id);
    const sessionCookie = getCookiePair(registrationResponse);
    const sessionToken = getSessionToken(sessionCookie);
    const sessionKey = createSessionKey(sessionToken, sessionSecret);

    expect(await redis.exists(sessionKey)).toBe(1);

    await database.db.delete(users).where(eq(users.id, userId));

    const response = await request(testApp)
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie)
      .expect(401);

    expect(response.body.error).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });

    expect(await redis.exists(sessionKey)).toBe(0);
  });
});
