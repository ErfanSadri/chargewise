import { z } from "zod";

import { createSessionKey, isSessionToken, sessionLifetimeSeconds } from "./session-token.js";

const sessionRecordSchema = z.strictObject({
  userId: z.uuid(),
  createdAt: z.iso.datetime(),
});

export type SessionRecord = z.infer<typeof sessionRecordSchema>;

export interface SessionRedisClient {
  set(
    key: string,
    value: string,
    options: {
      EX: number;
      NX: true;
    },
  ): Promise<"OK" | null>;

  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

export interface SessionRepository {
  store: (token: string, record: SessionRecord) => Promise<boolean>;
  find: (token: string) => Promise<SessionRecord | null>;
  revoke: (token: string) => Promise<void>;
}

export interface SessionRepositoryOptions {
  client: SessionRedisClient;
  sessionSecret: string;
}

export function createSessionRepository(options: SessionRepositoryOptions): SessionRepository {
  return {
    async store(token, record) {
      if (!isSessionToken(token)) {
        throw new TypeError("Session token has an invalid format");
      }

      const validatedRecord = sessionRecordSchema.parse(record);
      const sessionKey = createSessionKey(token, options.sessionSecret);

      const result = await options.client.set(sessionKey, JSON.stringify(validatedRecord), {
        EX: sessionLifetimeSeconds,
        NX: true,
      });

      return result === "OK";
    },

    async find(token) {
      if (!isSessionToken(token)) {
        return null;
      }

      const sessionKey = createSessionKey(token, options.sessionSecret);
      const serializedRecord = await options.client.get(sessionKey);

      if (serializedRecord === null) {
        return null;
      }

      let untrustedRecord: unknown;

      try {
        untrustedRecord = JSON.parse(serializedRecord);
      } catch {
        return null;
      }

      const result = sessionRecordSchema.safeParse(untrustedRecord);

      if (!result.success) {
        return null;
      }

      return result.data;
    },

    async revoke(token) {
      if (!isSessionToken(token)) {
        return;
      }

      const sessionKey = createSessionKey(token, options.sessionSecret);

      await options.client.del(sessionKey);
    },
  };
}
