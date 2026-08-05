import type { RouteSearchResponse } from "@chargewise/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RouteResults } from "./RouteResults.tsx";

interface MockRouteMapProps {
  stations: RouteSearchResponse["data"]["stations"];
  selectedStationId: string | null;
  onStationSelect: (stationId: string) => void;
}

vi.mock("./RouteMap.tsx", () => ({
  RouteMap: ({ stations, selectedStationId, onStationSelect }: MockRouteMapProps) => (
    <section aria-label="Interactive route map">
      <span data-testid="map-station-count">{stations.length}</span>
      <span data-testid="selected-map-station">{selectedStationId ?? "none"}</span>

      {stations.map((station) => (
        <button
          key={station.id}
          onClick={() => {
            onStationSelect(station.id);
          }}
          type="button"
        >
          Map marker {station.name}
        </button>
      ))}
    </section>
  ),
}));

const firstStation = {
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
} satisfies RouteSearchResponse["data"]["stations"][number];

const secondStation = {
  id: "cb559763-3d59-474d-a7da-c2fd7ad5dbcc",
  name: "Campus Charging Hub",
  network: "EVgo",
  longitude: -117.232,
  latitude: 32.88,
  distanceFromRouteMeters: 650,
  connectorCodes: ["CCS", "CHADEMO"],
  compatible: false,
  level2PortCount: 4,
  dcFastPortCount: 6,
  accessCode: "private",
  sourceStatus: "T",
  lastSyncedAt: "2026-08-02T20:00:00.000Z",
  isFavorite: false,
} satisfies RouteSearchResponse["data"]["stations"][number];

const response: RouteSearchResponse = {
  data: {
    route: {
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
    },
    stations: [firstStation, secondStation],
  },
  meta: {
    stationSource: "NLR_AFDC",
    routeSource: "OPENROUTESERVICE",
    stationCount: 2,
  },
};

describe("route results", () => {
  it("derives filtered markers and cards without changing the source response", async () => {
    const sourceSnapshot = structuredClone(response);
    const user = userEvent.setup();

    render(<RouteResults response={response} />);

    await user.selectOptions(screen.getByLabelText("Network"), "EVgo");

    expect(
      screen.queryByRole("button", {
        name: `Select ${firstStation.name}`,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Select ${secondStation.name}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-station-count")).toHaveTextContent("1");
    expect(screen.getByText("Showing 1 of 2 stations")).toBeInTheDocument();
    expect(response).toEqual(sourceSnapshot);
  });

  it("shows expanded details for the selected station", async () => {
    const user = userEvent.setup();

    render(<RouteResults response={response} />);

    await user.click(
      screen.getByRole("button", {
        name: `Select ${firstStation.name}`,
      }),
    );

    const details = screen.getByRole("region", {
      name: `Station details for ${firstStation.name}`,
    });

    expect(within(details).getByText("Electrify America")).toBeInTheDocument();
    expect(within(details).getByText("Compatible with selected vehicle")).toBeInTheDocument();
    expect(within(details).getByText("8 DC fast")).toBeInTheDocument();
    expect(within(details).getByText("Public access")).toBeInTheDocument();
    expect(within(details).getByText("Operating")).toBeInTheDocument();
    expect(screen.getByTestId("selected-map-station")).toHaveTextContent(firstStation.id);
    expect(
      within(details).getByRole("link", {
        name: "Log charging session",
      }),
    ).toHaveAttribute(
      "href",
      `/sessions?stationId=${firstStation.id}&stationName=Westfield+Fast+Charging`,
    );
  });

  it("clears effective selection when filters hide the selected station", async () => {
    const user = userEvent.setup();

    render(<RouteResults response={response} />);

    await user.click(
      screen.getByRole("button", {
        name: `Select ${firstStation.name}`,
      }),
    );

    await user.selectOptions(screen.getByLabelText("Network"), "EVgo");

    expect(
      screen.queryByRole("region", {
        name: `Station details for ${firstStation.name}`,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-map-station")).toHaveTextContent("none");
  });

  it("shows a zero-result state and restores every source station", async () => {
    const user = userEvent.setup();

    render(<RouteResults response={response} />);

    await user.type(
      screen.getByLabelText("Name, network, or connector"),
      "no station has this name",
    );

    expect(
      screen.getByRole("heading", {
        name: "No stations match these filters",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-station-count")).toHaveTextContent("0");

    await user.click(
      screen.getAllByRole("button", {
        name: "Reset filters",
      })[0]!,
    );

    expect(
      screen.getByRole("button", {
        name: `Select ${firstStation.name}`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Select ${secondStation.name}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-station-count")).toHaveTextContent("2");
  });
});
