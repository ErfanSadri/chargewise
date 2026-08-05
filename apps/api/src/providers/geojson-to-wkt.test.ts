import { describe, expect, it } from "vitest";

import { geoJsonLineStringToWkt } from "./geojson-to-wkt.js";

interface InvalidGeometryCase {
  readonly description: string;
  readonly geometry: unknown;
}

const invalidGeometries: readonly InvalidGeometryCase[] = [
  {
    description: "a non-LineString geometry",
    geometry: {
      type: "Point",
      coordinates: [-118.6, 34.17],
    },
  },
  {
    description: "fewer than two points",
    geometry: {
      type: "LineString",
      coordinates: [[-118.6, 34.17]],
    },
  },
  {
    description: "nonnumeric coordinates",
    geometry: {
      type: "LineString",
      coordinates: [
        ["-118.6", 34.17],
        [-117.16, 32.72],
      ],
    },
  },
  {
    description: "longitude outside the valid range",
    geometry: {
      type: "LineString",
      coordinates: [
        [-180.01, 34.17],
        [-117.16, 32.72],
      ],
    },
  },
  {
    description: "latitude outside the valid range",
    geometry: {
      type: "LineString",
      coordinates: [
        [-118.6, 90.01],
        [-117.16, 32.72],
      ],
    },
  },
  {
    description: "nonfinite coordinates",
    geometry: {
      type: "LineString",
      coordinates: [
        [-118.6, Number.POSITIVE_INFINITY],
        [-117.16, 32.72],
      ],
    },
  },
];

describe("geoJsonLineStringToWkt", () => {
  it("converts a GeoJSON LineString while preserving longitude-latitude order", () => {
    expect(
      geoJsonLineStringToWkt({
        type: "LineString",
        coordinates: [
          [-118.6, 34.17],
          [-117.16, 32.72],
        ],
      }),
    ).toBe("LINESTRING(-118.6 34.17,-117.16 32.72)");
  });

  it("preserves the available numeric precision", () => {
    expect(
      geoJsonLineStringToWkt({
        type: "LineString",
        coordinates: [
          [-118.593153, 34.15404],
          [-118.24368, 34.05223],
          [-117.23952, 32.877207],
        ],
      }),
    ).toBe("LINESTRING(-118.593153 34.15404,-118.24368 34.05223,-117.23952 32.877207)");
  });

  it("normalizes negative zero to a stable WKT representation", () => {
    expect(
      geoJsonLineStringToWkt({
        type: "LineString",
        coordinates: [
          [-0, 0],
          [1, 1],
        ],
      }),
    ).toBe("LINESTRING(0 0,1 1)");
  });

  it.each(invalidGeometries)("rejects $description", ({ geometry }) => {
    expect(() => geoJsonLineStringToWkt(geometry)).toThrow(
      "GeoJSON geometry must be a valid LineString",
    );
  });
});
