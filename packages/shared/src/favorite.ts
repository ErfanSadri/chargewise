import { z } from "zod";

import { vehicleConnectorTypeSchema } from "./vehicle.js";

export const favoritePathParametersSchema = z
  .object({
    stationId: z.string().uuid(),
  })
  .strict();

export const publicFavoriteSchema = z
  .object({
    stationId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    network: z.string().trim().min(1).max(120).nullable(),
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-90).max(90),
    connectorCodes: z.array(vehicleConnectorTypeSchema),
    level2PortCount: z.number().int().nonnegative(),
    dcFastPortCount: z.number().int().nonnegative(),
    accessCode: z.string().trim().min(1).max(40),
    sourceStatus: z.string().trim().min(1).max(40),
    lastSyncedAt: z.string().datetime({ offset: true }),
    favoritedAt: z.string().datetime({ offset: true }),
    isFavorite: z.literal(true),
  })
  .strict();

export const favoriteResponseSchema = z
  .object({
    data: publicFavoriteSchema,
  })
  .strict();

export const favoriteListResponseSchema = z
  .object({
    data: z.array(publicFavoriteSchema),
  })
  .strict();

export type PublicFavorite = z.infer<typeof publicFavoriteSchema>;
