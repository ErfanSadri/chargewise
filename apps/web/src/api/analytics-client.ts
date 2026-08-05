import {
  analyticsNetworksResponseSchema,
  analyticsStationsResponseSchema,
  analyticsSummaryResponseSchema,
  type AnalyticsDateRangeQuery,
  type AnalyticsNetworkBreakdown,
  type AnalyticsStationBreakdown,
  type AnalyticsSummary,
} from "@chargewise/shared";

import { requestJson } from "./api-client.ts";

export const analyticsQueryKey = ["analytics"] as const;

export interface AnalyticsDashboardFilters {
  from: string;
  to: string;
}

export type AnalyticsResource = "summary" | "networks" | "stations";

export function getAnalyticsQueryKey(
  resource: AnalyticsResource,
  filters: AnalyticsDashboardFilters,
) {
  return [...analyticsQueryKey, resource, filters] as const;
}

function createAnalyticsPath(resource: AnalyticsResource, query: AnalyticsDateRangeQuery): string {
  const searchParameters = new URLSearchParams();

  if (query.from !== undefined) {
    searchParameters.set("from", query.from);
  }

  if (query.to !== undefined) {
    searchParameters.set("to", query.to);
  }

  const queryString = searchParameters.toString();
  const path = `/analytics/${resource}`;

  return queryString === "" ? path : `${path}?${queryString}`;
}

export async function getAnalyticsSummary(
  query: AnalyticsDateRangeQuery = {},
  signal?: AbortSignal,
): Promise<AnalyticsSummary> {
  const response = await requestJson(
    createAnalyticsPath("summary", query),
    analyticsSummaryResponseSchema,
    signal === undefined ? {} : { signal },
  );

  return response.data;
}

export async function getAnalyticsNetworks(
  query: AnalyticsDateRangeQuery = {},
  signal?: AbortSignal,
): Promise<AnalyticsNetworkBreakdown[]> {
  const response = await requestJson(
    createAnalyticsPath("networks", query),
    analyticsNetworksResponseSchema,
    signal === undefined ? {} : { signal },
  );

  return response.data;
}

export async function getAnalyticsStations(
  query: AnalyticsDateRangeQuery = {},
  signal?: AbortSignal,
): Promise<AnalyticsStationBreakdown[]> {
  const response = await requestJson(
    createAnalyticsPath("stations", query),
    analyticsStationsResponseSchema,
    signal === undefined ? {} : { signal },
  );

  return response.data;
}
