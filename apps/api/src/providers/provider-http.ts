import type { z } from "zod";

import { ProviderError, type ProviderName } from "./provider-error.js";

export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface ProviderJsonRequest {
  provider: ProviderName;
  url: string | URL;
  init?: RequestInit;
  fetchFn?: ProviderFetch;
  timeoutMs?: number;
}

const defaultTimeoutMs = 10_000;

export async function requestProviderJson(options: ProviderJsonRequest): Promise<unknown> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;

    try {
      response = await fetchFn(options.url, {
        ...options.init,
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new ProviderError({
          provider: options.provider,
          code: "PROVIDER_TIMEOUT",
          message: "External provider request timed out",
        });
      }

      throw new ProviderError({
        provider: options.provider,
        code: "PROVIDER_UNAVAILABLE",
        message: "External provider request failed",
      });
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new ProviderError({
          provider: options.provider,
          code: "PROVIDER_RATE_LIMITED",
          statusCode: response.status,
          message: "External provider rate limit was exceeded",
        });
      }

      throw new ProviderError({
        provider: options.provider,
        code: "PROVIDER_UNAVAILABLE",
        statusCode: response.status,
        message: "External provider returned an unsuccessful response",
      });
    }

    try {
      return await response.json();
    } catch {
      throw new ProviderError({
        provider: options.provider,
        code: "PROVIDER_INVALID_RESPONSE",
        statusCode: response.status,
        message: "External provider returned invalid JSON",
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function parseProviderPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  provider: ProviderName,
): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new ProviderError({
      provider,
      code: "PROVIDER_INVALID_RESPONSE",
      message: "External provider response did not match the expected contract",
    });
  }

  return result.data;
}
