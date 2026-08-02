export function coordinatesToWkt(coordinates) {
  const points = coordinates.map(
    ([longitude, latitude]) => `${longitude} ${latitude}`
  );

  return `LINESTRING(${points.join(",")})`;
}