# ChargeWise v1 Product Requirements Document

**Status:** Approved for Phase 0 design  
**Last updated:** 2026-08-02  
**Owner:** Erfan Sadri

## 1. Product statement

ChargeWise helps U.S. EV drivers who rely on public charging find compatible
chargers along a driving route and learn from their own charging history.

The product combines authoritative public station data with user-owned session
records. It does not claim to know real-time stall occupancy or guarantee that
a charger will work when the driver arrives.

## 2. Problem

Public-charging-dependent drivers often make decisions using fragmented
information. A station locator may show that a charger exists, but it does not
answer personal questions such as:

- Is this station compatible with my vehicle?
- How far is it from my route?
- Have I charged here before?
- How long did I wait during previous visits?
- What effective charging speed did I experience?
- What did charging cost me?
- Which stations and networks have been most dependable for me?

## 3. Target user

### Primary persona

An EV driver who:

- does not have dependable home charging;
- regularly uses public DC fast chargers;
- wants charging options along local and road-trip routes;
- cares about connector compatibility, detour, cost, wait time, and observed
  reliability;
- is willing to log a short session record after charging.

The initial design is grounded in Erfan's experience driving a BMW i5 and using
public charging, including Electrify America, but the implementation must work
for other users and vehicles.

## 4. Product principles

1. **Personal evidence over invented intelligence.** Display recorded values
   and explain calculations before introducing rankings.
2. **No misleading live data.** Source operating status is not presented as
   real-time stall availability.
3. **One coherent journey.** Every v1 feature supports route discovery,
   station evaluation, session logging, or personal analytics.
4. **Server protects secrets.** External API credentials never reach the
   browser.
5. **Explainable engineering.** Architecture exists to solve an identified
   problem, not to collect technologies.

## 5. Scope

### P0: required for v1

#### Account and authentication

- Register with email and password.
- Log in and log out.
- Remain authenticated across page refreshes.
- Access only user-owned vehicles, favorites, routes, and charging sessions.

#### Vehicle profiles

- Create, view, update, and delete a vehicle.
- Store nickname, make, model, year, connector types, optional usable battery
  capacity, optional efficiency, and preferred charging networks.
- Select one default vehicle.
- Use user-entered values; v1 does not maintain a vehicle-specification catalog.

#### Route and station discovery

- Accept an origin, destination, vehicle, and maximum route-corridor distance.
- Geocode the two locations.
- Generate a drivable route.
- Find publicly accessible, existing electric charging stations near that
  route.
- Normalize external station data before exposing it to the client.
- Display the route and station markers on an interactive map.
- Display a synchronized station list.
- Filter by connector compatibility, network, charging level, and route
  distance.
- Clearly display source status and the station-data refresh time.

#### Station details and favorites

- Display station identity, address, network, connectors, charging levels, port
  counts, access information, source status, and personal history.
- Add or remove a station from favorites.
- View all favorite stations.

#### Charging sessions

- Create, view, update, and delete a charging-session record.
- Record vehicle, station, start time, charging duration, wait time, energy
  added, total cost, start/end state of charge, optional odometer, issue type,
  and notes.
- Reject invalid percentages, negative amounts, nonpositive energy/duration,
  and cross-user resource access.

#### Personal analytics

- Total sessions.
- Total energy added.
- Total amount spent.
- Average cost per kWh.
- Average charging duration.
- Average wait time.
- Average observed charging power.
- Session and energy breakdown by network.
- Issue-free session percentage.
- Most-used stations and recent sessions.
- Date-range filtering.

#### Product quality

- Responsive desktop and mobile layout.
- Accessible labels, keyboard navigation, focus states, and color contrast.
- Loading, empty, validation, provider-failure, and offline-like error states.
- Automated tests for the three critical end-to-end journeys.
- Continuous integration for formatting, linting, type checking, tests, and
  production builds.
- Public deployment with health checks and structured logs.

### P1: after v1 is stable

- Save and rerun favorite routes.
- Refresh favorite station metadata in background jobs.
- Import session history from a documented CSV template.
- User-configurable station ranking based on detour, personal wait, observed
  charging performance, issues, and cost.
- Export personal session history.

### Explicit non-goals for v1

- Real-time stall occupancy.
- Reservations or charger payments.
- BMW, Electrify America, or other private account integrations.
- Receipt or website scraping.
- Native mobile applications.
- Social reviews or public crowd reports.
- Guaranteed range or battery-arrival predictions.
- Machine-learning recommendations.
- AI chatbot.

## 6. Critical user journeys and acceptance criteria

### Journey A: first route search

**Given** a new authenticated user with a saved vehicle  
**When** the user enters a valid U.S. origin and destination  
**Then** ChargeWise displays a route, distance, estimated duration, and public
charging stations near the route.

Acceptance criteria:

- Invalid or ambiguous locations receive a useful error.
- The selected vehicle's connector types affect the compatibility filter.
- The route remains visible when the station list changes.
- Selecting a marker selects the corresponding list item and vice versa.
- External failures do not crash the application or expose provider details.

### Journey B: save and revisit a station

**Given** route-search results  
**When** the user opens a station and marks it as a favorite  
**Then** it appears in the user's favorites and remains after a refresh.

Acceptance criteria:

- A station cannot be favorited twice.
- One user cannot view or mutate another user's favorites.
- Removing a favorite updates all visible favorite states.

### Journey C: log a session and view analytics

**Given** an authenticated user with a vehicle and selected station  
**When** the user records a valid charging session  
**Then** the session appears in history and changes the dashboard calculations.

Acceptance criteria:

- Ending state of charge is greater than starting state of charge.
- State-of-charge values are between 0 and 100.
- Energy and charging duration are positive.
- Cost and wait time are nonnegative.
- Observed average power equals energy divided by charging hours.
- Editing or deleting the session recalculates analytics.

## 7. Analytics definitions

- **Average cost per kWh:** total cost divided by total energy for sessions with
  energy greater than zero.
- **Observed charging power:** energy added divided by charging duration in
  hours. This is not advertised charger capacity.
- **Issue-free percentage:** sessions with `issue_type = NONE` divided by all
  sessions in the selected date range.
- **Average wait:** total recorded wait minutes divided by sessions in the
  selected date range.

Calculations must define behavior for an empty dataset and must never display
`NaN`, infinity, or misleading zeroes.

## 8. Success criteria

### Product success

- A first-time user can complete the core journey without developer assistance.
- All P0 acceptance criteria pass in production.
- Route search, favorites, session logging, and analytics use persistent data.

### Engineering success

- No external API secrets are present in client bundles or Git history.
- The default branch passes lint, type checks, automated tests, and builds.
- Cached station-only reads target a measured p95 under 750 ms.
- An uncached route search targets a measured p95 under 3 seconds, excluding a
  documented upstream outage.
- Core workflows have integration and end-to-end coverage.
- The README explains setup, architecture, tradeoffs, and limitations.

### Portfolio success

- A deployed demo is available.
- The repository shows incremental, coherent commits.
- Architecture and data-flow diagrams match the actual implementation.
- Resume bullets contain only verified features and measured results.
- The owner can explain authentication, request flow, external integrations,
  database relationships, caching, testing, and deployment.

## 9. Open items that do not block implementation

- Final public product name and visual identity.
- Production hosting provider, selected through a documented comparison before
  deployment.
- Whether P1 ranking is valuable after real session data exists.

These items may not silently change P0 requirements.
