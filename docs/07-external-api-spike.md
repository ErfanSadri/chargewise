# CHG-002 External API Feasibility Spike

**Status:** First implementation task  
**Timebox:** 90 focused minutes  
**Production code:** None

## 1. Why this comes before application code

Route search is the project's highest-risk feature because it depends on two
external systems that use different geographic formats. If their inputs,
outputs, limits, or error behavior do not support the product, discovering that
after building the UI and database would cause expensive rework.

A spike is a short, controlled investigation used to answer technical
questions. Its output is evidence and a decision, not production architecture.

## 2. Questions the spike must answer

1. Can openrouteservice geocode both a street address and a city/landmark?
2. Does its driving-direction response contain a GeoJSON `LineString` in
   `[longitude, latitude]` order?
3. Can that line be converted without loss into the WKT form required by the
   NLR nearby-route endpoint?
4. Does the NLR response contain enough information for the v1 station card and
   filters?
5. What do authentication, rate-limit, timeout, attribution, and error responses
   look like for each provider?
6. How large can a route become before the nearby-route request should use POST
   rather than GET?

## 3. Controlled test journey

Use one personally meaningful route for the spike:

```text
Origin: Woodland Hills, California
Destination: UC San Diego, La Jolla, California
Fuel type: ELEC
Access: public
Source status: existing/operating
```

The purpose is not to test BMW range estimation. The purpose is to prove the
geocoding -> route geometry -> station corridor chain.

## 4. Credential safety

- Create an openrouteservice development key through the
  [official developer portal](https://openrouteservice.org/dev/).
- Request an NLR key through the
  [official signup page](https://developer.nlr.gov/signup/). NLR permits its
  documented `DEMO_KEY` for a small initial experiment, but its quota is much
  lower than a personal key and it is not the application's production plan.
- Store them only in a local `.env` file.
- Add `.env` to `.gitignore` before the first commit.
- Add only placeholder names to `.env.example`:

```text
OPENROUTESERVICE_API_KEY=
NLR_API_KEY=
```

- Never paste a real key into documentation, source code, screenshots, chat, or
  Git commits.
- Inspect `git diff --cached` before every commit that touches configuration.

## 5. Step-by-step investigation

### Step A — Geocoding

Send an origin query and a destination query to the official geocoding
endpoint.

Record:

- HTTP status;
- chosen display label;
- longitude and latitude;
- whether multiple candidates are returned;
- the structure of an invalid/no-result response;
- provider attribution requirements.

Learning checkpoint: explain why a geocoder can return several correct-looking
results and why the server should not silently select an obviously ambiguous
candidate.

### Step B — Directions

Send the chosen origin/destination coordinates to the driving directions
endpoint and request GeoJSON.

Record:

- route geometry type;
- first and last coordinate pairs;
- distance unit and value;
- duration unit and value;
- error behavior for reversed or malformed coordinates.

Learning checkpoint: explain why GeoJSON uses longitude before latitude and how
swapping them can produce a valid-looking but geographically incorrect point.

### Step C — Pure GeoJSON-to-WKT conversion

Given:

```json
{
  "type": "LineString",
  "coordinates": [
    [-118.6, 34.17],
    [-117.16, 32.72]
  ]
}
```

The converter should produce:

```text
LINESTRING(-118.60 34.17,-117.16 32.72)
```

The production converter must later reject:

- a non-`LineString` geometry;
- fewer than two points;
- nonnumeric coordinates;
- longitude outside -180 through 180;
- latitude outside -90 through 90.

Learning checkpoint: explain why this converter should be a pure function and
why it is ideal for unit tests.

### Step D — Stations near the route

Submit the WKT route to the NLR nearby-route endpoint using POST when the full
route would make a GET URL too long.

Use filters equivalent to:

- electric fuel;
- public access;
- existing/operating status;
- a documented corridor distance.

Record whether the response supplies:

- stable station ID;
- station name and address;
- latitude/longitude;
- network;
- connector codes;
- Level 2 and DC fast port counts;
- access and operating status;
- source update timestamp;
- route distance or enough information to calculate/filter it.

Learning checkpoint: distinguish source operating status from real-time stall
availability.

### Step E — Failure and limit behavior

For each provider, safely observe or document:

- missing-key response;
- invalid-input response;
- no-result response;
- rate-limit response from documentation rather than intentionally exhausting
  a quota;
- documented timeout/retry guidance;
- response-size or route-length constraints.

Do not repeatedly call an endpoint to force a rate limit.

## 6. Evidence to preserve

Save redacted fixtures under the future test tree:

```text
tests/fixtures/providers/
├── ors-geocode-success.json
├── ors-directions-success.json
├── nlr-nearby-route-success.json
└── provider-error-examples.md
```

Fixtures must remove request keys and any sensitive headers. They may retain
public station and geographic data needed to test response normalization.

## 7. Exit criteria

CHG-002 passes when:

- the test journey returns a real route and at least one real station, or a
  documented source-data reason explains an empty result;
- the exact transformation between provider formats is understood;
- the v1 station fields can be mapped from evidence rather than memory;
- limitations and attribution requirements are recorded;
- redacted fixtures are suitable for deterministic tests;
- no credential has entered source control.

If a criterion fails, we update the architecture before scaffolding route-search
production code.

## 8. Official references

- openrouteservice geocoder:
  <https://giscience.github.io/openrouteservice/api-reference/endpoints/geocoder/>
- openrouteservice directions:
  <https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types>
- NLR Alternative Fuel Stations API:
  <https://developer.nlr.gov/docs/transportation/alt-fuel-stations-v1/>
- NLR API key usage and rate limits:
  <https://developer.nlr.gov/docs/api-key/>
  <https://developer.nlr.gov/docs/rate-limits/>
