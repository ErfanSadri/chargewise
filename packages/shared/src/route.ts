import { z } from "zod";

import { vehicleConnectorTypeSchema } from "./vehicle.js";

const maximumCorridorMeters = 100 * 1609.344;

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function hasUniqueCaseInsensitiveValues(values: readonly string[]): boolean {
  return new Set(values.map((value) => value.trim().toLowerCase())).size === values.length;
}

export const routeChargingLevelSchema = z.enum(["LEVEL_2", "DC_FAST"]);

export const routeSearchFiltersSchema = z
  .object({
    compatibleOnly: z.boolean(),
    networks: z
      .array(z.string().trim().min(1).max(120))
      .max(25)
      .refine(hasUniqueCaseInsensitiveValues, {
        message: "Networks must not contain duplicates",
      }),
    chargingLevels: z.array(routeChargingLevelSchema).max(2).refine(hasUniqueValues, {
      message: "Charging levels must not contain duplicates",
    }),
    publicOnly: z.boolean(),
    operatingOnly: z.boolean(),
  })
  .strict();

export const routeSearchRequestSchema = z
  .object({
    origin: z.string().trim().min(1).max(240),
    destination: z.string().trim().min(1).max(240),
    vehicleId: z.string().uuid(),
    corridorMeters: z.number().finite().positive().max(maximumCorridorMeters),
    filters: routeSearchFiltersSchema,
  })
  .strict();

export const routeLineStringGeometrySchema = z
  .object({
    type: z.literal("LineString"),
    coordinates: z
      .array(
        z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]),
      )
      .min(2),
  })
  .strict();

export const routeSearchLocationSchema = z
  .object({
    label: z.string().trim().min(1).max(500),
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-90).max(90),
  })
  .strict();

export const routeSearchStationSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    network: z.string().trim().min(1).max(120).nullable(),
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-90).max(90),
    distanceFromRouteMeters: z.number().finite().nonnegative(),
    connectorCodes: z.array(vehicleConnectorTypeSchema),
    compatible: z.boolean(),
    level2PortCount: z.number().int().nonnegative(),
    dcFastPortCount: z.number().int().nonnegative(),
    accessCode: z.string().trim().min(1).max(40),
    sourceStatus: z.string().trim().min(1).max(20),
    lastSyncedAt: z.string().datetime({ offset: true }),
    isFavorite: z.boolean(),
  })
  .strict();

export const routeSearchResponseSchema = z
  .object({
    data: z
      .object({
        route: z
          .object({
            geometry: routeLineStringGeometrySchema,
            distanceMeters: z.number().finite().nonnegative(),
            durationSeconds: z.number().finite().nonnegative(),
            origin: routeSearchLocationSchema,
            destination: routeSearchLocationSchema,
          })
          .strict(),
        stations: z.array(routeSearchStationSchema),
      })
      .strict(),
    meta: z
      .object({
        stationSource: z.literal("NLR_AFDC"),
        routeSource: z.literal("OPENROUTESERVICE"),
        stationCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.meta.stationCount !== value.data.stations.length) {
      context.addIssue({
        code: "custom",
        path: ["meta", "stationCount"],
        message: "Station count must match the returned station list",
      });
    }
  });

export type RouteChargingLevel = z.infer<typeof routeChargingLevelSchema>;
export type RouteSearchFilters = z.infer<typeof routeSearchFiltersSchema>;
export type RouteSearchRequest = z.infer<typeof routeSearchRequestSchema>;
export type RouteSearchResponse = z.infer<typeof routeSearchResponseSchema>;
