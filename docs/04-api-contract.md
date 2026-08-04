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

Authentication uses a server-side session. The browser receives only an opaque
session token; it never receives a password hash or a Redis session record.

Authentication request objects reject unknown fields. Email addresses are
trimmed, lowercased, validated as email addresses, and limited to 320
characters before storage. Passwords must contain 12 through 128 characters.
Passwords are passed to Argon2id exactly as submitted and are never trimmed,
normalized, returned, or logged.

The public user representation is:

```json
{
  "data": {
    "id": "00000000-0000-0000-0000-000000000000",
    "email": "driver@example.com",
    "createdAt": "2026-08-04T12:00:00.000Z",
    "updatedAt": "2026-08-04T12:00:00.000Z"
  }
}
```

Authentication responses include `Cache-Control: no-store`.

### Session behavior

- The cookie name is `chargewise_session`.
- The cookie uses `HttpOnly`, `SameSite=Lax`, and `Path=/`, with no `Domain`
  attribute. It uses `Secure` in production.
- A session has a fixed lifetime of seven days. Its cookie `Max-Age` and Redis
  TTL represent the same lifetime. Reading the session does not extend it.
- Each successful registration or login creates a fresh token from at least 32
  cryptographically random bytes. If that browser already presented a session,
  that session is revoked. Sessions on other devices remain valid.
- The raw token exists only in the cookie. Redis keys use an HMAC-SHA-256 digest
  derived with `SESSION_SECRET`; Redis stores only the user ID and session
  creation time under an `auth:session:` namespace.
- Authentication loads the Redis session and then the current PostgreSQL user.
  A missing user invalidates the stale session.
- Missing, malformed, expired, revoked, or user-orphaned sessions all return the
  same generic `401 UNAUTHENTICATED` response.

Registration and session creation are one operation from the client's point of
view. If the session cannot be stored, registration does not return success or
set a cookie, and the new database user is rolled back.

In production, every state-changing authentication request must include an
`Origin` header exactly matching `WEB_ORIGIN`. A missing or different origin
returns `403 FORBIDDEN` before the handler can change state. Non-production
requests may omit `Origin`, but a supplied origin must still match.

Registration is limited to five attempts per 15 minutes per client IP. Login is
limited to ten attempts per 15 minutes per client IP. These counters live in
Redis. A blocked request returns `429 RATE_LIMITED` with `Retry-After`. A Redis
or PostgreSQL failure returns `503 SERVICE_UNAVAILABLE` and never authenticates
the request.

### `POST /auth/register`

Request:

```json
{
  "email": "driver@example.com",
  "password": "a-valid-password"
}
```

Response: `201 Created` with the public user representation and an authenticated
session cookie.

Duplicate normalized email addresses return `409 CONFLICT`.

Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `409 CONFLICT`,
`429 RATE_LIMITED`, `503 SERVICE_UNAVAILABLE`.

### `POST /auth/login`

Request uses the same fields. Response: `200 OK` with the public user
representation and a fresh authenticated session. A nonexistent email and an
incorrect password return the same generic `401 UNAUTHENTICATED` response.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`,
`429 RATE_LIMITED`, `503 SERVICE_UNAVAILABLE`.

### `POST /auth/logout`

Invalidates the server session and clears the cookie with the same cookie
attributes used when setting it. Response: `204 No Content` with no body.
Logout is idempotent: a missing, malformed, or expired cookie still clears the
cookie and returns `204`. If a presented session cannot be invalidated because
Redis is unavailable, the cookie is cleared and the response is
`503 SERVICE_UNAVAILABLE`.

Errors: `403 FORBIDDEN`, `503 SERVICE_UNAVAILABLE`.

### `GET /auth/me`

Returns `200 OK` with the current public user representation.

Errors: `401 UNAUTHENTICATED`, `503 SERVICE_UNAVAILABLE`.

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
