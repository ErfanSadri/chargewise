import { healthResponseSchema, type HealthResponse } from "@chargewise/shared";

const healthEndpoint = "/api/v1/health";

function isExpectedStatus(response: Response): boolean {
  return response.status === 200 || response.status === 503;
}

function hasConsistentStatus(response: Response, body: HealthResponse): boolean {
  return (
    (response.status === 200 && body.data.readiness === "ready") ||
    (response.status === 503 && body.data.readiness === "not_ready")
  );
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const request: RequestInit = {
    headers: {
      Accept: "application/json",
    },
  };

  if (signal !== undefined) {
    request.signal = signal;
  }

  const response = await fetch(healthEndpoint, request);

  if (!isExpectedStatus(response)) {
    throw new Error("The health request failed");
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new Error("The health response was not valid JSON");
  }

  const result = healthResponseSchema.safeParse(body);

  if (!result.success || !hasConsistentStatus(response, result.data)) {
    throw new Error("The health response did not match its contract");
  }

  return result.data;
}
