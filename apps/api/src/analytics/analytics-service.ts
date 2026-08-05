import {
  analyticsDateRangeQuerySchema,
  analyticsNetworkBreakdownSchema,
  analyticsStationBreakdownSchema,
  analyticsSummarySchema,
  type AnalyticsDateRangeQuery,
  type AnalyticsNetworkBreakdown,
  type AnalyticsStationBreakdown,
  type AnalyticsSummary,
} from "@chargewise/shared";

import type { AnalyticsDateRange, AnalyticsRepository } from "./analytics-repository.js";

export class InvalidAnalyticsQueryError extends TypeError {
  constructor() {
    super("Analytics query is invalid");
    this.name = "InvalidAnalyticsQueryError";
  }
}

export interface AnalyticsService {
  summary: (userId: string, query: AnalyticsDateRangeQuery) => Promise<AnalyticsSummary>;
  networks: (
    userId: string,
    query: AnalyticsDateRangeQuery,
  ) => Promise<AnalyticsNetworkBreakdown[]>;
  stations: (
    userId: string,
    query: AnalyticsDateRangeQuery,
  ) => Promise<AnalyticsStationBreakdown[]>;
}

export interface AnalyticsServiceOptions {
  analytics: AnalyticsRepository;
}

function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function getExclusiveEndDate(value: string): Date {
  const date = parseUtcDate(value);

  date.setUTCDate(date.getUTCDate() + 1);

  return date;
}

function toIsoTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Analytics station timestamp is invalid");
  }

  return date.toISOString();
}

function createDateRange(userId: string, query: AnalyticsDateRangeQuery): AnalyticsDateRange {
  const validation = analyticsDateRangeQuerySchema.safeParse(query);

  if (!validation.success) {
    throw new InvalidAnalyticsQueryError();
  }

  return {
    userId,
    from: validation.data.from === undefined ? null : parseUtcDate(validation.data.from),
    toExclusive: validation.data.to === undefined ? null : getExclusiveEndDate(validation.data.to),
  };
}

export function createAnalyticsService(options: AnalyticsServiceOptions): AnalyticsService {
  return {
    async summary(userId, query) {
      const summary = await options.analytics.getSummary(createDateRange(userId, query));

      return analyticsSummarySchema.parse(summary);
    },

    async networks(userId, query) {
      const networks = await options.analytics.getNetworks(createDateRange(userId, query));

      return networks.map((network) => analyticsNetworkBreakdownSchema.parse(network));
    },

    async stations(userId, query) {
      const stations = await options.analytics.getStations(createDateRange(userId, query));

      return stations.map((station) =>
        analyticsStationBreakdownSchema.parse({
          ...station,
          lastSessionAt: toIsoTimestamp(station.lastSessionAt),
        }),
      );
    },
  };
}
