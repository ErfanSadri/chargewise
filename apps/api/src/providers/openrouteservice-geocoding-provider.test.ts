import { describe, expect, it } from "vitest";

import { OpenRouteServiceGeocodingProvider } from "./openrouteservice-geocoding-provider.js";
import {
  createCapturingFetch,
  createJsonResponse,
  readProviderFixture,
} from "./provider-test-helpers.js";

describe("OpenRouteServiceGeocodingProvider", () => {
  it("normalizes a saved geocoding fixture and sends credentials server-side", async () => {
    const fixture = await readProviderFixture("ors-geocode-success.json");
    const { fetchFn, requests } = createCapturingFetch(() => createJsonResponse(fixture));
    const provider = new OpenRouteServiceGeocodingProvider("ors-secret", { fetchFn });

    const locations = await provider.geocode("  Woodland Hills, CA  ");

    expect(locations).toEqual([
      {
        label: "Woodland Hills, Los Angeles, California, United States",
        longitude: -118.593153,
        latitude: 34.15404,
      },
      {
        label: "Woodland Hills, California, United States",
        longitude: -118.60592,
        latitude: 34.16834,
      },
    ]);

    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (request === undefined) {
      throw new Error("Expected one captured geocoding request");
    }

    const url = new URL(String(request.input));
    const headers = new Headers(request.init?.headers);

    expect(url.pathname).toBe("/pelias/v1/search");
    expect(url.searchParams.get("text")).toBe("Woodland Hills, CA");
    expect(url.searchParams.get("size")).toBe("5");
    expect(headers.get("Authorization")).toBe("ors-secret");
  });

  it("returns an empty list when the provider has no candidates", async () => {
    const { fetchFn } = createCapturingFetch(() =>
      createJsonResponse({ type: "FeatureCollection", features: [] }),
    );
    const provider = new OpenRouteServiceGeocodingProvider("ors-secret", { fetchFn });

    await expect(provider.geocode("Unknown location")).resolves.toEqual([]);
  });

  it("rejects malformed provider coordinates", async () => {
    const { fetchFn } = createCapturingFetch(() =>
      createJsonResponse({
        features: [
          {
            geometry: { type: "Point", coordinates: [34.15404, -218.593153] },
            properties: { label: "Invalid" },
          },
        ],
      }),
    );
    const provider = new OpenRouteServiceGeocodingProvider("ors-secret", { fetchFn });

    await expect(provider.geocode("Invalid")).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
  });
});
