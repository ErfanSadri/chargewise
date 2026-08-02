# External API Spike Results

**Date:** August 2, 2026

## Goal

Verify that ChargeWise can generate a driving route and find compatible public EV chargers near it.

## Test Route

- Origin: Woodland Hills, California
- Destination: UC San Diego
- Vehicle connector: CCS

## Geocoding Results

Free-text searches sometimes returned incorrect locations. Structured searches produced:

- Woodland Hills: `[-118.593153, 34.15404]`
- UC San Diego: `[-117.23952, 32.877207]`

The application should allow users to confirm a location instead of automatically selecting the first result.

## Route Results

- Distance: 136.4 miles
- Estimated duration: 2.48 hours
- Geometry type: `LineString`
- Route points: 1,656
- WKT length: 36,053 characters

Because the WKT route is long, it must be sent to NLR using a POST request.

## Charging Station Results

Initial public electric-station search:

- 2,188 stations within two miles of the route

After applying DC fast and CCS filters:

- 139 compatible stations within two miles of the route

Filters used:

- Fuel type: Electric
- Access: Public
- Status: Available
- Charging level: DC Fast
- Connector: CCS
- Route distance: 2 miles

## Product Decisions

- Show users geocoding choices before confirming a location.
- Use the full road route instead of a straight origin-to-destination line.
- Filter stations using the selected vehicle’s connector.
- Retrieve all matching stations before displaying results.
- Sort stations by their position along the trip.
- Do not describe source operating status as real-time charger availability.

## Result

The core ChargeWise route-to-charger workflow is technically feasible.