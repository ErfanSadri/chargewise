# Critical Playwright journeys

Ticket: CHG-061

## Purpose

ChargeWise uses Playwright for the three P0 browser journeys rather than
repeating component-level implementation tests. Each test exercises the real
React application, Express API, authentication cookie, PostgreSQL persistence,
Redis sessions/cache, and browser navigation.

External route providers are replaced only in the E2E runtime with typed,
deterministic provider implementations. This keeps browser tests independent
of provider credentials, rate limits, outages, and changing public datasets.
Production configuration rejects fixture-provider mode.

## Covered journeys

1. A new user registers, creates a default CCS vehicle, searches a route, sees
   route metrics, and opens a compatible station.
2. A user saves a route station, refreshes the browser, reruns the route, and
   sees the favorite restored from PostgreSQL.
3. A user logs a charging session from a selected station, sees it in history,
   and verifies that the persisted session changes dashboard totals and station
   analytics.

## Infrastructure isolation

The E2E preparation script:

- creates the dedicated `chargewise_e2e` database when necessary;
- applies the real Drizzle migrations;
- truncates application tables before the run;
- clears Redis database 15;
- leaves the normal local `chargewise` database and Redis database 0 alone.

Local defaults expect the existing Compose services on PostgreSQL port 5433 and
Redis port 6379. CI supplies isolated service URLs explicitly.

## Commands

```text
pnpm exec playwright install chromium
pnpm e2e
pnpm e2e:headed
```

The browser suite is intentionally not part of `pnpm check`, because that
command remains usable without infrastructure or a browser. CI runs Playwright
as a separate job after the normal quality job succeeds.

## What the tests prove

The tests prove that the three critical flows work through the public UI and
HTTP boundaries using real persistence, sessions, authorization, and derived
analytics.

They do not prove third-party provider availability, every browser/device,
production networking, deployment configuration, or exhaustive accessibility.
Those remain separate contract, manual, performance, and production checks.
