import { divIcon, latLngBounds, type LatLngExpression } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { useEffect, useMemo } from "react";

import "leaflet/dist/leaflet.css";
import type { RouteSearchResponse } from "@chargewise/shared";

type RouteData = RouteSearchResponse["data"]["route"];
type RouteStation = RouteSearchResponse["data"]["stations"][number];

export interface RouteMapProps {
  route: RouteData;
  stations: readonly RouteStation[];
  selectedStationId: string | null;
  onStationSelect: (stationId: string) => void;
}

interface RouteViewportControllerProps {
  route: RouteData;
  stations: readonly RouteStation[];
  selectedStationId: string | null;
}

function RouteViewportController({
  route,
  stations,
  selectedStationId,
}: RouteViewportControllerProps) {
  const map = useMap();

  useEffect(() => {
    const positions: LatLngExpression[] = route.geometry.coordinates.map(
      ([longitude, latitude]) => [latitude, longitude],
    );

    for (const station of stations) {
      positions.push([station.latitude, station.longitude]);
    }

    const bounds = latLngBounds(positions);

    map.fitBounds(bounds, {
      animate: false,
      maxZoom: 13,
      padding: [32, 32],
    });
  }, [map, route, stations]);

  useEffect(() => {
    if (selectedStationId === null) {
      return;
    }

    const station = stations.find((candidate) => candidate.id === selectedStationId);

    if (station === undefined) {
      return;
    }

    map.panTo([station.latitude, station.longitude], {
      animate: false,
    });
  }, [map, selectedStationId, stations]);

  return null;
}

function createStationIcon(isSelected: boolean, isCompatible: boolean) {
  const stateClass = isSelected
    ? "route-map__station-dot--selected"
    : isCompatible
      ? "route-map__station-dot--compatible"
      : "route-map__station-dot--incompatible";

  return divIcon({
    className: "route-map__station-marker",
    html: `<span class="route-map__station-dot ${stateClass}" aria-hidden="true"></span>`,
    iconAnchor: [14, 14],
    iconSize: [28, 28],
  });
}

export function RouteMap({ route, stations, selectedStationId, onStationSelect }: RouteMapProps) {
  const routePositions = useMemo<LatLngExpression[]>(
    () => route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
    [route.geometry.coordinates],
  );

  return (
    <section aria-label="Interactive route map" className="route-map" role="region">
      <p className="route-map__instructions">
        Use the map controls or keyboard arrow keys to explore. Every charging station shown on the
        map is also available in the station list.
      </p>

      <MapContainer
        center={[route.origin.latitude, route.origin.longitude]}
        className="route-map__canvas"
        keyboard
        scrollWheelZoom={false}
        worldCopyJump
        zoom={7}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polyline
          pathOptions={{
            color: "#176b45",
            opacity: 0.9,
            weight: 5,
          }}
          positions={routePositions}
        />

        <CircleMarker
          center={[route.origin.latitude, route.origin.longitude]}
          pathOptions={{
            color: "#0b4e31",
            fillColor: "#ffffff",
            fillOpacity: 1,
            weight: 3,
          }}
          radius={7}
        >
          <Tooltip direction="top">Origin: {route.origin.label}</Tooltip>
        </CircleMarker>

        <CircleMarker
          center={[route.destination.latitude, route.destination.longitude]}
          pathOptions={{
            color: "#0b4e31",
            fillColor: "#0b4e31",
            fillOpacity: 1,
            weight: 3,
          }}
          radius={7}
        >
          <Tooltip direction="top">Destination: {route.destination.label}</Tooltip>
        </CircleMarker>

        {stations.map((station) => {
          const isSelected = station.id === selectedStationId;

          return (
            <Marker
              alt={`${station.name} charging station`}
              eventHandlers={{
                click: () => {
                  onStationSelect(station.id);
                },
              }}
              icon={createStationIcon(isSelected, station.compatible)}
              key={station.id}
              keyboard
              position={[station.latitude, station.longitude]}
              riseOnHover
              title={station.name}
              zIndexOffset={isSelected ? 1000 : 0}
            >
              <Tooltip direction="top">
                {station.name}
                {station.network === null ? "" : ` — ${station.network}`}
              </Tooltip>
            </Marker>
          );
        })}

        <RouteViewportController
          route={route}
          selectedStationId={selectedStationId}
          stations={stations}
        />
      </MapContainer>
    </section>
  );
}
