import type { RouteSearchResponse } from "@chargewise/shared";
import { useMemo, useRef, useState } from "react";

import { getApiErrorMessage } from "../api/api-client.ts";
import { addFavorite, removeFavorite } from "../api/favorite-client.ts";

import { RouteMap } from "./RouteMap.tsx";
import {
  createDefaultRouteStationFilters,
  filterRouteStations,
  getRouteStationFilterOptions,
  type RouteStation,
  type RouteStationFilters,
} from "./route-station-filters.ts";
import "./RouteResults.css";

const metersPerMile = 1609.344;

export interface RouteResultsProps {
  response: RouteSearchResponse;
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

function getVisibleStationCountLabel(visibleCount: number, totalCount: number): string {
  return `Showing ${visibleCount} of ${totalCount} ${totalCount === 1 ? "station" : "stations"}`;
}

function getStationNetwork(station: RouteStation): string {
  return station.network ?? "Independent network";
}

function getConnectorLabel(station: RouteStation): string {
  return station.connectorCodes.length === 0
    ? "Connector details unavailable"
    : station.connectorCodes.join(", ");
}

function getPortLabel(station: RouteStation): string {
  const labels: string[] = [];

  if (station.dcFastPortCount > 0) {
    labels.push(`${station.dcFastPortCount} DC fast`);
  }

  if (station.level2PortCount > 0) {
    labels.push(`${station.level2PortCount} Level 2`);
  }

  return labels.length === 0 ? "Port count unavailable" : labels.join(" · ");
}

function getAccessLabel(accessCode: string): string {
  return accessCode.toLocaleLowerCase() === "public" ? "Public access" : accessCode;
}

function getStatusLabel(sourceStatus: string): string {
  return sourceStatus.toLocaleUpperCase() === "E" ? "Operating" : sourceStatus;
}

function formatLastSyncedAt(lastSyncedAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(lastSyncedAt));
}

interface StationFilterControlsProps {
  filters: RouteStationFilters;
  stations: readonly RouteStation[];
  visibleCount: number;
  onFiltersChange: (filters: RouteStationFilters) => void;
}

function StationFilterControls({
  filters,
  stations,
  visibleCount,
  onFiltersChange,
}: StationFilterControlsProps) {
  const options = useMemo(() => getRouteStationFilterOptions(stations), [stations]);

  function updateFilters(update: Partial<RouteStationFilters>): void {
    onFiltersChange({
      ...filters,
      ...update,
    });
  }

  return (
    <section aria-labelledby="station-filter-heading" className="station-filters">
      <div className="station-filters__heading">
        <div>
          <p className="eyebrow">Refine results</p>
          <h3 id="station-filter-heading">Station filters</h3>
        </div>

        <p aria-live="polite">{getVisibleStationCountLabel(visibleCount, stations.length)}</p>
      </div>

      <div className="station-filters__grid">
        <div className="form-field station-filters__search">
          <label htmlFor="station-filter-query">Name, network, or connector</label>
          <input
            id="station-filter-query"
            onChange={(event) => {
              updateFilters({
                query: event.currentTarget.value,
              });
            }}
            placeholder="Search stations"
            type="search"
            value={filters.query}
          />
        </div>

        <div className="form-field">
          <label htmlFor="station-filter-network">Network</label>
          <select
            id="station-filter-network"
            onChange={(event) => {
              updateFilters({
                network: event.currentTarget.value,
              });
            }}
            value={filters.network}
          >
            <option value="ALL">All networks</option>
            {options.networks.map((network) => (
              <option key={network} value={network}>
                {network}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="station-filter-connector">Connector</label>
          <select
            id="station-filter-connector"
            onChange={(event) => {
              updateFilters({
                connector: event.currentTarget.value as RouteStationFilters["connector"],
              });
            }}
            value={filters.connector}
          >
            <option value="ALL">All connectors</option>
            {options.connectors.map((connector) => (
              <option key={connector} value={connector}>
                {connector}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="station-filter-level">Charging level</label>
          <select
            id="station-filter-level"
            onChange={(event) => {
              updateFilters({
                chargingLevel: event.currentTarget.value as RouteStationFilters["chargingLevel"],
              });
            }}
            value={filters.chargingLevel}
          >
            <option value="ALL">All charging levels</option>
            <option value="DC_FAST">DC fast charging</option>
            <option value="LEVEL_2">Level 2 charging</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="station-filter-compatibility">Compatibility</label>
          <select
            id="station-filter-compatibility"
            onChange={(event) => {
              updateFilters({
                compatibility: event.currentTarget.value as RouteStationFilters["compatibility"],
              });
            }}
            value={filters.compatibility}
          >
            <option value="ALL">All stations</option>
            <option value="COMPATIBLE">Compatible only</option>
            <option value="INCOMPATIBLE">Not compatible only</option>
          </select>
        </div>
      </div>

      <div className="station-filters__footer">
        <div className="station-filters__toggles">
          <label className="checkbox-option">
            <input
              checked={filters.publicOnly}
              onChange={(event) => {
                updateFilters({
                  publicOnly: event.currentTarget.checked,
                });
              }}
              type="checkbox"
            />
            <span>Public access only</span>
          </label>

          <label className="checkbox-option">
            <input
              checked={filters.operatingOnly}
              onChange={(event) => {
                updateFilters({
                  operatingOnly: event.currentTarget.checked,
                });
              }}
              type="checkbox"
            />
            <span>Operating only</span>
          </label>
        </div>

        <button
          className="button button--secondary"
          onClick={() => {
            onFiltersChange(createDefaultRouteStationFilters());
          }}
          type="button"
        >
          Reset filters
        </button>
      </div>
    </section>
  );
}

interface StationListProps {
  stations: readonly RouteStation[];
  selectedStationId: string | null;
  onStationSelect: (stationId: string) => void;
  onResetFilters: () => void;
}

function StationList({
  stations,
  selectedStationId,
  onStationSelect,
  onResetFilters,
}: StationListProps) {
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);

  if (stations.length === 0) {
    return (
      <section aria-labelledby="station-list-heading" className="station-list station-list--empty">
        <h3 id="station-list-heading">No stations match these filters</h3>
        <p>
          The original route results are still available. Reset the presentation filters to show
          them again.
        </p>
        <button className="button button--secondary" onClick={onResetFilters} type="button">
          Reset filters
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="station-list-heading" className="station-list">
      <div className="station-list__heading">
        <div>
          <p className="eyebrow">Accessible map alternative</p>
          <h3 id="station-list-heading">Stations along this route</h3>
        </div>
        <p>Select a station here or on the map.</p>
      </div>

      <ol className="station-list__items">
        {stations.map((station) => {
          const isSelected = station.id === selectedStationId;

          return (
            <li key={station.id}>
              <button
                aria-controls={isSelected ? "selected-station-details" : undefined}
                aria-expanded={isSelected}
                aria-label={`Select ${station.name}`}
                aria-pressed={isSelected}
                className={isSelected ? "station-card station-card--selected" : "station-card"}
                onClick={() => {
                  onStationSelect(station.id);
                }}
                ref={isSelected ? selectedCardRef : undefined}
                type="button"
              >
                <span className="station-card__heading">
                  <span>
                    <strong>{station.name}</strong>
                    <small>{getStationNetwork(station)}</small>
                  </span>

                  <span
                    className={
                      station.compatible
                        ? "station-card__status station-card__status--compatible"
                        : "station-card__status station-card__status--incompatible"
                    }
                  >
                    {station.compatible ? "Compatible" : "Not compatible"}
                  </span>
                </span>

                <span className="station-card__details">
                  <span>{getConnectorLabel(station)}</span>
                  <span>{getPortLabel(station)}</span>
                  <span>{formatDistance(station.distanceFromRouteMeters)} from route</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

interface StationDetailsProps {
  station: RouteStation;
  favoriteError: string | null;
  isFavoriteUpdating: boolean;
  onClose: () => void;
  onToggleFavorite: (station: RouteStation) => void;
}

function StationDetails({
  station,
  favoriteError,
  isFavoriteUpdating,
  onClose,
  onToggleFavorite,
}: StationDetailsProps) {
  return (
    <section
      aria-label={`Station details for ${station.name}`}
      aria-live="polite"
      className="station-details"
      id="selected-station-details"
    >
      <div className="station-details__heading">
        <div>
          <p className="eyebrow">Selected station</p>
          <h3>{station.name}</h3>
          <p>{getStationNetwork(station)}</p>
        </div>

        <button
          aria-label="Close station details"
          className="button button--secondary"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>

      <dl className="station-details__grid">
        <div>
          <dt>Compatibility</dt>
          <dd>
            {station.compatible
              ? "Compatible with selected vehicle"
              : "Not compatible with selected vehicle"}
          </dd>
        </div>
        <div>
          <dt>Connectors</dt>
          <dd>{getConnectorLabel(station)}</dd>
        </div>
        <div>
          <dt>Charging ports</dt>
          <dd>{getPortLabel(station)}</dd>
        </div>
        <div>
          <dt>Distance from route</dt>
          <dd>{formatDistance(station.distanceFromRouteMeters)}</dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd>{getAccessLabel(station.accessCode)}</dd>
        </div>
        <div>
          <dt>Provider status</dt>
          <dd>{getStatusLabel(station.sourceStatus)}</dd>
        </div>
        <div>
          <dt>Favorite</dt>
          <dd>{station.isFavorite ? "Saved to favorites" : "Not saved"}</dd>
        </div>
        <div>
          <dt>Station data synced</dt>
          <dd>{formatLastSyncedAt(station.lastSyncedAt)}</dd>
        </div>
      </dl>

      <div className="station-details__favorite-actions">
        <button
          aria-label={`${station.isFavorite ? "Remove" : "Add"} ${station.name} ${
            station.isFavorite ? "from" : "to"
          } favorites`}
          className={station.isFavorite ? "button button--secondary" : "button button--primary"}
          disabled={isFavoriteUpdating}
          onClick={() => {
            onToggleFavorite(station);
          }}
          type="button"
        >
          {isFavoriteUpdating
            ? "Saving…"
            : station.isFavorite
              ? "Remove from favorites"
              : "Add to favorites"}
        </button>

        {favoriteError !== null && (
          <p className="form-message form-message--error" role="alert">
            {favoriteError}
          </p>
        )}
      </div>
    </section>
  );
}

export function RouteResults({ response }: RouteResultsProps) {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [filters, setFilters] = useState<RouteStationFilters>(createDefaultRouteStationFilters);
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const [favoriteRequestStationId, setFavoriteRequestStationId] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  const { route, stations } = response.data;

  const stationsWithFavoriteState = useMemo(
    () =>
      stations.map((station) => ({
        ...station,
        isFavorite: favoriteOverrides[station.id] ?? station.isFavorite,
      })),
    [favoriteOverrides, stations],
  );

  const filteredStations = useMemo(
    () => filterRouteStations(stationsWithFavoriteState, filters),
    [filters, stationsWithFavoriteState],
  );

  const effectiveSelectedStationId = filteredStations.some(
    (station) => station.id === selectedStationId,
  )
    ? selectedStationId
    : null;

  const selectedStation =
    effectiveSelectedStationId === null
      ? undefined
      : filteredStations.find((station) => station.id === effectiveSelectedStationId);

  function handleFiltersChange(nextFilters: RouteStationFilters): void {
    if (
      selectedStationId !== null &&
      !filterRouteStations(stationsWithFavoriteState, nextFilters).some(
        (station) => station.id === selectedStationId,
      )
    ) {
      setSelectedStationId(null);
    }

    setFilters(nextFilters);
  }

  function resetFilters(): void {
    handleFiltersChange(createDefaultRouteStationFilters());
  }

  async function toggleFavorite(station: RouteStation): Promise<void> {
    const nextFavoriteState = !station.isFavorite;

    setFavoriteError(null);
    setFavoriteRequestStationId(station.id);
    setFavoriteOverrides((current) => ({
      ...current,
      [station.id]: nextFavoriteState,
    }));

    try {
      if (nextFavoriteState) {
        const favorite = await addFavorite(station.id);

        setFavoriteOverrides((current) => ({
          ...current,
          [station.id]: favorite.isFavorite,
        }));
      } else {
        await removeFavorite(station.id);

        setFavoriteOverrides((current) => ({
          ...current,
          [station.id]: false,
        }));
      }
    } catch (error: unknown) {
      setFavoriteOverrides((current) => ({
        ...current,
        [station.id]: station.isFavorite,
      }));
      setFavoriteError(getApiErrorMessage(error, "ChargeWise could not update this favorite."));
    } finally {
      setFavoriteRequestStationId(null);
    }
  }

  return (
    <section aria-labelledby="route-result-heading" aria-live="polite" className="route-result">
      <div className="route-result__summary">
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
      </div>

      <StationFilterControls
        filters={filters}
        onFiltersChange={handleFiltersChange}
        stations={stationsWithFavoriteState}
        visibleCount={filteredStations.length}
      />

      <div className="route-result__explorer">
        <RouteMap
          onStationSelect={(stationId) => {
            setSelectedStationId(stationId);
            setFavoriteError(null);
          }}
          route={route}
          selectedStationId={effectiveSelectedStationId}
          stations={filteredStations}
        />

        <StationList
          onResetFilters={resetFilters}
          onStationSelect={(stationId) => {
            setSelectedStationId(stationId);
            setFavoriteError(null);
          }}
          selectedStationId={effectiveSelectedStationId}
          stations={filteredStations}
        />
      </div>

      {selectedStation !== undefined && (
        <StationDetails
          favoriteError={favoriteError}
          isFavoriteUpdating={favoriteRequestStationId === selectedStation.id}
          onClose={() => {
            setSelectedStationId(null);
            setFavoriteError(null);
          }}
          onToggleFavorite={(station) => {
            void toggleFavorite(station);
          }}
          station={selectedStation}
        />
      )}
    </section>
  );
}
