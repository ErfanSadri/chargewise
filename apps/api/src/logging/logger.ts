import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import pino, { type Logger } from "pino";
import { pinoHttp } from "pino-http";

export type AppLogger = Logger;
export type RuntimeEnvironment = "development" | "test" | "production";

function getRequestPath(url: string | undefined): string | undefined {
  return url?.split("?", 1)[0];
}

export function createLogger(environment: RuntimeEnvironment): AppLogger {
  return pino({
    level: environment === "test" ? "silent" : "info",
    redact: {
      paths: ['req.headers["authorization"]', 'req.headers["cookie"]', 'res.headers["set-cookie"]'],
      censor: "[Redacted]",
    },
  });
}

export function createHttpLogger(logger: AppLogger) {
  return pinoHttp({
    logger,
    genReqId: (_request, response) => {
      const requestId = `req_${randomUUID()}`;

      response.setHeader("X-Request-ID", requestId);

      return requestId;
    },
    wrapSerializers: false,
    serializers: {
      req: (request: IncomingMessage) => ({
        id: request.id,
        method: request.method,
        path: getRequestPath(request.url),
      }),
      res: (response: ServerResponse) => ({
        statusCode: response.statusCode,
      }),
      err: (error: Error) => ({
        type: error.name,
      }),
    },
    customLogLevel: (_request, response, error) => {
      if (error !== undefined || response.statusCode >= 500) {
        return "error";
      }

      if (response.statusCode >= 400) {
        return "warn";
      }

      return "info";
    },
  });
}
