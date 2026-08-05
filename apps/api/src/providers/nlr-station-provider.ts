import { z } from "zod";

import {
  latitudeSchema,
  longitudeSchema,
  stationCorridorQuerySchema,
  type ConnectorCode,
  type NormalizedStation,
  type StationCorridorQuery,
  type StationProvider,
} from "./provider-models.js";
import { parseProviderPayload, requestProviderJson, type ProviderFetch } from "./provider-http.js";

const providerName = "NLR_AFDC" as const;
const metersPerMile = 1609.344;
const metersPerKilometer = 1000;

const nullableTextSchema = z.string().trim().nullable();
const nullableNonnegativeIntegerSchema = z.number().int().nonnegative().nullable();
const timestampSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be an ISO-compatible timestamp",
  });

const nlrStationSchema = z
  .object({
    id: z.number().int().positive(),
    fuel_type_code: z.literal("ELEC"),
    station_name: z.string().trim().min(1),
    street_address: nullableTextSchema,
    city: nullableTextSchema,
    state: nullableTextSchema,
    zip: nullableTextSchema,
    country: nullableTextSchema,
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    ev_network: nullableTextSchema,
    ev_connector_types: z.array(z.string().trim().min(1)).nullable(),
    ev_level2_evse_num: nullableNonnegativeIntegerSchema,
    ev_dc_fast_num: nullableNonnegativeIntegerSchema,
    access_code: z.string().trim().min(1),
    status_code: z.string().trim().min(1),
    updated_at: timestampSchema,
    distance_km: z.number().finite().nonnegative(),
  })
  .passthrough();

const nlrResponseSchema = z
  .object({
    total_results: z.number().int().nonnegative(),
    fuel_stations: z.array(nlrStationSchema),
  })
  .passthrough();

const connectorCodeMap: Readonly<Record<string, ConnectorCode | undefined>> = {
  J1772COMBO: "CCS",
  TESLA: "NACS",
  J1772: "J1772",
  CHADEMO: "CHADEMO",
};

function normalizeNullableText(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null;
  }

  return value;
}

function normalizeConnectorCodes(values: string[] | null): ConnectorCode[] {
  const normalized = new Set<ConnectorCode>();

  for (const value of values ?? []) {
    const connectorCode = connectorCodeMap[value];

    if (connectorCode !== undefined) {
      normalized.add(connectorCode);
    }
  }

  return [...normalized];
}

export interface NlrStationProviderOptions {
  fetchFn?: ProviderFetch;
  timeoutMs?: number;
  baseUrl?: string;
}

export class NlrStationProvider implements StationProvider {
  private readonly apiKey: string;
  private readonly fetchFn: ProviderFetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(apiKey: string, options: NlrStationProviderOptions = {}) {
    const normalizedApiKey = apiKey.trim();

    if (normalizedApiKey.length === 0) {
      throw new TypeError("NLR API key must not be blank");
    }

    this.apiKey = normalizedApiKey;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.baseUrl = options.baseUrl ?? "https://developer.nlr.gov/";
  }

  async findAlongRoute(input: StationCorridorQuery): Promise<NormalizedStation[]> {
    const parsedInput = stationCorridorQuerySchema.safeParse(input);

    if (!parsedInput.success) {
      throw new TypeError("Station corridor query is invalid");
    }

    const parameters = new URLSearchParams({
      route: parsedInput.data.routeWkt,
      distance: String(parsedInput.data.corridorMeters / metersPerMile),
      fuel_type: "ELEC",
      access: "public",
      status: "E",
      return_type: "all",
      limit: String(parsedInput.data.limit),
    });

    const url = new URL("api/alt-fuel-stations/v1/nearby-route.json", this.baseUrl);

    const payload = await requestProviderJson({
      provider: providerName,
      url,
      fetchFn: this.fetchFn,
      timeoutMs: this.timeoutMs,
      init: {
        method: "POST",
        headers: {
          "X-Api-Key": this.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: parameters,
      },
    });

    const response = parseProviderPayload(nlrResponseSchema, payload, providerName);

    return response.fuel_stations.map((station) => ({
      sourceStationId: String(station.id),
      name: station.station_name,
      streetAddress: normalizeNullableText(station.street_address),
      city: normalizeNullableText(station.city),
      state: normalizeNullableText(station.state),
      postalCode: normalizeNullableText(station.zip),
      countryCode: normalizeNullableText(station.country),
      network: normalizeNullableText(station.ev_network),
      longitude: station.longitude,
      latitude: station.latitude,
      distanceFromRouteMeters: station.distance_km * metersPerKilometer,
      connectorCodes: normalizeConnectorCodes(station.ev_connector_types),
      level2PortCount: station.ev_level2_evse_num ?? 0,
      dcFastPortCount: station.ev_dc_fast_num ?? 0,
      accessCode: station.access_code,
      sourceStatus: station.status_code,
      sourceUpdatedAt: station.updated_at,
    }));
  }
}
