const apiKey = process.env.OPENROUTESERVICE_API_KEY;

if (!apiKey) {
  throw new Error("Openrouteservice API key is missing.");
}

async function geocode(fields) {
  const url = new URL("https://api.heigit.org/pelias/v1/search/structured");

  for (const [name, value] of Object.entries(fields)) {
    url.searchParams.set(name, value);
  }

  url.searchParams.set("size", "1");

  const response = await fetch(url, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = await response.json();
  const result = data.features?.[0];

  if (!result) {
    throw new Error("No location was found.");
  }

  return {
    location: result.properties.label,
    coordinates: result.geometry.coordinates,
  };
}

const origin = await geocode({
  neighbourhood: "Woodland Hills",
  locality: "Los Angeles",
  region: "California",
  postalcode: "91364",
  country: "United States",
});

const destination = await geocode({
  address: "9500 Gilman Drive",
  locality: "San Diego",
  region: "California",
  postalcode: "92093",
  country: "United States",
});

console.log("Origin:", origin);
console.log("Destination:", destination);
