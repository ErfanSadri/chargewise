import {
  chargingSessionListResponseSchema,
  chargingSessionResponseSchema,
  type ChargingSessionListQuery,
  type ChargingSessionListResponse,
  type CreateChargingSessionRequest,
  type PublicChargingSession,
  type UpdateChargingSessionRequest,
} from "@chargewise/shared";

import { requestJson, requestNoContent } from "./api-client.ts";

export const chargingSessionsQueryKey = ["charging-sessions"] as const;

export interface ChargingSessionHistoryFilters {
  from: string;
  to: string;
}

export function getChargingSessionsQueryKey(filters: ChargingSessionHistoryFilters) {
  return [...chargingSessionsQueryKey, filters] as const;
}

function createListPath(query: ChargingSessionListQuery): string {
  const searchParameters = new URLSearchParams();

  if (query.from !== undefined) {
    searchParameters.set("from", query.from);
  }

  if (query.to !== undefined) {
    searchParameters.set("to", query.to);
  }

  if (query.cursor !== undefined) {
    searchParameters.set("cursor", query.cursor);
  }

  const queryString = searchParameters.toString();

  return queryString === "" ? "/charging-sessions" : `/charging-sessions?${queryString}`;
}

export async function listChargingSessions(
  query: ChargingSessionListQuery = {},
  signal?: AbortSignal,
): Promise<ChargingSessionListResponse> {
  return requestJson(
    createListPath(query),
    chargingSessionListResponseSchema,
    signal === undefined ? {} : { signal },
  );
}

export async function createChargingSession(
  input: CreateChargingSessionRequest,
): Promise<PublicChargingSession> {
  const response = await requestJson("/charging-sessions", chargingSessionResponseSchema, {
    method: "POST",
    body: input,
  });

  return response.data;
}

export async function updateChargingSession(
  chargingSessionId: string,
  input: UpdateChargingSessionRequest,
): Promise<PublicChargingSession> {
  const response = await requestJson(
    `/charging-sessions/${encodeURIComponent(chargingSessionId)}`,
    chargingSessionResponseSchema,
    {
      method: "PATCH",
      body: input,
    },
  );

  return response.data;
}

export async function deleteChargingSession(chargingSessionId: string): Promise<void> {
  await requestNoContent(`/charging-sessions/${encodeURIComponent(chargingSessionId)}`, {
    method: "DELETE",
  });
}
