import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const localEnvironmentPath = fileURLToPath(new URL("../../../../.env", import.meta.url));

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function createConnectionUrlSchema(protocols: readonly string[], protocolMessage: string) {
  return z
    .string()
    .trim()
    .superRefine((value, context) => {
      const url = parseUrl(value);

      if (url === undefined) {
        context.addIssue({
          code: "custom",
          message: "Must be a valid URL",
        });
        return;
      }

      if (!protocols.includes(url.protocol)) {
        context.addIssue({
          code: "custom",
          message: protocolMessage,
        });
      }
    });
}

const databaseUrlSchema = createConnectionUrlSchema(
  ["postgres:", "postgresql:"],
  "Must use the postgres or postgresql protocol",
);
const redisUrlSchema = createConnectionUrlSchema(
  ["redis:", "rediss:"],
  "Must use the redis or rediss protocol",
);
const webOriginSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    const url = parseUrl(value);

    if (url === undefined) {
      context.addIssue({
        code: "custom",
        message: "Must be a valid URL",
      });
      return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "Must use the http or https protocol",
      });
      return;
    }

    if (value !== url.origin) {
      context.addIssue({
        code: "custom",
        message: "Must contain only an origin without a path, query, or fragment",
      });
    }
  });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  WEB_ORIGIN: webOriginSchema,
  DATABASE_URL: databaseUrlSchema,
  REDIS_URL: redisUrlSchema,
  SESSION_SECRET: z.string().min(32, "Must contain at least 32 characters"),

  OPENROUTESERVICE_API_KEY: z.string().trim().min(1).optional(),
  NLR_API_KEY: z.string().trim().min(1).optional(),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function loadLocalEnvironment(): void {
  try {
    loadEnvFile(localEnvironmentPath);
  } catch (error: unknown) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

export function parseEnvironment(
  input: Record<string, string | undefined> = process.env,
): ApiEnvironment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
