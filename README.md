# ChargeWise

ChargeWise is a full-stack EV charging intelligence platform for drivers who
depend on public charging. It helps a driver find compatible chargers along a
route, save useful stations, record real charging sessions, and understand
personal cost, charging speed, wait time, and reliability.

This repository is being developed as both a production-style portfolio
project and a guided full-stack learning project. Features are implemented from
written requirements and acceptance criteria; the project does not add
technology solely for resume keywords.

## Product status

**Current phase:** Phase 0 — product and technical design

No application feature should be implemented until the corresponding
requirement, API behavior, data ownership rule, and acceptance criteria have
been documented.

## Planned stack

- React, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS
- Node.js, Express, TypeScript, Zod
- PostgreSQL with PostGIS, Drizzle ORM
- Redis for authenticated sessions and caching
- MapLibre GL JS with OpenFreeMap tiles
- openrouteservice for geocoding and routing
- NLR Alternative Fuel Stations API for U.S. charging-station data
- Vitest, Supertest, React Testing Library, and Playwright
- Docker Compose and GitHub Actions

## Local prerequisites

- Node.js 22.22.0 or newer
- pnpm 11
- Docker with Docker Compose

## Local infrastructure

Start PostgreSQL with PostGIS and Redis in the background:

```bash
docker compose up -d
```

PostgreSQL is available at `127.0.0.1:5433`, and Redis is available at
`127.0.0.1:6379`.

Check their status:

```bash
docker compose ps
```

Stop the containers without deleting their named volumes:

```bash
docker compose down
```

## Source-of-truth documents

1. [`docs/01-product-requirements.md`](docs/01-product-requirements.md)
2. [`docs/02-architecture.md`](docs/02-architecture.md)
3. [`docs/03-data-model.md`](docs/03-data-model.md)
4. [`docs/04-api-contract.md`](docs/04-api-contract.md)
5. [`docs/05-delivery-backlog.md`](docs/05-delivery-backlog.md)
6. [`docs/06-learning-workflow.md`](docs/06-learning-workflow.md)
7. [`docs/07-external-api-spike.md`](docs/07-external-api-spike.md)
8. [`docs/decisions/ADR-001-full-stack-typescript.md`](docs/decisions/ADR-001-full-stack-typescript.md)

## Core user journey

1. Create an account.
2. Add an electric vehicle profile.
3. Search an origin and destination.
4. View compatible public chargers along the generated route.
5. Filter and inspect stations, then save favorites.
6. Record an actual charging session.
7. Review personal charging analytics.

## Definition of complete

ChargeWise v1 is complete only when the core journey works in production, the
critical flows have automated tests, secrets remain server-side, the repository
contains clear documentation, and the implementation can be explained without
relying on generated code as a black box.
