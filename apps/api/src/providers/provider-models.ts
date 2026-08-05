import { z } from "zod";

export const longitudeSchema = z.number().finite().min(-180).max(180);
export const latitudeSchema = z.number().finite().min(-90).max(90);
export const coordinateSchema = z.tuple([longitudeSchema, latitudeSchema]);

export const lineStringGeometrySchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(coordinateSchema).min(2),
});

export const routeProviderInputSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
});

const metersPerMile = 1609.344;

export const stationCorridorQuerySchema = z.object({
  routeWkt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => /^LINESTRING\s*\(/i.test(value), {
      message: "Route must be a WKT LINESTRING",
    }),
  corridorMeters: z
    .number()
    .finite()
    .positive()
    .max(100 * metersPerMile),
  limit: z.number().int().min(1).max(200).default(200),
});

export type Coordinate = z.infer<typeof coordinateSchema>;
export type LineStringGeometry = z.infer<typeof lineStringGeometrySchema>;
export type RouteProviderInput = z.input<typeof routeProviderInputSchema>;
export type StationCorridorQuery = z.input<typeof stationCorridorQuerySchema>;

export type ConnectorCode = "CCS" | "NACS" | "J1772" | "CHADEMO";

export interface GeocodedLocation {
  label: string;
  longitude: number;
  latitude: number;
}

export interface NormalizedRoute {
  geometry: LineStringGeometry;
  distanceMeters: number;
  durationSeconds: number;
}

export interface NormalizedStation {
  sourceStationId: string;
  name: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  network: string | null;
  longitude: number;
  latitude: number;
  distanceFromRouteMeters: number;
  connectorCodes: ConnectorCode[];
  level2PortCount: number;
  dcFastPortCount: number;
  accessCode: string;
  sourceStatus: string;
  sourceUpdatedAt: string;
}

export interface GeocodingProvider {
  geocode(query: string): Promise<GeocodedLocation[]>;
}

export interface RoutingProvider {
  createRoute(input: RouteProviderInput): Promise<NormalizedRoute>;
}

export interface StationProvider {
  findAlongRoute(input: StationCorridorQuery): Promise<NormalizedStation[]>;
}
