# ChargeWise v1 API Contract

**Status:** Phase 0 contract draft  
**Base path:** `/api/v1`  
**Content type:** `application/json`

## 1. Conventions

Successful single-resource response:

```json
{
  "data": {}
}
```

Successful collection response:

```json
{
  "data": [],
  "meta": {
    "nextCursor": null
  }
}
```

Error response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  },
  "requestId": "req_..."
}
```

Every response includes an `X-Request-ID` header containing a server-generated
identifier. The `requestId` in an error response matches that header so a client
can report the identifier without receiving internal error details.

JSON request bodies are limited to 100 KiB. Malformed JSON returns `400 Bad
Request`, and a body over the limit returns `413 Payload Too Large`; both use the
`VALIDATION_ERROR` envelope. Browser access is allowed only for the configured
web origin through CORS response headers.

Dates use ISO 8601. Distances are meters. Durations are seconds or explicitly
named minutes. Currency values are serialized as decimal strings to avoid
floating-point ambiguity.

## 2. Authentication

### `POST /auth/register`

Request:

```json
{
  "email": "driver@example.com",
  "password": "a-valid-password"
}
```

Response: `201 Created` with public user data and an authenticated session
cookie.

Errors: `400 VALIDATION_ERROR`, `409 CONFLICT`, `429 RATE_LIMITED`.

### `POST /auth/login`

Request uses the same fields. Response: `200 OK` and a renewed authenticated
session. Invalid credentials return a generic `401 UNAUTHENTICATED`.

### `POST /auth/logout`

Invalidates the server session and clears the cookie. Response: `204 No
Content`.

### `GET /auth/me`

Returns the current public user representation or `401 UNAUTHENTICATED`.

## 3. Vehicles

### `POST /vehicles`

```json
{
  "nickname": "My i5",
  "make": "BMW",
  "model": "i5 eDrive40",
  "year": 2025,
  "batteryCapacityKwh": "81.20",
  "efficiencyMiPerKwh": "3.10",
  "connectorTypes": ["CCS", "J1772"],
  "preferredNetworks": ["Electrify America"],
  "isDefault": true
}
```

Endpoints:

```text
GET    /vehicles
POST   /vehicles
GET    /vehicles/:vehicleId
PATCH  /vehicles/:vehicleId
DELETE /vehicles/:vehicleId
```

All read and mutation queries are scoped to the authenticated user.

## 4. Route search

### `POST /routes/search`

Request:

```json
{
  "origin": "Woodland Hills, CA",
  "destination": "San Diego, CA",
  "vehicleId": "6f719184-e691-4c73-bf4f-4e353c40cd99",
  "corridorMeters": 8000,
  "filters": {
    "compatibleOnly": true,
    "networks": [],
    "chargingLevels": ["DC_FAST"],
    "publicOnly": true,
    "operatingOnly": true
  }
}
```

Response:

```json
{
  "data": {
    "route": {
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-118.6, 34.17],
          [-117.16, 32.72]
        ]
      },
      "distanceMeters": 210000,
      "durationSeconds": 9000,
      "origin": {
        "label": "Woodland Hills, Los Angeles, California",
        "longitude": -118.6,
        "latitude": 34.17
      },
      "destination": {
        "label": "San Diego, California",
        "longitude": -117.16,
        "latitude": 32.72
      }
    },
    "stations": [
      {
        "id": "ecba119c-963d-4931-acb8-1320791258be",
        "name": "Example Charging Station",
        "network": "Example Network",
        "longitude": -117.9,
        "latitude": 33.8,
        "distanceFromRouteMeters": 1500,
        "connectorCodes": ["CCS"],
        "compatible": true,
        "level2PortCount": 0,
        "dcFastPortCount": 8,
        "accessCode": "public",
        "sourceStatus": "E",
        "lastSyncedAt": "2026-08-02T20:00:00Z",
        "isFavorite": false
      }
    ]
  },
  "meta": {
    "stationSource": "NLR_AFDC",
    "routeSource": "OPENROUTESERVICE",
    "stationCount": 1
  }
}
```

The example coordinates and values illustrate the contract; they are not demo
claims or hard-coded production data.

Possible errors:

- `400 VALIDATION_ERROR` for invalid inputs.
- `404 NOT_FOUND` when the vehicle is not owned by the user.
- `422 LOCATION_NOT_RESOLVED` when geocoding cannot resolve an address.
- `503 PROVIDER_UNAVAILABLE` for routing/station-provider failures.

## 5. Stations

```text
GET /stations/nearby?latitude={n}&longitude={n}&radiusMeters={n}
GET /stations/:stationId
```

`GET /stations/:stationId` returns normalized source details plus authenticated
personal fields:

- `isFavorite`
- `sessionCount`
- `lastVisitedAt`
- `averageObservedPowerKw`
- `averageWaitMinutes`
- `issueFreePercentage`

Personal metrics are `null` when insufficient data exists.

## 6. Favorites

```text
GET    /favorites
PUT    /favorites/:stationId
DELETE /favorites/:stationId
```

- `PUT` returns `200 OK` with the favorite representation whether it creates the
  relationship or finds that it already exists.
- `DELETE` returns `204 No Content` whether or not the favorite existed.
- Both mutations are idempotent so a safe UI retry cannot create duplicates or
  fail solely because the desired state was already reached.

## 7. Charging sessions

### `POST /charging-sessions`

```json
{
  "vehicleId": "6f719184-e691-4c73-bf4f-4e353c40cd99",
  "stationId": "ecba119c-963d-4931-acb8-1320791258be",
  "startedAt": "2026-08-01T19:00:00Z",
  "chargingMinutes": 31,
  "waitMinutes": 8,
  "energyAddedKwh": "42.700",
  "totalCost": "0.00",
  "startingSoc": 18,
  "endingSoc": 79,
  "odometerMiles": 15420,
  "issueType": "NONE",
  "notes": "No wait after the first charger became available."
}
```

Endpoints:

```text
GET    /charging-sessions?from={date}&to={date}&cursor={cursor}
POST   /charging-sessions
GET    /charging-sessions/:chargingSessionId
PATCH  /charging-sessions/:chargingSessionId
DELETE /charging-sessions/:chargingSessionId
```

The service verifies that the authenticated user owns the selected vehicle.
The station may be shared because station records are public-source data.

## 8. Analytics

```text
GET /analytics/summary?from={date}&to={date}
GET /analytics/networks?from={date}&to={date}
GET /analytics/stations?from={date}&to={date}
```

Summary response:

```json
{
  "data": {
    "sessionCount": 4,
    "totalEnergyKwh": "155.400",
    "totalCost": "24.10",
    "averageCostPerKwh": "0.1551",
    "averageChargingMinutes": "29.50",
    "averageWaitMinutes": "6.25",
    "averageObservedPowerKw": "79.00",
    "issueFreePercentage": "75.00"
  }
}
```

Empty datasets return zero for additive counts/totals and `null` for undefined
ratios or averages.

## 9. Health

### `GET /health`

This endpoint is public and accepts no request body or query parameters. It
reports whether the API process is running and whether its required dependencies
are ready. Responses include `Cache-Control: no-store` so clients do not reuse a
stale readiness result.

When the database and cache both respond, the API returns `200 OK`:

```json
{
  "data": {
    "process": "up",
    "readiness": "ready",
    "dependencies": {
      "database": "up",
      "cache": "up"
    }
  }
}
```

When either dependency check fails, the API returns `503 Service Unavailable`
using the same response shape. `readiness` becomes `not_ready`, and each failed
dependency is reported as `down` while a responsive dependency remains `up`.

The database check verifies PostgreSQL/PostGIS connectivity, and the cache check
verifies Redis connectivity. Responses never include credentials, connection
strings, hostnames, ports, stack traces, or raw dependency errors.

## 10. Contract implementation rule

Every endpoint requires:

- request schema;
- response schema or serialized DTO;
- authenticated/unauthenticated behavior;
- ownership behavior;
- expected status codes;
- service-level test;
- integration test for important success and failure paths.

If implementation requires the contract to change, the contract changes first
and the reason is recorded in the associated issue or architecture decision.
