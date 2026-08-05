import { readFile } from "node:fs/promises";

import type { ProviderFetch } from "./provider-http.js";

export async function readProviderFixture(fileName: string): Promise<unknown> {
  const fixtureUrl = new URL(`../../../../tests/fixtures/providers/${fileName}`, import.meta.url);
  const contents = await readFile(fixtureUrl, "utf8");

  return JSON.parse(contents) as unknown;
}

export function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export interface CapturedProviderRequest {
  input: string | URL | Request;
  init: RequestInit | undefined;
}

export function createCapturingFetch(responseFactory: () => Response | Promise<Response>): {
  fetchFn: ProviderFetch;
  requests: CapturedProviderRequest[];
} {
  const requests: CapturedProviderRequest[] = [];

  const fetchFn: ProviderFetch = async (input, init) => {
    requests.push({ input, init });
    return responseFactory();
  };

  return { fetchFn, requests };
}
