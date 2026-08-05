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
    stations: [
      {
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
      },
    ],
  },
  meta: {
    stationSource: "NLR_AFDC",
    routeSource: "OPENROUTESERVICE",
    stationCount: 1,
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("route-search UI", () => {
  it("submits the default vehicle and renders the route summary", async () => {
    vi.mocked(listVehicles).mockResolvedValue([vehicle]);
    vi.mocked(searchRoute).mockResolvedValue(routeResponse);

    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Origin"), "Woodland Hills, CA");
    await user.type(screen.getByLabelText("Destination"), "UC San Diego, La Jolla, CA");

    await user.click(
      screen.getByRole("button", {
        name: "Search route",
      }),
    );

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
    expect(screen.getByText("1 station found")).toBeInTheDocument();
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
