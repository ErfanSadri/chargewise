import {
  routeSearchRequestSchema,
  type PublicVehicle,
  type RouteChargingLevel,
  type RouteSearchRequest,
  type RouteSearchResponse,
} from "@chargewise/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { ApiError, getApiErrorMessage, isUnauthenticatedError } from "../api/api-client.ts";
import { searchRoute } from "../api/route-client.ts";
import { listVehicles, vehiclesQueryKey } from "../api/vehicle-client.ts";
import "./RouteSearchPage.css";

const metersPerMile = 1609.344;
const chargingLevelOptions: readonly {
  value: RouteChargingLevel;
  label: string;
}[] = [
  {
    value: "DC_FAST",
    label: "DC fast charging",
  },
  {
    value: "LEVEL_2",
    label: "Level 2 charging",
  },
];

function getVehicleDescription(vehicle: PublicVehicle): string {
  return `${vehicle.nickname} — ${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

function getNetworks(formData: FormData): string[] {
  return String(formData.get("networks") ?? "")
    .split(",")
    .map((network) => network.trim())
    .filter((network) => network !== "");
}

function getValidationMessage(): string {
  return "Review the origin, destination, vehicle, corridor, and search preferences.";
}

function getRouteSearchErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "LOCATION_NOT_RESOLVED") {
      return error.message;
    }

    if (error.code === "PROVIDER_UNAVAILABLE") {
      return "Routing and charging-station data are temporarily unavailable. Try again.";
    }

    if (error.code === "NOT_FOUND") {
      return "The selected vehicle could not be found. Refresh your vehicles and try again.";
    }
  }

  return getApiErrorMessage(error, "ChargeWise could not complete the route search.");
}

function formatDistance(distanceMeters: number): string {
  return `${(distanceMeters / metersPerMile).toFixed(1)} mi`;
}

function formatDuration(durationSeconds: number): string {
  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function getStationCountLabel(stationCount: number): string {
  return `${stationCount} ${stationCount === 1 ? "station" : "stations"} found`;
}

interface RouteResultSummaryProps {
  response: RouteSearchResponse;
}

function RouteResultSummary({ response }: RouteResultSummaryProps) {
  const { route } = response.data;

  return (
    <section aria-labelledby="route-result-heading" aria-live="polite" className="route-result">
      <div className="route-result__heading">
        <div>
          <p className="eyebrow">Route ready</p>
          <h2 id="route-result-heading">
            {route.origin.label} to {route.destination.label}
          </h2>
        </div>

        <span className="route-result__count">
          {getStationCountLabel(response.meta.stationCount)}
        </span>
      </div>

      <dl className="route-result__metrics">
        <div>
          <dt>Distance</dt>
          <dd>{formatDistance(route.distanceMeters)}</dd>
        </div>
        <div>
          <dt>Estimated drive time</dt>
          <dd>{formatDuration(route.durationSeconds)}</dd>
        </div>
        <div>
          <dt>Route source</dt>
          <dd>OpenRouteService</dd>
        </div>
        <div>
          <dt>Station source</dt>
          <dd>NLR AFDC</dd>
        </div>
      </dl>

      <p className="route-result__next">
        The interactive map and synchronized station list are the next step.
      </p>
    </section>
  );
}

export function RouteSearchPage() {
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const vehiclesQuery = useQuery({
    queryKey: vehiclesQueryKey,
    queryFn: ({ signal }) => listVehicles(signal),
  });

  const routeSearchMutation = useMutation({
    mutationFn: (input: RouteSearchRequest) => searchRoute(input),
  });

  const vehicles = vehiclesQuery.data ?? [];
  const preferredVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ??
    vehicles.find((vehicle) => vehicle.isDefault) ??
    vehicles[0];
  const effectiveVehicleId = preferredVehicle?.id ?? "";

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setValidationMessage(null);
    routeSearchMutation.reset();

    const formData = new FormData(event.currentTarget);
    const corridorMiles = Number(formData.get("corridorMiles"));

    const validation = routeSearchRequestSchema.safeParse({
      origin: String(formData.get("origin") ?? ""),
      destination: String(formData.get("destination") ?? ""),
      vehicleId: String(formData.get("vehicleId") ?? ""),
      corridorMeters: corridorMiles * metersPerMile,
      filters: {
        compatibleOnly: formData.get("compatibleOnly") === "on",
        networks: getNetworks(formData),
        chargingLevels: formData.getAll("chargingLevels").map(String),
        publicOnly: formData.get("publicOnly") === "on",
        operatingOnly: formData.get("operatingOnly") === "on",
      },
    });

    if (!validation.success) {
      setValidationMessage(getValidationMessage());
      return;
    }

    routeSearchMutation.mutate(validation.data);
  }

  if (vehiclesQuery.isError && isUnauthenticatedError(vehiclesQuery.error)) {
    return null;
  }

  return (
    <section aria-labelledby="route-search-heading" className="route-search-page">
      <header className="route-search-page__header">
        <p className="eyebrow">Route planner</p>
        <h1 id="route-search-heading">Find charging stations along your drive.</h1>
        <p>
          Choose a saved vehicle, enter your trip, and let ChargeWise combine routing with
          compatible public charging data.
        </p>
      </header>

      {vehiclesQuery.isPending && (
        <div aria-busy="true" aria-live="polite" className="route-search-state">
          <p>Loading your vehicles…</p>
        </div>
      )}

      {vehiclesQuery.isError && (
        <div className="route-search-state">
          <h2>We could not load your vehicles.</h2>
          <p>
            {getApiErrorMessage(
              vehiclesQuery.error,
              "ChargeWise could not reach the vehicle service.",
            )}
          </p>
          <button
            className="button button--secondary"
            onClick={() => {
              void vehiclesQuery.refetch();
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      )}

      {vehiclesQuery.isSuccess && vehicles.length === 0 && (
        <div className="route-search-state route-search-state--empty">
          <p className="eyebrow">Vehicle required</p>
          <h2>Add an EV before planning a route.</h2>
          <p>ChargeWise uses its connector types to determine which stations are compatible.</p>
          <Link className="button button--primary" to="/vehicles">
            Add a vehicle
          </Link>
        </div>
      )}

      {vehiclesQuery.isSuccess && vehicles.length > 0 && (
        <>
          <form className="route-search-form" noValidate onSubmit={handleSubmit}>
            <div className="route-search-form__locations">
              <div className="form-field">
                <label htmlFor="route-origin">Origin</label>
                <input
                  autoComplete="street-address"
                  id="route-origin"
                  maxLength={240}
                  name="origin"
                  placeholder="Woodland Hills, CA"
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="route-destination">Destination</label>
                <input
                  autoComplete="street-address"
                  id="route-destination"
                  maxLength={240}
                  name="destination"
                  placeholder="UC San Diego, La Jolla, CA"
                  required
                />
              </div>
            </div>

            <div className="route-search-form__trip">
              <div className="form-field">
                <label htmlFor="route-vehicle">Vehicle</label>
                <select
                  id="route-vehicle"
                  name="vehicleId"
                  onChange={(event) => {
                    setSelectedVehicleId(event.currentTarget.value);
                  }}
                  value={effectiveVehicleId}
                >
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {getVehicleDescription(vehicle)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="route-corridor">Search corridor</label>
                <div className="input-with-unit">
                  <input
                    defaultValue="5"
                    id="route-corridor"
                    inputMode="decimal"
                    max="100"
                    min="0.1"
                    name="corridorMiles"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span>miles</span>
                </div>
                <p className="form-field__hint">
                  Stations within this distance of the route are considered.
                </p>
              </div>
            </div>

            <details className="route-search-form__filters">
              <summary>Search preferences</summary>

              <div className="route-search-form__filter-content">
                <fieldset>
                  <legend>Charging levels</legend>
                  <div className="checkbox-grid">
                    {chargingLevelOptions.map((option) => (
                      <label className="checkbox-option" key={option.value}>
                        <input
                          defaultChecked={option.value === "DC_FAST"}
                          name="chargingLevels"
                          type="checkbox"
                          value={option.value}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="form-field">
                  <label htmlFor="route-networks">Charging networks</label>
                  <input
                    id="route-networks"
                    name="networks"
                    placeholder="Electrify America, EVgo"
                  />
                  <p className="form-field__hint">Leave blank to include every network.</p>
                </div>

                <div className="route-search-form__toggles">
                  <label className="checkbox-option">
                    <input defaultChecked name="compatibleOnly" type="checkbox" />
                    <span>Compatible connectors only</span>
                  </label>

                  <label className="checkbox-option">
                    <input defaultChecked name="publicOnly" type="checkbox" />
                    <span>Public stations only</span>
                  </label>

                  <label className="checkbox-option">
                    <input defaultChecked name="operatingOnly" type="checkbox" />
                    <span>Operating stations only</span>
                  </label>
                </div>
              </div>
            </details>

            {(validationMessage !== null || routeSearchMutation.isError) && (
              <p className="form-message form-message--error" role="alert">
                {validationMessage ?? getRouteSearchErrorMessage(routeSearchMutation.error)}
              </p>
            )}

            <div className="route-search-form__actions">
              <button
                className="button button--primary"
                disabled={routeSearchMutation.isPending}
                type="submit"
              >
                {routeSearchMutation.isPending ? "Searching route…" : "Search route"}
              </button>
            </div>
          </form>

          {routeSearchMutation.isSuccess && (
            <RouteResultSummary response={routeSearchMutation.data} />
          )}
        </>
      )}
    </section>
  );
}
