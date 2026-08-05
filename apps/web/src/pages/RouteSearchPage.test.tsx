import type { PublicVehicle, RouteSearchResponse } from "@chargewise/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/api-client.ts";
import { searchRoute } from "../api/route-client.ts";
import { listVehicles } from "../api/vehicle-client.ts";
import { RouteSearchPage } from "./RouteSearchPage.tsx";

interface MockRouteMapProps {
  stations: RouteSearchResponse["data"]["stations"];
  selectedStationId: string | null;
  onStationSelect: (stationId: string) => void;
}

vi.mock("../components/RouteMap.tsx", () => ({
  RouteMap: ({ stations, selectedStationId, onStationSelect }: MockRouteMapProps) => (
    <section aria-label="Interactive route map">
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

vi.mock("../api/route-client.ts", () => ({
  searchRoute: vi.fn(),
}));

vi.mock("../api/vehicle-client.ts", () => ({
  vehiclesQueryKey: ["vehicles"],
  listVehicles: vi.fn(),
}));

const vehicle: PublicVehicle = {
  id: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  nickname: "My i5",
  make: "BMW",
  model: "i5 eDrive40",
  year: 2025,
  batteryCapacityKwh: "81.20",
  efficiencyMiPerKwh: "3.10",
  connectorTypes: ["CCS", "J1772"],
  preferredNetworks: ["Electrify America"],
  isDefault: true,
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
};

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
  compatible: true,
  level2PortCount: 4,
  dcFastPortCount: 6,
  accessCode: "public",
  sourceStatus: "E",
  lastSyncedAt: "2026-08-02T20:00:00.000Z",
  isFavorite: false,
} satisfies RouteSearchResponse["data"]["stations"][number];

const routeResponse: RouteSearchResponse = {
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

function renderPage(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <RouteSearchPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return queryClient;
}

async function submitValidSearch(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Origin"), "Woodland Hills, CA");
  await user.type(screen.getByLabelText("Destination"), "UC San Diego, La Jolla, CA");
  await user.click(
    screen.getByRole("button", {
      name: "Search route",
    }),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("route-search UI", () => {
  it("submits the default vehicle and renders the route explorer", async () => {
    vi.mocked(listVehicles).mockResolvedValue([vehicle]);
    vi.mocked(searchRoute).mockResolvedValue(routeResponse);

    const user = userEvent.setup();
    renderPage();

    await submitValidSearch(user);

    await waitFor(() => {
      expect(searchRoute).toHaveBeenCalledWith({
        origin: "Woodland Hills, CA",
        destination: "UC San Diego, La Jolla, CA",
        vehicleId: vehicle.id,
        corridorMeters: 8046.72,
        filters: {
          compatibleOnly: true,
          networks: [],
          chargingLevels: ["DC_FAST"],
          publicOnly: true,
          operatingOnly: true,
        },
      });
    });

    expect(
      await screen.findByRole("heading", {
        name: "Woodland Hills, California to UC San Diego, California",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("136.4 mi")).toBeInTheDocument();
    expect(screen.getByText("2 hr 29 min")).toBeInTheDocument();
    expect(screen.getByText("2 stations found")).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Interactive route map",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Stations along this route",
      }),
    ).toBeInTheDocument();
  });

  it("keeps station-list and map-marker selection synchronized", async () => {
    vi.mocked(listVehicles).mockResolvedValue([vehicle]);
    vi.mocked(searchRoute).mockResolvedValue(routeResponse);

    const user = userEvent.setup();
    renderPage();

    await submitValidSearch(user);

    const secondStationCard = await screen.findByRole("button", {
      name: `Select ${secondStation.name}`,
    });

    await user.click(secondStationCard);

    expect(secondStationCard).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("selected-map-station")).toHaveTextContent(secondStation.id);

    await user.click(
      screen.getByRole("button", {
        name: `Map marker ${firstStation.name}`,
      }),
    );

    expect(
      screen.getByRole("button", {
        name: `Select ${firstStation.name}`,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(secondStationCard).toHaveAttribute("aria-pressed", "false");
  });

  it("rejects an incomplete form before calling the API", async () => {
    vi.mocked(listVehicles).mockResolvedValue([vehicle]);

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "Search route",
      }),
    );

    expect(searchRoute).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Review the origin, destination, vehicle, corridor, and search preferences.",
    );
  });

  it("shows a location-resolution error from the server", async () => {
    vi.mocked(listVehicles).mockResolvedValue([vehicle]);
    vi.mocked(searchRoute).mockRejectedValue(
      new ApiError({
        statusCode: 422,
        code: "LOCATION_NOT_RESOLVED",
        message: "Destination location could not be resolved",
      }),
    );

    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Origin"), "Woodland Hills, CA");
    await user.type(screen.getByLabelText("Destination"), "Unknown place");
    await user.click(
      screen.getByRole("button", {
        name: "Search route",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Destination location could not be resolved",
    );
  });

  it("directs users without a saved vehicle to vehicle management", async () => {
    vi.mocked(listVehicles).mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Add an EV before planning a route.",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Add a vehicle",
      }),
    ).toHaveAttribute("href", "/vehicles");
  });
});
