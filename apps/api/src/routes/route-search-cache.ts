import { z } from "zod";

import { lineStringGeometrySchema, type ConnectorCode } from "../providers/index.js";
import type { RouteDiscovery, RouteSearchCache } from "./route-search-service.js";

const geocodedLocationSchema = z
  .object({
    label: z.string().trim().min(1),
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-90).max(90),
  })
  .strict();

const connectorCodeSchema = z.custom<ConnectorCode>(
  (value) => value === "CCS" || value === "NACS" || value === "J1772" || value === "CHADEMO",
);

const normalizedStationSchema = z
  .object({
    sourceStationId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    streetAddress: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    postalCode: z.string().nullable(),
    countryCode: z.string().nullable(),
    network: z.string().nullable(),
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-90).max(90),
    distanceFromRouteMeters: z.number().finite().nonnegative(),
    connectorCodes: z.array(connectorCodeSchema),
    level2PortCount: z.number().int().nonnegative(),
    dcFastPortCount: z.number().int().nonnegative(),
    accessCode: z.string().trim().min(1),
    sourceStatus: z.string().trim().min(1),
    sourceUpdatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const routeDiscoverySchema = z
  .object({
    origin: geocodedLocationSchema,
    destination: geocodedLocationSchema,
    route: z
      .object({
        geometry: lineStringGeometrySchema,
        distanceMeters: z.number().finite().nonnegative(),
        durationSeconds: z.number().finite().nonnegative(),
      })
      .strict(),
    stations: z.array(normalizedStationSchema),
  })
  .strict();

export interface RouteSearchCacheRedisClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: {
      EX: number;
    },
  ): Promise<unknown>;
  del(key: string): Promise<number>;
}

export interface RouteSearchCacheOptions {
  client: RouteSearchCacheRedisClient;
  ttlSeconds: number;
}

export function createRouteSearchCache(options: RouteSearchCacheOptions): RouteSearchCache {
  if (!Number.isInteger(options.ttlSeconds) || options.ttlSeconds <= 0) {
    throw new TypeError("Route-search cache TTL must be a positive integer");
  }

  return {
    async get(key) {
      const serialized = await options.client.get(key);

      if (serialized === null) {
        return null;
      }

      let untrustedValue: unknown;

      try {
        untrustedValue = JSON.parse(serialized);
      } catch {
        await deleteInvalidEntry(options.client, key);
        return null;
      }

      const result = routeDiscoverySchema.safeParse(untrustedValue);

      if (!result.success) {
        await deleteInvalidEntry(options.client, key);
        return null;
      }

      return result.data;
    },

    async set(key, value) {
      const validatedValue: RouteDiscovery = routeDiscoverySchema.parse(value);

      await options.client.set(key, JSON.stringify(validatedValue), {
        EX: options.ttlSeconds,
      });
    },
  };
}

async function deleteInvalidEntry(client: RouteSearchCacheRedisClient, key: string): Promise<void> {
  try {
    await client.del(key);
  } catch {
    // The invalid entry is already treated as a cache miss; cleanup is best effort.
  }
}
