# ChargeWise v1 Delivery Backlog

**Status:** Ready for issue creation  
**Schedule:** 2026-08-02 through 2026-08-13

## Working method

Each item has a learning objective and definition of done. Work proceeds in
dependency order. A later ticket may not be started merely because an earlier
ticket feels difficult.

## Milestone 0 — Design and proof of feasibility

### CHG-001 — Lock product scope

Learning objective: distinguish a product requirement from an implementation
idea.

Tasks:

- Review the product statement, P0 scope, P1 scope, and non-goals.
- Confirm the three critical user journeys.
- Confirm analytics definitions.
- Record proposed scope changes in the backlog rather than silently adding them.

Definition of done:

- Product requirements have no conflicting statements.
- Every P0 feature supports a critical journey.
- No P0 feature depends on a non-goal.

### CHG-002 — Validate external API feasibility

Learning objective: learn how to evaluate an API before designing around it.

Tasks:

- Obtain development credentials through official provider processes.
- Send one geocoding request.
- Send one directions request and inspect the GeoJSON coordinate order.
- Convert a known GeoJSON `LineString` into WKT.
- Send one NLR nearby-route request for electric stations.
- Save redacted representative fixtures for tests.
- Document rate limits, timeouts, required attribution, and error formats.

Definition of done:

- A real route produces a non-fabricated station response.
- No key appears in source code, terminal transcripts committed to Git, or
  browser-delivered code.
- The provider adapter inputs/outputs can be described in plain language.

### CHG-003 — Lock architecture and contracts

Learning objective: understand boundaries among transport, business logic,
persistence, and external systems.

Tasks:

- Review architecture, API contract, and data model.
- Verify the documented idempotent favorite behavior.
- Record external timeout/cache decisions after the feasibility spike.
- Create implementation issues from the remaining backlog.

Definition of done:

- Every P0 endpoint maps to a user journey.
- Every user-owned resource has an authorization rule.
- Every database relationship has deletion behavior.

## Milestone 1 — Engineering foundation

### CHG-010 — Initialize TypeScript monorepo

Learning objective: understand packages, build boundaries, and dependency
direction.

Tasks:

- Initialize Git and pnpm workspace.
- Create `web`, `api`, `shared`, `database`, and `config` packages.
- Configure strict TypeScript.
- Configure ESLint and Prettier.
- Add environment validation.
- Add scripts for development, lint, type-check, test, and build.

Definition of done:

- Clean install succeeds.
- All packages type-check.
- No package imports against the documented dependency rules.

### CHG-011 — Add local infrastructure

Learning objective: understand the roles of the application, database, PostGIS,
and Redis.

Tasks:

- Add Docker Compose services for PostgreSQL/PostGIS and Redis.
- Add health checks and named volumes.
- Add `.env.example` without secrets.
- Verify PostGIS extension and Redis connectivity.

Definition of done:

- One documented command starts dependencies.
- API can verify both dependencies without exposing credentials.

### CHG-012 — Add API and web shells

Learning objective: trace the first browser-to-server request.

Tasks:

- Create Express application factory and server entry point.
- Add request IDs, structured logging, security headers, JSON size limit, and
  centralized error handling.
- Implement `/api/v1/health`.
- Create React router, page shell, error boundary, and API client.
- Render API health information in a development-only diagnostic page.

Definition of done:

- Browser can make a typed request to the API.
- API unit/integration test passes.
- Production build succeeds.

### CHG-013 — Configure CI

Learning objective: understand why automated checks protect the main branch.

Tasks:

- Run install, format check, lint, type check, tests, and builds in GitHub
  Actions.
- Cache dependencies without caching build correctness.
- Add pull-request template with testing and learning-checkpoint sections.

Definition of done:

- A deliberately broken lint/test change fails CI.
- A clean branch passes all checks.

## Milestone 2 — Authentication and vehicles

### CHG-020 — Implement database foundation and migrations

Learning objective: understand schemas, constraints, migrations, and repository
boundaries.

### CHG-021 — Implement session authentication

Learning objective: distinguish hashing, cookies, sessions, authentication, and
authorization.

Tasks:

- Add shared request and response schemas for register, login, logout, and the
  current user.
- Add a user repository, Argon2id password hashing, and a Redis-backed session
  store.
- Add authentication middleware and the four `/api/v1/auth` endpoints.
- Enforce cookie, origin, rate-limit, and generic authentication-error rules.
- Test the complete lifecycle against disposable PostgreSQL and Redis data.

Definition of done:

- Register, login, logout, and current-user requests match the API contract.
- A valid session survives a browser refresh until its fixed expiry.
- Login rotates the current browser session, and logout prevents token replay.
- Passwords and session tokens are never returned or logged; only Argon2id
  password hashes are stored.
- Invalid credentials and invalid sessions use generic unauthenticated errors.
- Unit, API, PostgreSQL, and Redis integration tests cover important success,
  validation, conflict, rate-limit, origin, expiry, and dependency-failure paths.

### CHG-022 — Implement vehicle API

Learning objective: implement CRUD while enforcing ownership and database
constraints.

### CHG-023 — Implement authentication and vehicle UI

Learning objective: connect forms, client validation, server validation,
authenticated routing, and server-state invalidation.

Milestone definition of done:

- Register/login/logout works.
- An authenticated user can manage their own vehicles.
- Cross-user tests prove isolation.
- Refreshing the page preserves a valid session.

## Milestone 3 — Route and station discovery

### CHG-030 — Implement provider adapters

Learning objective: normalize untrusted external JSON behind interfaces.

### CHG-031 — Implement GeoJSON-to-WKT conversion

Learning objective: understand geographic coordinate order, formats, and pure
function testing.

### CHG-032 — Implement route-search service

Learning objective: orchestrate multiple providers, persistence, caching, and
failure behavior.

### CHG-033 — Implement route-search UI

Learning objective: manage asynchronous form state and distinguish client from
server state.

### CHG-034 — Implement map and synchronized station list

Learning objective: render GeoJSON, markers, viewport state, and accessible map
alternatives.

### CHG-035 — Implement filters and station details

Learning objective: derive filtered presentation without corrupting source
data.

Milestone definition of done:

- A real U.S. route displays real public EV stations.
- Markers and list selections remain synchronized.
- Invalid addresses and upstream failures are handled.
- Provider adapters have fixtures and contract tests.

## Milestone 4 — Favorites and charging history

### CHG-040 — Implement favorites API and UI

Learning objective: understand many-to-many association tables and idempotent
UI behavior.

### CHG-041 — Implement charging-session API

Learning objective: enforce invariants across validation, services, and database
constraints.

### CHG-042 — Implement session entry and history UI

Learning objective: build a complex typed form and invalidate related cached
queries correctly.

Milestone definition of done:

- Favorites persist.
- Valid charging sessions can be created, edited, and deleted.
- Invalid and cross-user operations fail safely.

## Milestone 5 — Analytics

### CHG-050 — Implement analytics queries

Learning objective: use SQL aggregation, grouping, null handling, and decimal
arithmetic.

### CHG-051 — Implement dashboard

Learning objective: present derived data accurately with useful empty states and
accessible charts.

Milestone definition of done:

- Analytics match independently calculated fixture values.
- Create/edit/delete operations update the dashboard.
- Empty data produces meaningful output without invalid numbers.

## Milestone 6 — Hardening and release

### CHG-060 — Security and accessibility review

### CHG-061 — Critical Playwright flows

### CHG-062 — Performance measurement and caching

### CHG-063 — Production deployment

### CHG-064 — Documentation, demo, and resume evidence

Release definition of done:

- All P0 acceptance criteria pass against production.
- Three critical Playwright journeys pass.
- Secrets scan and dependency audit pass or have documented resolutions.
- Measured performance results are recorded without exaggeration.
- README, diagrams, demo assets, and resume bullets match the implementation.

## Daily target sequence

| Date   | Primary target            | Required checkpoint                           |
| ------ | ------------------------- | --------------------------------------------- |
| Aug 2  | CHG-001 through CHG-003   | Explain the complete route-search flow        |
| Aug 3  | CHG-010 through CHG-013   | Explain monorepo and process boundaries       |
| Aug 4  | CHG-020 through CHG-023   | Explain auth vs authorization                 |
| Aug 5  | CHG-030 and CHG-031       | Explain normalization and coordinate order    |
| Aug 6  | CHG-032 through CHG-034   | Trace one route request end to end            |
| Aug 7  | CHG-035 and CHG-040       | Explain client/server state and relationships |
| Aug 8  | CHG-041 and CHG-042       | Explain validation at three layers            |
| Aug 9  | CHG-050 and CHG-051       | Recalculate dashboard metrics manually        |
| Aug 10 | UI/error-state polish     | Demonstrate mobile and failure behavior       |
| Aug 11 | CHG-060 and CHG-061       | Explain threat model and test pyramid         |
| Aug 12 | CHG-062 and CHG-063       | Explain measured bottleneck and deployment    |
| Aug 13 | CHG-064 and defect buffer | Deliver two-minute project walkthrough        |

This schedule is a target, not permission to merge incomplete work. Scope is
reduced from P1 before quality criteria are skipped.
