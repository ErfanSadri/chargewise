import type { RouteSearchResponse } from "@chargewise/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RouteMap } from "./RouteMap.tsx";

const leafletMocks = vi.hoisted(() => ({
  extend: vi.fn(),
  fitBounds: vi.fn(),
  panTo: vi.fn(),
}));

vi.mock("leaflet", () => ({
  divIcon: vi.fn(() => ({})),
  latLngBounds: vi.fn(() => ({
    extend: leafletMocks.extend,
  })),
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="leaflet-map">{children}</div>
  ),
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Marker: ({
    children,
    eventHandlers,
    title,
  }: {
    children?: ReactNode;
    eventHandlers?: {
      click?: () => void;
    };
    title?: string;
  }) => (
    <button onClick={eventHandlers?.click} type="button">
      Marker {title}
      {children}
    </button>
  ),
  Tooltip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useMap: () => ({
    fitBounds: leafletMocks.fitBounds,
    panTo: leafletMocks.panTo,
  }),
}));

type RouteData = RouteSearchResponse["data"]["route"];
type RouteStation = RouteSearchResponse["data"]["stations"][number];

const route: RouteData = {
  geometry: {
    type: "LineString",
    coordinates: [
      [-118.593153, 34.15404],
      [-117.23952, 32.877207],
    ],
  },
  distanceMeters: 219514.4,
  durationSeconds: 8928.2,
  origin: {
    label: "Woodland Hills, California",
    longitude: -118.593153,
    latitude: 34.15404,
  },
  destination: {
    label: "UC San Diego, California",
    longitude: -117.23952,
    latitude: 32.877207,
  },
};

const station: RouteStation = {
  id: "ecba119c-963d-4931-acb8-1320791258be",
  name: "Westfield Fast Charging",
  network: "Electrify America",
  longitude: -118.605,
  latitude: 34.19,
  distanceFromRouteMeters: 1200,
  connectorCodes: ["CCS"],
  compatible: true,
  level2PortCount: 0,
  dcFastPortCount: 8,
  accessCode: "public",
  sourceStatus: "E",
  lastSyncedAt: "2026-08-02T20:00:00.000Z",
  isFavorite: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("route map", () => {
  it("fits the viewport and sends marker selections to the parent", () => {
    const onStationSelect = vi.fn();

    render(
      <RouteMap
        onStationSelect={onStationSelect}
        route={route}
        selectedStationId={null}
        stations={[station]}
      />,
    );

    expect(leafletMocks.fitBounds).toHaveBeenCalledWith(expect.anything(), {
      animate: false,
      maxZoom: 13,
      padding: [32, 32],
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Marker Westfield Fast Charging/,
      }),
    );

    expect(onStationSelect).toHaveBeenCalledWith(station.id);
  });

  it("pans to the selected station", () => {
    render(
      <RouteMap
        onStationSelect={() => undefined}
        route={route}
        selectedStationId={station.id}
        stations={[station]}
      />,
    );

    expect(leafletMocks.panTo).toHaveBeenCalledWith([station.latitude, station.longitude], {
      animate: false,
    });
  });
});
