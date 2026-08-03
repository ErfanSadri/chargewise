import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";

type ApiErrorCode = "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR";

interface ErrorResponseBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details: readonly unknown[];
  };
  requestId: string;
}

interface PublicError {
  statusCode: 400 | 404 | 413 | 500;
  code: ApiErrorCode;
  message: string;
}

function getRequestId(request: Request): string {
  return String(request.id);
}

function sendError(response: Response, requestId: string, error: PublicError): void {
  const body: ErrorResponseBody = {
    error: {
      code: error.code,
      message: error.message,
      details: [],
    },
    requestId,
  };

  response.status(error.statusCode).json(body);
}

export function sendValidationError(request: Request, response: Response): void {
  sendError(response, getRequestId(request), {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    message: "Request validation failed",
  });
}

function getBodyParserError(error: unknown): PublicError | undefined {
  if (typeof error !== "object" || error === null || !("type" in error)) {
    return undefined;
  }

  if (error.type === "entity.too.large") {
    return {
      statusCode: 413,
      code: "VALIDATION_ERROR",
      message: "Request body is too large",
    };
  }

  if (error.type === "entity.parse.failed") {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Request body is not valid JSON",
    };
  }

  return undefined;
}

function getErrorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export const notFoundHandler: RequestHandler = (request, response) => {
  sendError(response, getRequestId(request), {
    statusCode: 404,
    code: "NOT_FOUND",
    message: "Route not found",
  });
};

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const bodyParserError = getBodyParserError(error);

  if (bodyParserError !== undefined) {
    sendError(response, getRequestId(request), bodyParserError);
    return;
  }

  request.log.error(
    {
      errorType: getErrorType(error),
    },
    "Unhandled request error",
  );
  sendError(response, getRequestId(request), {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
};
