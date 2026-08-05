export interface RuntimeSchema<Output> {
  parse: (value: unknown) => Output;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

interface ErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
  };
  requestId?: unknown;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(options: { statusCode: number; code: string; message: string; requestId?: string }) {
    super(options.message);
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.requestId = options.requestId;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text === "") {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function createApiError(response: Response, value: unknown): ApiError {
  const envelope =
    typeof value === "object" && value !== null ? (value as ErrorEnvelope) : undefined;

  const code = typeof envelope?.error?.code === "string" ? envelope.error.code : "REQUEST_FAILED";

  const message =
    typeof envelope?.error?.message === "string"
      ? envelope.error.message
      : "The request could not be completed";

  const requestId = typeof envelope?.requestId === "string" ? envelope.requestId : undefined;

  return new ApiError({
    statusCode: response.status,
    code,
    message,
    ...(requestId === undefined ? {} : { requestId }),
  });
}

function createRequestInit(options: ApiRequestOptions): RequestInit {
  const headers = new Headers({
    Accept: "application/json",
  });

  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
  };

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    requestInit.body = JSON.stringify(options.body);
  }

  if (options.signal !== undefined) {
    requestInit.signal = options.signal;
  }

  return requestInit;
}

export async function requestJson<Output>(
  path: string,
  schema: RuntimeSchema<Output>,
  options: ApiRequestOptions = {},
): Promise<Output> {
  const response = await fetch(`/api/v1${path}`, createRequestInit(options));

  const value = await readJson(response);

  if (!response.ok) {
    throw createApiError(response, value);
  }

  return schema.parse(value);
}

export async function requestNoContent(path: string, options: ApiRequestOptions): Promise<void> {
  const response = await fetch(`/api/v1${path}`, createRequestInit(options));

  if (!response.ok) {
    throw createApiError(response, await readJson(response));
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 401 && error.code === "UNAUTHENTICATED";
}
