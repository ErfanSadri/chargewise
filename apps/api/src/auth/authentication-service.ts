import {
  publicUserSchema,
  type AuthenticationCredentials,
  type PublicUser,
} from "@chargewise/shared";

import type { PasswordHasher } from "./password-hasher.js";
import type { SessionRepository } from "./session-repository.js";
import { createSessionToken as createRandomSessionToken } from "./session-token.js";
import type { UserRecord, UserRepository } from "./user-repository.js";

const maximumSessionTokenAttempts = 3;

export class UnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED";

  constructor() {
    super("Authentication failed");
    this.name = "UnauthenticatedError";
  }
}

export class EmailConflictError extends Error {
  readonly code = "CONFLICT";

  constructor() {
    super("An account with this email already exists");
    this.name = "EmailConflictError";
  }
}

export interface AuthenticationResult {
  user: PublicUser;
  sessionToken: string;
}

export type RunUserTransaction = <Result>(
  operation: (users: UserRepository) => Promise<Result>,
) => Promise<Result>;

export interface AuthenticationService {
  register: (
    credentials: AuthenticationCredentials,
    existingSessionToken?: string | null,
  ) => Promise<AuthenticationResult>;

  login: (
    credentials: AuthenticationCredentials,
    existingSessionToken?: string | null,
  ) => Promise<AuthenticationResult>;

  authenticate: (sessionToken: string) => Promise<PublicUser>;

  logout: (sessionToken: string | null) => Promise<void>;
}

export interface AuthenticationServiceOptions {
  users: UserRepository;
  sessions: SessionRepository;
  passwordHasher: PasswordHasher;
  runUserTransaction: RunUserTransaction;
  createSessionToken?: () => string;
  now?: () => Date;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return publicUserSchema.parse({
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  });
}

function isDuplicateEmailError(error: unknown): boolean {
  const visitedErrors = new Set<object>();
  let currentError: unknown = error;

  while (typeof currentError === "object" && currentError !== null) {
    if (visitedErrors.has(currentError)) {
      return false;
    }

    visitedErrors.add(currentError);

    const databaseError = currentError as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (databaseError.code === "23505" && databaseError.constraint === "users_email_unique") {
      return true;
    }

    currentError = databaseError.cause;
  }

  return false;
}

export function createAuthenticationService(
  options: AuthenticationServiceOptions,
): AuthenticationService {
  const createToken = options.createSessionToken ?? createRandomSessionToken;
  const now = options.now ?? (() => new Date());

  async function createFreshSession(userId: string): Promise<string> {
    for (let attempt = 0; attempt < maximumSessionTokenAttempts; attempt += 1) {
      const sessionToken = createToken();
      const stored = await options.sessions.store(sessionToken, {
        userId,
        createdAt: now().toISOString(),
      });

      if (stored) {
        return sessionToken;
      }
    }

    throw new Error("Unable to allocate a unique session token");
  }

  async function revokeExistingSession(
    existingSessionToken: string | null | undefined,
    newSessionToken: string,
  ): Promise<void> {
    if (existingSessionToken === null || existingSessionToken === undefined) {
      return;
    }

    try {
      await options.sessions.revoke(existingSessionToken);
    } catch (error: unknown) {
      try {
        await options.sessions.revoke(newSessionToken);
      } catch {
        // Preserve the original Redis failure.
      }

      throw error;
    }
  }

  async function removeSessionAfterFailure(sessionToken: string | undefined): Promise<void> {
    if (sessionToken === undefined) {
      return;
    }

    try {
      await options.sessions.revoke(sessionToken);
    } catch {
      // Preserve the original registration or transaction failure.
    }
  }

  return {
    async register(credentials, existingSessionToken) {
      const passwordHash = await options.passwordHasher.hash(credentials.password);

      let createdSessionToken: string | undefined;

      try {
        return await options.runUserTransaction(async (transactionUsers) => {
          const createdUser = await transactionUsers.create({
            email: credentials.email,
            passwordHash,
          });

          const publicUser = toPublicUser(createdUser);
          const sessionToken = await createFreshSession(createdUser.id);

          createdSessionToken = sessionToken;

          await revokeExistingSession(existingSessionToken, sessionToken);

          return {
            user: publicUser,
            sessionToken,
          };
        });
      } catch (error: unknown) {
        await removeSessionAfterFailure(createdSessionToken);

        if (isDuplicateEmailError(error)) {
          throw new EmailConflictError();
        }

        throw error;
      }
    },

    async login(credentials, existingSessionToken) {
      const user = await options.users.findByEmail(credentials.email);

      if (user === null) {
        throw new UnauthenticatedError();
      }

      const passwordMatches = await options.passwordHasher.verify(
        user.passwordHash,
        credentials.password,
      );

      if (!passwordMatches) {
        throw new UnauthenticatedError();
      }

      const publicUser = toPublicUser(user);
      const sessionToken = await createFreshSession(user.id);

      await revokeExistingSession(existingSessionToken, sessionToken);

      return {
        user: publicUser,
        sessionToken,
      };
    },

    async authenticate(sessionToken) {
      const session = await options.sessions.find(sessionToken);

      if (session === null) {
        throw new UnauthenticatedError();
      }

      const user = await options.users.findById(session.userId);

      if (user === null) {
        await options.sessions.revoke(sessionToken);
        throw new UnauthenticatedError();
      }

      return toPublicUser(user);
    },

    async logout(sessionToken) {
      if (sessionToken === null) {
        return;
      }

      await options.sessions.revoke(sessionToken);
    },
  };
}
