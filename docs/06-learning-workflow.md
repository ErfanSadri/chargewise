# ChargeWise Learning and Implementation Workflow

## Purpose

ChargeWise is not successful if the application works but its owner cannot
explain how or why. Every ticket therefore combines implementation with a
specific learning outcome.

## The learning loop for every ticket

### 1. Concept

Before code, answer:

- What problem does this component solve?
- Where does it run: browser, API process, database, cache, or provider?
- What inputs does it trust, and what inputs must it validate?
- What could fail?

The explanation starts in plain language, followed by the minimum technical
vocabulary needed for implementation and interviews.

### 2. Contract

Define before implementation:

- input shape;
- output shape;
- ownership/security rule;
- success behavior;
- invalid-input behavior;
- dependency-failure behavior.

### 3. Small implementation

Implement in reviewable increments. A typical backend feature order is:

1. schema/type;
2. pure business logic;
3. repository/provider;
4. application service;
5. controller and route;
6. UI/API client;
7. integration/end-to-end test.

### 4. Verification

Run automated tests and manually verify the user-visible behavior. A green test
does not replace inspecting whether the feature actually satisfies its
acceptance criteria.

### 5. Teach-back

At the end, Erfan should be able to answer:

- What did we build?
- Why did we build it this way?
- Trace one request through the relevant components.
- What prevents invalid or unauthorized behavior?
- What tradeoff did we make?
- What would change at larger scale?

If the explanation is unclear, the ticket is not fully complete.

## Code explanation format

When introducing code, explanations will cover:

1. **File responsibility** — why the file exists.
2. **Imports** — which dependencies cross the file boundary.
3. **Types/schemas** — what data is expected and how it is validated.
4. **Main control flow** — what happens in execution order.
5. **Failure paths** — how errors are represented and handled.
6. **Tests** — what behavior the tests prove and what they do not prove.
7. **Interview version** — a concise way to explain the decision.

Code will be read in meaningful blocks rather than explaining punctuation one
character at a time. Any unfamiliar syntax can be expanded separately.

## Rules for generated assistance

- Do not paste code that has not been reviewed together.
- Prefer small diffs over entire-file rewrites.
- Name the requirement and ticket before changing code.
- Explain important alternatives and why one was selected.
- Never invent API responses, package behavior, performance results, or test
  results.
- Validate external behavior against documentation and a controlled spike.
- Record architectural changes instead of silently changing direction.
- Keep comments focused on why; readable code should show what.

## Git workflow

Suggested branch format:

```text
feature/CHG-022-vehicle-api
fix/CHG-032-provider-timeout
docs/CHG-003-api-contract
```

Commit format:

```text
feat(vehicles): add ownership-scoped vehicle creation
test(auth): reject requests without a valid session
docs(routes): document GeoJSON to WKT conversion
```

Each pull request includes:

- linked ticket;
- user-visible behavior;
- important design choice;
- validation performed;
- tests added/run;
- screenshot for UI work;
- teach-back summary in Erfan's own words.

## Daily session structure

This project fits the previously established schedule with gym at 12 PM.

### Morning deep-work block

- 15 minutes: recall yesterday's architecture without notes.
- 30–45 minutes: lesson and contract for today's first ticket.
- 90–120 minutes: implementation in small steps.
- 15 minutes: test and checkpoint commit.

### 12 PM gym and reset

The gym block remains protected. Use the break to avoid turning one difficult
bug into an unproductive all-day session.

### Afternoon build block

- Review the next acceptance criterion.
- Implement and test the next vertical slice.
- Update documentation when behavior changes.
- Push coherent commits.

### End-of-day checkpoint

- Run format, lint, type check, tests, and build.
- Record completed and blocked acceptance criteria.
- Give a two-minute verbal teach-back.
- Write the exact first task for tomorrow.

## Core knowledge checkpoints

By the end of ChargeWise, Erfan should be comfortable explaining:

- browser vs server responsibilities;
- React component state vs server state;
- HTTP methods, status codes, cookies, and REST contracts;
- TypeScript compile-time types vs Zod runtime validation;
- password hashing vs encryption;
- authentication vs authorization;
- relational keys, constraints, indexes, and migrations;
- PostGIS points, coordinate order, and distance queries;
- repositories, services, controllers, and dependency direction;
- external API normalization, timeouts, retries, and caching;
- SQL aggregation and decimal arithmetic;
- unit, integration, contract, and end-to-end tests;
- containers, environment variables, CI, and deployment;
- performance measurement rather than performance guessing.

## Blocker protocol

When blocked for more than 30 focused minutes:

1. State expected behavior.
2. State actual behavior and preserve the exact error.
3. Identify the narrowest failing boundary.
4. Create the smallest reproduction.
5. Consult primary documentation.
6. Change one variable at a time.
7. Add a regression test after the cause is understood.

The goal is not to avoid bugs. The goal is to learn a repeatable debugging
process and retain evidence of the solution.
