import { coordinatesToWkt } from "./wkt.mjs";
const apiKey = process.env.OPENROUTESERVICE_API_KEY;
const nlrApiKey = process.env.NLR_API_KEY;

if (!apiKey) {
  throw new Error("Openrouteservice API key is missing.");
}

if (!nlrApiKey) {
  throw new Error("NLR API key is missing.");
}

const origin = [-118.593153, 34.15404];
const destination = [-117.23952, 32.877207];

const response = await fetch(
  "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson",
  {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [origin, destination],
    }),
  },
);

if (!response.ok) {
  throw new Error(`Request failed with status ${response.status}`);
}

const data = await response.json();
const route = data.features?.[0];

if (!route) {
  throw new Error("No route was found.");
}

const distanceMiles = route.properties.summary.distance / 1609.344;

const durationHours = route.properties.summary.duration / 3600;

console.log("Distance:", distanceMiles.toFixed(1), "miles");
console.log("Duration:", durationHours.toFixed(2), "hours");
console.log("Geometry:", route.geometry.type);
console.log("Route points:", route.geometry.coordinates.length);

const routeWkt = coordinatesToWkt(route.geometry.coordinates);

console.log("WKT length:", routeWkt.length);
console.log("WKT preview:", routeWkt.slice(0, 100) + "...");

const stationParameters = new URLSearchParams({
  route: routeWkt,
  distance: "2",
  fuel_type: "ELEC",
  access: "public",
  status: "E",
  ev_charging_level: "dc_fast",
  ev_connector_type: "J1772COMBO",
  limit: "200",
});

const stationResponse = await fetch(
  "https://developer.nlr.gov/api/alt-fuel-stations/v1/nearby-route.json",
  {
    method: "POST",
    headers: {
      "X-Api-Key": nlrApiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: stationParameters,
  },
);

if (!stationResponse.ok) {
  throw new Error(`Station request failed with status ${stationResponse.status}`);
}

const stationData = await stationResponse.json();

console.log("Total stations near route:", stationData.total_results);

console.log("Stations returned:", stationData.fuel_stations.length);

for (const station of stationData.fuel_stations.slice(0, 10)) {
  console.log(
    `- ${station.station_name} | ${station.ev_network ?? "Unknown network"} | ${station.city}, ${station.state}`,
  );
}
