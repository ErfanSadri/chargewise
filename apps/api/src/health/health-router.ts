import { Router } from "express";
import { z } from "zod";

import { sendValidationError } from "../http/error-handlers.js";
import { checkHealth, type HealthChecks } from "./health-service.js";

const healthRequestSchema = z.object({
  query: z.object({}).strict(),
  hasBody: z.literal(false),
});

function requestHasBody(contentLength: string | undefined, transferEncoding: string | undefined) {
  return (
    (contentLength !== undefined && Number(contentLength) > 0) || transferEncoding !== undefined
  );
}

export function createHealthRouter(checks: HealthChecks): Router {
  const router = Router();

  router.get("/", async (request, response) => {
    response.set("Cache-Control", "no-store");

    const requestValidation = healthRequestSchema.safeParse({
      query: request.query,
      hasBody: requestHasBody(request.get("content-length"), request.get("transfer-encoding")),
    });

    if (!requestValidation.success) {
      sendValidationError(request, response);
      return;
    }

    const healthResult = await checkHealth(checks);

    for (const failure of healthResult.failures) {
      request.log.warn(
        {
          dependency: failure.dependency,
        },
        "Health dependency check failed",
      );
    }

    response.status(healthResult.statusCode).json(healthResult.body);
  });

  return router;
}
