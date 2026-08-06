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

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    WEB_ORIGIN: webOriginSchema,
    WEB_DIST_PATH: z.string().trim().min(1).optional(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    DATABASE_URL: databaseUrlSchema,
    REDIS_URL: redisUrlSchema,
    ROUTE_SEARCH_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    ROUTE_PROVIDER_MODE: z.enum(["live", "fixture"]).default("live"),
    SESSION_SECRET: z.string().min(32, "Must contain at least 32 characters"),

    OPENROUTESERVICE_API_KEY: z.string().trim().min(1).optional(),
    NLR_API_KEY: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== "production") {
      return;
    }

    if (value.WEB_DIST_PATH === undefined) {
      context.addIssue({
        code: "custom",
        path: ["WEB_DIST_PATH"],
        message: "Production must provide the built web application directory",
      });
    }

    if (value.ROUTE_PROVIDER_MODE !== "live") {
      context.addIssue({
        code: "custom",
        path: ["ROUTE_PROVIDER_MODE"],
        message: "Fixture providers are not allowed in production",
      });
    }

    const webOrigin = parseUrl(value.WEB_ORIGIN);

    if (webOrigin?.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "Must use HTTPS in production",
      });
    }

    const redisUrl = parseUrl(value.REDIS_URL);

    if (redisUrl?.protocol !== "rediss:") {
      context.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "Must use TLS Redis in production",
      });
    }

    if (value.TRUST_PROXY_HOPS < 1) {
      context.addIssue({
        code: "custom",
        path: ["TRUST_PROXY_HOPS"],
        message: "Must trust at least one explicitly configured proxy hop in production",
      });
    }
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
  const normalizedInput = {
    ...input,
    API_PORT: input.API_PORT ?? input.PORT,
    WEB_ORIGIN: input.WEB_ORIGIN ?? input.RENDER_EXTERNAL_URL,
  };
  const result = environmentSchema.safeParse(normalizedInput);

  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
