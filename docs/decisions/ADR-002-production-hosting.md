# ADR-002: Production hosting topology

- Status: Accepted
- Date: 2026-08-05
- Ticket: CHG-063

## Context

ChargeWise needs a public portfolio deployment that preserves the implementation
already validated in local and browser tests:

- React sends relative `/api/v1` requests with credentialed cookies.
- Express owns authentication, authorization, provider credentials, and
  structured logs.
- PostgreSQL requires PostGIS.
- Redis stores sessions, rate limits, and short-lived route discovery records.
- Database migrations must run as an explicit release step.

Splitting the browser and API across different origins would add cross-site
cookie, CORS, and deployment coordination without improving the v1 user journey.

## Decision

Deploy one Dockerized Render web service that serves both the compiled Vite
application and the Express API from the same HTTPS origin.

Use:

- Neon PostgreSQL with PostGIS;
- Neon's pooled connection string for application traffic;
- Neon's direct connection string for the release migration;
- Upstash Redis through its TLS `rediss://` endpoint;
- Render's HTTP health check at `/api/v1/health`;
- Render's pre-deploy command for Drizzle migrations.

Render supplies `PORT` and `RENDER_EXTERNAL_URL`. ChargeWise maps those platform
variables to its existing `API_PORT` and `WEB_ORIGIN` contract.

## Alternatives considered

### Separate static site and API service

Rejected for v1. It adds cross-origin cookie behavior, separate deployments, and
more configuration while the browser already uses same-origin API paths.

### Railway or Fly.io

Both can run the container, but Render's Docker web service, Blueprint,
pre-deploy command, and HTTP readiness check map directly to the current release
requirements. The container remains portable if the hosting provider changes.

### Hosting PostgreSQL and Redis inside the application container

Rejected. Render instances have ephemeral filesystems, and these services need
independent managed persistence and lifecycle controls.

## Consequences

- The production browser and API share one origin and one deployable artifact.
- Static asset delivery depends on the API instance being awake.
- The free Render instance can cold-start after inactivity and is appropriate
  for a portfolio demonstration, not a latency-sensitive production workload.
- Runtime and migration database URLs are configured separately.
- A failed migration or failed dependency health check blocks a healthy release.
- Provider keys remain server-only environment variables.
- Deployment smoke checks and P0 manual verification are required before the
  public URL is presented as complete.

## References

- Render web services: <https://render.com/docs/web-services>
- Render Docker services: <https://render.com/docs/docker>
- Render health checks: <https://render.com/docs/health-checks>
- Render Blueprint specification: <https://render.com/docs/blueprint-spec>
- Neon PostGIS: <https://neon.com/docs/extensions/postgis>
- Neon connection pooling: <https://neon.com/docs/connect/connection-pooling>
- Upstash Redis client connections:
  <https://upstash.com/docs/redis/howto/connect-client>
