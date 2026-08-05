import { z } from "zod";

export * from "./auth.js";
export * from "./analytics.js";
export * from "./charging-session.js";
export * from "./favorite.js";
export * from "./route.js";
export * from "./vehicle.js";

export const healthProcessStatusSchema = z.literal("up");
export const healthReadinessStatusSchema = z.enum(["ready", "not_ready"]);
export const healthDependencyStatusSchema = z.enum(["up", "down"]);

export const healthResponseSchema = z
  .object({
    data: z.object({
      process: healthProcessStatusSchema,
      readiness: healthReadinessStatusSchema,
      dependencies: z.object({
        database: healthDependencyStatusSchema,
        cache: healthDependencyStatusSchema,
      }),
    }),
  })
  .superRefine((value, context) => {
    const dependenciesReady =
      value.data.dependencies.database === "up" && value.data.dependencies.cache === "up";
    const reportsReady = value.data.readiness === "ready";

    if (dependenciesReady !== reportsReady) {
      context.addIssue({
        code: "custom",
        path: ["data", "readiness"],
        message: "Readiness must agree with dependency status",
      });
    }
  });

export type HealthProcessStatus = z.infer<typeof healthProcessStatusSchema>;
export type HealthReadinessStatus = z.infer<typeof healthReadinessStatusSchema>;
export type HealthDependencyStatus = z.infer<typeof healthDependencyStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
