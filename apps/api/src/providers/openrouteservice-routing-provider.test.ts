import { describe, expect, it } from "vitest";

import { OpenRouteServiceRoutingProvider } from "./openrouteservice-routing-provider.js";
import {
  createCapturingFetch,
  createJsonResponse,
  readProviderFixture,
} from "./provider-test-helpers.js";

describe("OpenRouteServiceRoutingProvider", () => {
  it("normalizes a saved GeoJSON route fixture", async () => {
    const fixture = await readProviderFixture("ors-directions-success.json");
    const { fetchFn, requests } = createCapturingFetch(() => createJsonResponse(fixture));
    const provider = new OpenRouteServiceRoutingProvider("ors-secret", { fetchFn });

    const route = await provider.createRoute({
      origin: [-118.593153, 34.15404],
      destination: [-117.23952, 32.877207],
    });

    expect(route).toEqual({
      geometry: {
        type: "LineString",
        coordinates: [
          [-118.593153, 34.15404],
          [-118.24368, 34.05223],
          [-117.23952, 32.877207],
        ],
      },
      distanceMeters: 219514.4,
      durationSeconds: 8928.2,
    });

    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (request === undefined) {
      throw new Error("Expected one captured routing request");
    }

    const url = new URL(String(request.input));
    const headers = new Headers(request.init?.headers);

    expect(url.pathname).toBe("/openrouteservice/v2/directions/driving-car/geojson");
    expect(request.init?.method).toBe("POST");
    expect(headers.get("Authorization")).toBe("ors-secret");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(request.init?.body))).toEqual({
      coordinates: [
        [-118.593153, 34.15404],
        [-117.23952, 32.877207],
      ],
    });
  });

  it("rejects invalid longitude before calling the provider", async () => {
    const { fetchFn, requests } = createCapturingFetch(() => createJsonResponse({}));
    const provider = new OpenRouteServiceRoutingProvider("ors-secret", { fetchFn });

    await expect(
      provider.createRoute({
        origin: [-218.593153, 34.15404],
        destination: [-117.23952, 32.877207],
      }),
    ).rejects.toThrow("Route coordinates are invalid");
    expect(requests).toHaveLength(0);
  });
});
