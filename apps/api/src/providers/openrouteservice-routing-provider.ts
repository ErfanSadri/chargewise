import { z } from "zod";

import {
  lineStringGeometrySchema,
  routeProviderInputSchema,
  type NormalizedRoute,
  type RouteProviderInput,
  type RoutingProvider,
} from "./provider-models.js";
import { parseProviderPayload, requestProviderJson, type ProviderFetch } from "./provider-http.js";

const providerName = "OPENROUTESERVICE_ROUTING" as const;

const routingResponseSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z
      .array(
        z
          .object({
            type: z.literal("Feature"),
            geometry: lineStringGeometrySchema,
            properties: z
              .object({
                summary: z
                  .object({
                    distance: z.number().finite().nonnegative(),
                    duration: z.number().finite().nonnegative(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export interface OpenRouteServiceRoutingProviderOptions {
  fetchFn?: ProviderFetch;
  timeoutMs?: number;
  baseUrl?: string;
}

export class OpenRouteServiceRoutingProvider implements RoutingProvider {
  private readonly apiKey: string;
  private readonly fetchFn: ProviderFetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(apiKey: string, options: OpenRouteServiceRoutingProviderOptions = {}) {
    const normalizedApiKey = apiKey.trim();

    if (normalizedApiKey.length === 0) {
      throw new TypeError("OpenRouteService API key must not be blank");
    }

    this.apiKey = normalizedApiKey;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.baseUrl = options.baseUrl ?? "https://api.heigit.org/";
  }

  async createRoute(input: RouteProviderInput): Promise<NormalizedRoute> {
    const parsedInput = routeProviderInputSchema.safeParse(input);

    if (!parsedInput.success) {
      throw new TypeError("Route coordinates are invalid");
    }

    const url = new URL("openrouteservice/v2/directions/driving-car/geojson", this.baseUrl);

    const payload = await requestProviderJson({
      provider: providerName,
      url,
      fetchFn: this.fetchFn,
      timeoutMs: this.timeoutMs,
      init: {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [parsedInput.data.origin, parsedInput.data.destination],
        }),
      },
    });

    const response = parseProviderPayload(routingResponseSchema, payload, providerName);
    const route = response.features[0];

    if (route === undefined) {
      throw new Error("Routing response schema accepted an empty feature list");
    }

    return {
      geometry: route.geometry,
      distanceMeters: route.properties.summary.distance,
      durationSeconds: route.properties.summary.duration,
    };
  }
}
