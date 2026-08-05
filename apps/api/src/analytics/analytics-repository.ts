import { chargingSessions, stations, type ChargeWiseDatabase } from "@chargewise/database";
import type { AnalyticsNetworkBreakdown, AnalyticsSummary } from "@chargewise/shared";
import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";

export interface AnalyticsDateRange {
  userId: string;
  from: Date | null;
  toExclusive: Date | null;
}

export interface AnalyticsStationRecord {
  stationId: string;
  name: string;
  network: string | null;
  sessionCount: number;
  totalEnergyKwh: string;
  totalCost: string;
  averageCostPerKwh: string;
  averageChargingMinutes: string;
  averageWaitMinutes: string;
  averageObservedPowerKw: string;
  issueFreePercentage: string;
  lastSessionAt: Date | string;
}

export interface AnalyticsRepository {
  getSummary: (range: AnalyticsDateRange) => Promise<AnalyticsSummary>;
  getNetworks: (range: AnalyticsDateRange) => Promise<AnalyticsNetworkBreakdown[]>;
  getStations: (range: AnalyticsDateRange) => Promise<AnalyticsStationRecord[]>;
}

export type AnalyticsDatabase = Pick<ChargeWiseDatabase, "select">;

function createConditions(range: AnalyticsDateRange): SQL[] {
  const conditions: SQL[] = [eq(chargingSessions.userId, range.userId)];

  if (range.from !== null) {
    conditions.push(gte(chargingSessions.startedAt, range.from));
  }

  if (range.toExclusive !== null) {
    conditions.push(lt(chargingSessions.startedAt, range.toExclusive));
  }

  return conditions;
}

const sessionCountExpression = sql<number>`count(*)::integer`;

const totalEnergyExpression = sql<string>`
  to_char(
    coalesce(sum(${chargingSessions.energyAddedKwh}), 0),
    'FM999999999999999990.000'
  )
`;

const totalCostExpression = sql<string>`
  to_char(
    coalesce(sum(${chargingSessions.totalCost}), 0),
    'FM999999999999999990.00'
  )
`;

const averageCostPerKwhExpression = sql<string>`
  to_char(
    round(
      sum(${chargingSessions.totalCost}) /
        nullif(sum(${chargingSessions.energyAddedKwh}), 0),
      4
    ),
    'FM999999999999999990.0000'
  )
`;

const averageChargingMinutesExpression = sql<string>`
  to_char(
    round(avg(${chargingSessions.chargingMinutes})::numeric, 2),
    'FM999999999999999990.00'
  )
`;

const averageWaitMinutesExpression = sql<string>`
  to_char(
    round(avg(${chargingSessions.waitMinutes})::numeric, 2),
    'FM999999999999999990.00'
  )
`;

const averageObservedPowerExpression = sql<string>`
  to_char(
    round(
      (
        sum(${chargingSessions.energyAddedKwh}) * 60
      ) / nullif(sum(${chargingSessions.chargingMinutes}), 0),
      2
    ),
    'FM999999999999999990.00'
  )
`;

const issueFreePercentageExpression = sql<string>`
  to_char(
    round(
      (
        count(*) filter (
          where ${chargingSessions.issueType} = 'NONE'
        )
      )::numeric * 100 / nullif(count(*), 0),
      2
    ),
    'FM999999999999999990.00'
  )
`;

export function createAnalyticsRepository(database: AnalyticsDatabase): AnalyticsRepository {
  return {
    async getSummary(range) {
      const [summary] = await database
        .select({
          sessionCount: sessionCountExpression,
          totalEnergyKwh: totalEnergyExpression,
          totalCost: totalCostExpression,
          averageCostPerKwh: sql<string | null>`
            case
              when count(*) = 0 then null
              else ${averageCostPerKwhExpression}
            end
          `,
          averageChargingMinutes: sql<string | null>`
            case
              when count(*) = 0 then null
              else ${averageChargingMinutesExpression}
            end
          `,
          averageWaitMinutes: sql<string | null>`
            case
              when count(*) = 0 then null
              else ${averageWaitMinutesExpression}
            end
          `,
          averageObservedPowerKw: sql<string | null>`
            case
              when count(*) = 0 then null
              else ${averageObservedPowerExpression}
            end
          `,
          issueFreePercentage: sql<string | null>`
            case
              when count(*) = 0 then null
              else ${issueFreePercentageExpression}
            end
          `,
        })
        .from(chargingSessions)
        .where(and(...createConditions(range)));

      if (summary === undefined) {
        throw new Error("Database did not return an analytics summary");
      }

      return summary;
    },

    async getNetworks(range) {
      const networkExpression = sql<string>`
        coalesce(
          nullif(btrim(${stations.network}), ''),
          'Unknown network'
        )
      `;

      return database
        .select({
          network: networkExpression,
          sessionCount: sessionCountExpression,
          totalEnergyKwh: totalEnergyExpression,
          totalCost: totalCostExpression,
          averageCostPerKwh: averageCostPerKwhExpression,
          averageObservedPowerKw: averageObservedPowerExpression,
          issueFreePercentage: issueFreePercentageExpression,
        })
        .from(chargingSessions)
        .innerJoin(stations, eq(chargingSessions.stationId, stations.id))
        .where(and(...createConditions(range)))
        .groupBy(networkExpression)
        .orderBy(
          desc(sql`sum(${chargingSessions.energyAddedKwh})`),
          desc(sql`count(*)`),
          asc(networkExpression),
        );
    },

    async getStations(range) {
      return database
        .select({
          stationId: stations.id,
          name: stations.name,
          network: stations.network,
          sessionCount: sessionCountExpression,
          totalEnergyKwh: totalEnergyExpression,
          totalCost: totalCostExpression,
          averageCostPerKwh: averageCostPerKwhExpression,
          averageChargingMinutes: averageChargingMinutesExpression,
          averageWaitMinutes: averageWaitMinutesExpression,
          averageObservedPowerKw: averageObservedPowerExpression,
          issueFreePercentage: issueFreePercentageExpression,
          lastSessionAt: sql<Date>`
            max(${chargingSessions.startedAt})
          `,
        })
        .from(chargingSessions)
        .innerJoin(stations, eq(chargingSessions.stationId, stations.id))
        .where(and(...createConditions(range)))
        .groupBy(stations.id, stations.name, stations.network)
        .orderBy(
          desc(sql`count(*)`),
          desc(sql`sum(${chargingSessions.energyAddedKwh})`),
          asc(stations.name),
          asc(stations.id),
        );
    },
  };
}
