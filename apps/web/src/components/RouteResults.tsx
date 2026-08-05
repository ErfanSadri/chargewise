import type { RouteSearchResponse } from "@chargewise/shared";
import { useEffect, useRef, useState } from "react";

import { RouteMap } from "./RouteMap.tsx";
import "./RouteResults.css";

const metersPerMile = 1609.344;

type RouteStation = RouteSearchResponse["data"]["stations"][number];

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

interface StationListProps {
  stations: readonly RouteStation[];
  selectedStationId: string | null;
  onStationSelect: (stationId: string) => void;
}

function StationList({ stations, selectedStationId, onStationSelect }: StationListProps) {
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedCardRef.current?.scrollIntoView?.({
      block: "nearest",
    });
  }, [selectedStationId]);

  if (stations.length === 0) {
    return (
      <section aria-labelledby="station-list-heading" className="station-list station-list--empty">
        <h3 id="station-list-heading">No matching stations</h3>
        <p>
          The route is available, but no charging stations matched the current corridor and
          preferences.
        </p>
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

export function RouteResults({ response }: RouteResultsProps) {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const { route, stations } = response.data;

  const effectiveSelectedStationId = stations.some((station) => station.id === selectedStationId)
    ? selectedStationId
    : null;

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

      <div className="route-result__explorer">
        <RouteMap
          onStationSelect={setSelectedStationId}
          route={route}
          selectedStationId={effectiveSelectedStationId}
          stations={stations}
        />

        <StationList
          onStationSelect={setSelectedStationId}
          selectedStationId={selectedStationId}
          stations={stations}
        />
      </div>
    </section>
  );
}
