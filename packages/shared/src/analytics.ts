import { z } from "zod";

function createFixedDecimalSchema(decimalPlaces: number) {
  return z.string().regex(new RegExp(`^(?:0|[1-9]\\d{0,17})\\.\\d{${decimalPlaces}}$`, "u"));
}

const decimal2Schema = createFixedDecimalSchema(2);
const decimal3Schema = createFixedDecimalSchema(3);
const decimal4Schema = createFixedDecimalSchema(4);

export const analyticsDateRangeQuerySchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from !== undefined && value.to !== undefined && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end date must not be before the start date",
      });
    }
  });

export const analyticsSummarySchema = z
  .object({
    sessionCount: z.number().int().nonnegative(),
    totalEnergyKwh: decimal3Schema,
    totalCost: decimal2Schema,
    averageCostPerKwh: decimal4Schema.nullable(),
    averageChargingMinutes: decimal2Schema.nullable(),
    averageWaitMinutes: decimal2Schema.nullable(),
    averageObservedPowerKw: decimal2Schema.nullable(),
    issueFreePercentage: decimal2Schema.nullable(),
  })
  .strict();

export const analyticsSummaryResponseSchema = z
  .object({
    data: analyticsSummarySchema,
  })
  .strict();

export const analyticsNetworkBreakdownSchema = z
  .object({
    network: z.string().trim().min(1).max(120),
    sessionCount: z.number().int().positive(),
    totalEnergyKwh: decimal3Schema,
    totalCost: decimal2Schema,
    averageCostPerKwh: decimal4Schema,
    averageObservedPowerKw: decimal2Schema,
    issueFreePercentage: decimal2Schema,
  })
  .strict();

export const analyticsNetworksResponseSchema = z
  .object({
    data: z.array(analyticsNetworkBreakdownSchema),
  })
  .strict();

export const analyticsStationBreakdownSchema = z
  .object({
    stationId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    network: z.string().trim().min(1).max(120).nullable(),
    sessionCount: z.number().int().positive(),
    totalEnergyKwh: decimal3Schema,
    totalCost: decimal2Schema,
    averageCostPerKwh: decimal4Schema,
    averageChargingMinutes: decimal2Schema,
    averageWaitMinutes: decimal2Schema,
    averageObservedPowerKw: decimal2Schema,
    issueFreePercentage: decimal2Schema,
    lastSessionAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const analyticsStationsResponseSchema = z
  .object({
    data: z.array(analyticsStationBreakdownSchema),
  })
  .strict();

export type AnalyticsDateRangeQuery = z.infer<typeof analyticsDateRangeQuerySchema>;
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;
export type AnalyticsSummaryResponse = z.infer<typeof analyticsSummaryResponseSchema>;
export type AnalyticsNetworkBreakdown = z.infer<typeof analyticsNetworkBreakdownSchema>;
export type AnalyticsNetworksResponse = z.infer<typeof analyticsNetworksResponseSchema>;
export type AnalyticsStationBreakdown = z.infer<typeof analyticsStationBreakdownSchema>;
export type AnalyticsStationsResponse = z.infer<typeof analyticsStationsResponseSchema>;
