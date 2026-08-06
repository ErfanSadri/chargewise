# ChargeWise portfolio walkthrough

Ticket: CHG-065  
Live application: https://chargewise.onrender.com

## Two-minute demo script

### 0:00–0:20 — Problem

“ChargeWise is a full-stack EV route-planning and charging-analytics application. I built it around a problem I experience as an EV driver who depends on public charging: station data is fragmented, and a locator does not tell me whether a charger is compatible, how far it is from my route, or what my own experience at that network has been.”

### 0:20–0:40 — Architecture

“The React application and Express API are deployed together as one same-origin Docker service on Render. PostgreSQL and PostGIS run on Neon, while Upstash Redis stores server-side sessions, rate limits, and regenerable route-search cache entries. The API integrates openrouteservice for geocoding and routing and the NLR station API for public U.S. charging data.”

### 0:40–1:10 — Route planning

“After signing in, I choose a saved vehicle and enter a U.S. origin and destination. The API geocodes both locations, generates the route, converts its geometry for the station provider, finds chargers within the selected corridor, normalizes the data, and applies connector compatibility for my vehicle. The map and accessible station list remain synchronized, and I can filter by network, connector, charging level, access, operation status, or compatibility.”

### 1:10–1:35 — Personal workflow

“I can save a useful station as a favorite, refresh the application, and keep that state because it is persisted to PostgreSQL. From a station, I can log an actual charging session with energy, cost, duration, wait time, state of charge, and any issue I encountered.”

### 1:35–1:50 — Analytics

“The dashboard turns those records into personal metrics such as total energy, spending, cost per kilowatt-hour, observed charging power, average wait, issue-free percentage, network breakdowns, most-used stations, and recent sessions.”

### 1:50–2:00 — Engineering close

“The project includes user-scoped authorization, Argon2id passwords, Redis sessions, Zod contracts, PostGIS, provider boundaries, structured logs, production health checks, Docker deployment, GitHub Actions, 347 automated tests across database, API, and web layers, plus three critical Playwright journeys.”

## Recommended live-demo order

1. Open the signed-in Home page.
2. Show the saved BMW i5 vehicle.
3. Search `Woodland Hills, CA` to `UC San Diego, La Jolla, CA`.
4. Explain the corridor selector and vehicle compatibility.
5. Select a station from the list and show the synchronized map marker.
6. Toggle a favorite and refresh.
7. Open charging history and add or edit one session.
8. Open the dashboard and explain two or three calculated metrics.
9. Close on the GitHub README architecture and verification sections.

## Architecture talking points

### Why one same-origin service?

- Simpler production deployment for a portfolio-scale application
- No separate frontend hosting or production CORS dependency
- Express can serve the React build and API from one origin
- Still maintains internal web, API, shared-contract, and database boundaries

### Why Redis?

Redis solves three concrete needs:

1. opaque server-side authentication sessions;
2. authentication rate-limit counters;
3. short-lived route-discovery cache entries.

User favorites and charging sessions remain PostgreSQL sources of truth.

### Why PostgreSQL and PostGIS?

- Strong relational ownership rules
- Transactions and constraints for user data
- PostGIS geography points and geospatial indexes for station positions
- SQL aggregation for dashboard analytics
- Idempotent station upserts using provider station IDs

### Why provider interfaces?

External APIs have different shapes, failures, limits, and coordinate conventions. Provider adapters isolate those details and return normalized internal models. This keeps business logic testable without network access and prevents raw upstream responses from becoming public API contracts.

## Important tradeoffs

### Cache policy

Only safely regenerable discovery data is cached. Vehicle compatibility, persisted IDs, filters, favorites, and charging sessions are applied after the cache read. The default TTL is 15 minutes.

### Location handling

Production geocoding is restricted to U.S. candidates to match the product scope and prevent ambiguous international results such as the wrong “Woodland Hills.”

### Free hosting

Render’s free service can sleep, so the first request may be slow. This is acceptable for a portfolio demo but would not be appropriate for latency-sensitive production traffic.

### Live station data

NLR source status is not real-time stall occupancy. ChargeWise deliberately avoids presenting it as live availability.

## Interview questions to prepare for

### “Walk me through one route-search request.”

Cover authentication, Zod validation, cache key normalization, cache hit or miss, geocoding, routing, GeoJSON-to-WKT conversion, station-provider request, normalization, persistence, compatibility, favorites, response serialization, and structured performance logging.

### “How do you prevent users from accessing each other’s data?”

Every user-owned database operation includes the authenticated user ID or an equivalent ownership check. Knowing a UUID is not authorization.

### “What happens when Redis fails?”

Health checks report Redis as unavailable. During route search, cache read/write failures degrade gracefully because route discovery can still use the providers; authentication sessions cannot operate without Redis.

### “How did you test external integrations without flaky CI?”

Provider adapters have deterministic fixtures and contract tests. Playwright uses fixture providers while still exercising the real browser, Express server, PostgreSQL, Redis, sessions, and persistence. Live-provider network tests are outside the normal CI suite.

### “What would you change at larger scale?”

- Paid always-on application instances
- Separate migration jobs rather than startup migrations
- Production latency dashboards and alerting
- A reviewed commercial map-tile provider
- Provider-aware retries, quotas, and circuit breaking
- Background metadata refresh for saved stations
- Pagination or clustering for large station result sets

## Verified resume bullets

- Built and deployed ChargeWise, a full-stack TypeScript EV route-planning platform integrating openrouteservice and NLR public charging data with React, Express, PostgreSQL/PostGIS, Redis, Docker, and managed cloud services.
- Implemented secure Redis-backed session authentication, Argon2id password hashing, user-scoped authorization, rate limiting, shared Zod contracts, structured logging, and production health checks.
- Developed route-based charger discovery with normalized provider adapters, geospatial station persistence, connector compatibility, synchronized map/list filtering, favorites, charging-session tracking, and personal analytics.
- Added 347 database, API, and web tests plus three Playwright critical journeys, CI quality gates, tracked-secret scanning, production dependency auditing, and controlled cache-performance measurement.

## LinkedIn project description

ChargeWise is a production-deployed full-stack EV route-planning and charging-analytics platform. It lets users save an EV, find compatible public chargers along a U.S. route, explore synchronized map and station results, save favorites, record charging sessions, and analyze personal cost, energy, wait time, observed charging speed, and reliability. Built with React, TypeScript, Express, PostgreSQL/PostGIS, Redis, Docker, Render, Neon, and Upstash, with provider integrations, secure server-side sessions, automated testing, CI, performance measurement, and production health checks.
