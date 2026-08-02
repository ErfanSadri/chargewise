import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const localEnvironmentPath = fileURLToPath(new URL("../../../../.env", import.meta.url));

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

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
