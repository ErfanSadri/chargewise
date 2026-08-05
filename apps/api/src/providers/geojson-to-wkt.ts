import { lineStringGeometrySchema } from "./provider-models.js";

/**
 * Converts a validated GeoJSON LineString into the WKT form required by the
 * station provider. GeoJSON and WKT both preserve longitude before latitude.
 */
export function geoJsonLineStringToWkt(geometry: unknown): string {
  const parsedGeometry = lineStringGeometrySchema.safeParse(geometry);

  if (!parsedGeometry.success) {
    throw new TypeError("GeoJSON geometry must be a valid LineString");
  }

  const points = parsedGeometry.data.coordinates.map(([longitude, latitude]) => {
    return `${formatWktNumber(longitude)} ${formatWktNumber(latitude)}`;
  });

  return `LINESTRING(${points.join(",")})`;
}

function formatWktNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}
