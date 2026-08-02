# ADR-001: Use TypeScript for the Web and API

**Status:** Accepted  
**Date:** 2026-08-02

## Context

ChargeWise must demonstrate end-to-end full-stack engineering while remaining
small enough to complete at high quality. The owner already has Python/Flask
backend experience and wants stronger evidence with React, Node.js, and modern
TypeScript development.

Python with FastAPI and TypeScript with Node/Express are both credible backend
choices. The decision is specific to this project's learning and portfolio
goals, not a claim that software companies generally prefer one language.

## Decision

Use TypeScript across:

- the React frontend;
- the Node.js/Express API;
- shared API schemas and data-transfer types;
- tests and configuration where supported.

Use Zod at runtime because TypeScript types disappear after compilation and
cannot validate untrusted HTTP or external-provider JSON by themselves.

## Consequences

### Benefits

- One language across the main request flow.
- Shared API contracts without duplicating type definitions.
- Strong signal for full-stack TypeScript roles.
- Less context switching during a short delivery window.
- Easier refactoring across client/server contract changes.

### Costs

- Does not expand the project's Python portfolio evidence.
- Shared types can create accidental coupling if database models are exposed to
  the browser.
- Node's event loop and asynchronous error handling must be understood rather
  than hidden.

### Mitigations

- Share only transport schemas, never database entities or server configuration.
- Keep explicit application-service and provider boundaries.
- Include lessons on promises, the event loop, runtime validation, and error
  propagation.

## Rejected alternatives

### FastAPI backend

Technically suitable and especially strong for Python/data integrations, but it
would split the main project across languages and duplicate API-contract work.
The owner's existing Flask experience makes the incremental portfolio value
smaller for this specific project.

### Next.js full-stack application

Capable, but its server/client abstractions could hide backend boundaries that
are important learning goals. React/Vite plus an explicit Express API makes the
network and deployment boundaries easier to learn and explain.

### Microservices

Rejected because the product does not require independent service deployment or
scaling. It would increase operational work without improving the core user
journey.
