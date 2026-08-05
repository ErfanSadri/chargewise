import type { PublicFavorite, RouteSearchResponse } from "@chargewise/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/api-client.ts";
import { addFavorite, removeFavorite } from "../api/favorite-client.ts";
import { RouteResults } from "./RouteResults.tsx";

vi.mock("../api/favorite-client.ts", () => ({
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));

vi.mock("./RouteMap.tsx", () => ({
  RouteMap: ({ children }: { children?: ReactNode }) => (
    <section aria-label="Interactive route map">{children}</section>
  ),
}));

const station = {
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
    stations: [station],
  },
  meta: {
    stationSource: "NLR_AFDC",
    routeSource: "OPENROUTESERVICE",
    stationCount: 1,
  },
};

const favorite: PublicFavorite = {
  stationId: station.id,
  name: station.name,
  network: station.network,
  longitude: station.longitude,
  latitude: station.latitude,
  connectorCodes: ["CCS"],
  level2PortCount: 0,
  dcFastPortCount: 8,
  accessCode: "public",
  sourceStatus: "E",
  lastSyncedAt: station.lastSyncedAt,
  favoritedAt: "2026-08-05T06:00:00.000Z",
  isFavorite: true,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("route-result favorite UI", () => {
  it("optimistically adds and then removes a favorite", async () => {
    vi.mocked(addFavorite).mockResolvedValue(favorite);
    vi.mocked(removeFavorite).mockResolvedValue(undefined);

    const user = userEvent.setup();

    render(<RouteResults response={response} />);

    await user.click(
      screen.getByRole("button", {
        name: `Select ${station.name}`,
      }),
    );

    const addButton = screen.getByRole("button", {
      name: `Add ${station.name} to favorites`,
    });

    await user.click(addButton);

    expect(
      screen.getByRole("button", {
        name: `Remove ${station.name} from favorites`,
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(addFavorite).toHaveBeenCalledWith(station.id);
    });

    await user.click(
      screen.getByRole("button", {
        name: `Remove ${station.name} from favorites`,
      }),
    );

    expect(
      screen.getByRole("button", {
        name: `Add ${station.name} to favorites`,
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(removeFavorite).toHaveBeenCalledWith(station.id);
    });
  });

  it("rolls back an optimistic favorite when the API fails", async () => {
    vi.mocked(addFavorite).mockRejectedValue(
      new ApiError({
        statusCode: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Service temporarily unavailable",
      }),
    );

    const user = userEvent.setup();

    render(<RouteResults response={response} />);

    await user.click(
      screen.getByRole("button", {
        name: `Select ${station.name}`,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: `Add ${station.name} to favorites`,
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Service temporarily unavailable");

    expect(
      screen.getByRole("button", {
        name: `Add ${station.name} to favorites`,
      }),
    ).toBeInTheDocument();
  });
});
