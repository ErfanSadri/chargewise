import { z } from "zod";

import {
  coordinateSchema,
  type GeocodedLocation,
  type GeocodingProvider,
} from "./provider-models.js";
import { parseProviderPayload, requestProviderJson, type ProviderFetch } from "./provider-http.js";

const providerName = "OPENROUTESERVICE_GEOCODING" as const;

const geocodingResponseSchema = z
  .object({
    features: z.array(
      z
        .object({
          geometry: z
            .object({
              type: z.literal("Point"),
              coordinates: coordinateSchema,
            })
            .passthrough(),
          properties: z
            .object({
              label: z.string().trim().min(1),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export interface OpenRouteServiceGeocodingProviderOptions {
  fetchFn?: ProviderFetch;
  timeoutMs?: number;
  baseUrl?: string;
  resultLimit?: number;
}

export class OpenRouteServiceGeocodingProvider implements GeocodingProvider {
  private readonly apiKey: string;
  private readonly fetchFn: ProviderFetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly resultLimit: number;

  constructor(apiKey: string, options: OpenRouteServiceGeocodingProviderOptions = {}) {
    const normalizedApiKey = apiKey.trim();

    if (normalizedApiKey.length === 0) {
      throw new TypeError("OpenRouteService API key must not be blank");
    }

    this.apiKey = normalizedApiKey;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.baseUrl = options.baseUrl ?? "https://api.heigit.org/";
    this.resultLimit = options.resultLimit ?? 5;

    if (!Number.isInteger(this.resultLimit) || this.resultLimit < 1 || this.resultLimit > 10) {
      throw new TypeError("Geocoding result limit must be an integer from 1 through 10");
    }
  }

  async geocode(query: string): Promise<GeocodedLocation[]> {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length === 0) {
      throw new TypeError("Geocoding query must not be blank");
    }

    const url = new URL("pelias/v1/search", this.baseUrl);
    url.searchParams.set("text", normalizedQuery);
    url.searchParams.set("size", String(this.resultLimit));
    url.searchParams.set("boundary.country", "US");

    const payload = await requestProviderJson({
      provider: providerName,
      url,
      fetchFn: this.fetchFn,
      timeoutMs: this.timeoutMs,
      init: {
        headers: {
          Authorization: this.apiKey,
        },
      },
    });

    const response = parseProviderPayload(geocodingResponseSchema, payload, providerName);

    return response.features.map((feature) => ({
      label: feature.properties.label,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
    }));
  }
}
