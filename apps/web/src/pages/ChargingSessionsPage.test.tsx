import type { PublicChargingSession, PublicFavorite, PublicVehicle } from "@chargewise/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createChargingSession,
  deleteChargingSession,
  listChargingSessions,
  updateChargingSession,
} from "../api/charging-session-client.ts";
import { listFavorites } from "../api/favorite-client.ts";
import { listVehicles } from "../api/vehicle-client.ts";
import { ChargingSessionsPage } from "./ChargingSessionsPage.tsx";

vi.mock("../api/charging-session-client.ts", () => ({
  chargingSessionsQueryKey: ["charging-sessions"],
  getChargingSessionsQueryKey: (filters: unknown) => ["charging-sessions", filters],
  listChargingSessions: vi.fn(),
  createChargingSession: vi.fn(),
  updateChargingSession: vi.fn(),
  deleteChargingSession: vi.fn(),
}));

vi.mock("../api/vehicle-client.ts", () => ({
  vehiclesQueryKey: ["vehicles"],
  listVehicles: vi.fn(),
}));

vi.mock("../api/favorite-client.ts", () => ({
  favoritesQueryKey: ["favorites"],
  listFavorites: vi.fn(),
}));

const vehicle: PublicVehicle = {
  id: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  nickname: "My i5",
  make: "BMW",
  model: "i5 eDrive40",
  year: 2025,
  batteryCapacityKwh: "81.20",
  efficiencyMiPerKwh: "3.10",
  connectorTypes: ["CCS"],
  preferredNetworks: ["Electrify America"],
  isDefault: true,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const favorite: PublicFavorite = {
  stationId: "ecba119c-963d-4931-acb8-1320791258be",
  name: "Westfield Fast Charging",
  network: "Electrify America",
  longitude: -118.605,
  latitude: 34.19,
  connectorCodes: ["CCS"],
  level2PortCount: 0,
  dcFastPortCount: 8,
  accessCode: "public",
  sourceStatus: "E",
  lastSyncedAt: "2026-08-01T12:00:00.000Z",
  favoritedAt: "2026-08-01T13:00:00.000Z",
  isFavorite: true,
};

const session: PublicChargingSession = {
  id: "0f30c755-32c8-49c7-9aef-f53f761355c5",
  vehicleId: vehicle.id,
  stationId: favorite.stationId,
  startedAt: "2026-08-01T19:00:00.000Z",
  chargingMinutes: 31,
  waitMinutes: 8,
  energyAddedKwh: "42.700",
  totalCost: "12.50",
  startingSoc: 18,
  endingSoc: 79,
  odometerMiles: 15420,
  issueType: "NONE",
  notes: "Successful session",
  createdAt: "2026-08-01T20:00:00.000Z",
  updatedAt: "2026-08-01T20:00:00.000Z",
};

function createHistoryPage(sessions: PublicChargingSession[], nextCursor: string | null = null) {
  return {
    data: sessions,
    meta: {
      nextCursor,
    },
  };
}

function renderPage(initialEntry = "/sessions"): QueryClient {
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
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <ChargingSessionsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return queryClient;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("charging-session history UI", () => {
  it("creates a session from a route-selected station and refreshes history", async () => {
    vi.mocked(listVehicles).mockResolvedValue([vehicle]);
    vi.mocked(listFavorites).mockResolvedValue([]);
    vi.mocked(listChargingSessions)
      .mockResolvedValueOnce(createHistoryPage([]))
      .mockResolvedValue(createHistoryPage([session]));
    vi.mocked(createChargingSession).mockResolvedValue(session);

    const user = userEvent.setup();

    renderPage(`/sessions?stationId=${favorite.stationId}&stationName=Westfield%20Fast%20Charging`);

    expect(
      await screen.findByRole("heading", {
        name: "Log a charging session",
      }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Energy added"), "42.700");
    await user.type(screen.getByLabelText("Notes"), "Successful session");

    await user.click(
      screen.getByRole("button", {
        name: "Log session",
      }),
    );

    await waitFor(() => {
      expect(createChargingSession).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleId: vehicle.id,
          stationId: favorite.stationId,
          energyAddedKwh: "42.700",
          issueType: "NONE",
          notes: "Successful session",
        }),
      );
    });

    expect(
      await screen.findByRole("heading", {
        name: favorite.name,
      }),
    ).toBeInTheDocument();
    expect(listChargingSessions).toHaveBeenCalledTimes(2);
  });

  it("edits a complete session and invalidates the history query", async () => {
    vi.mocked(listVehicles).mockResolvedValue([vehicle]);
    vi.mocked(listFavorites).mockResolvedValue([favorite]);
    vi.mocked(listChargingSessions).mockResolvedValue(createHistoryPage([session]));
    vi.mocked(updateChargingSession).mockResolvedValue({
      ...session,
      notes: "Updated note",
    });

    const user = userEvent.setup();

    renderPage();

    const stationHeading = await screen.findByRole("heading", {
      name: favorite.name,
    });
    const sessionCard = stationHeading.closest("article");

    expect(sessionCard).not.toBeNull();

    await user.click(
      within(sessionCard as HTMLElement).getByRole("button", {
        name: "Edit",
      }),
    );

    const notes = screen.getByLabelText("Notes");

    await user.clear(notes);
    await user.type(notes, "Updated note");

    await user.click(
      screen.getByRole("button", {
        name: "Save changes",
      }),
    );

    await waitFor(() => {
      expect(updateChargingSession).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({
          notes: "Updated note",
          vehicleId: vehicle.id,
          stationId: favorite.stationId,
        }),
      );
    });

    await waitFor(() => {
      expect(listChargingSessions).toHaveBeenCalledTimes(2);
    });
  });

  it("deletes a session and displays the refreshed empty state", async () => {
    vi.mocked(listVehicles).mockResolvedValue([vehicle]);
    vi.mocked(listFavorites).mockResolvedValue([favorite]);
    vi.mocked(listChargingSessions)
      .mockResolvedValueOnce(createHistoryPage([session]))
      .mockResolvedValue(createHistoryPage([]));
    vi.mocked(deleteChargingSession).mockResolvedValue(undefined);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    const user = userEvent.setup();

    renderPage();

    const stationHeading = await screen.findByRole("heading", {
      name: favorite.name,
    });
    const sessionCard = stationHeading.closest("article");

    expect(sessionCard).not.toBeNull();

    await user.click(
      within(sessionCard as HTMLElement).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => {
      expect(deleteChargingSession).toHaveBeenCalledWith(session.id);
    });

    expect(
      await screen.findByRole("heading", {
        name: "Your charging history is empty.",
      }),
    ).toBeInTheDocument();
  });

  it("validates date order without requesting an invalid range", async () => {
    vi.mocked(listVehicles).mockResolvedValue([vehicle]);
    vi.mocked(listFavorites).mockResolvedValue([favorite]);
    vi.mocked(listChargingSessions).mockResolvedValue(createHistoryPage([session]));

    const user = userEvent.setup();

    renderPage();

    await screen.findByRole("heading", {
      name: favorite.name,
    });

    await user.type(screen.getByLabelText("From"), "2026-08-10");
    await user.type(screen.getByLabelText("To"), "2026-08-01");

    await user.click(
      screen.getByRole("button", {
        name: "Apply dates",
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a valid date range whose end is not before its start.",
    );
    expect(listChargingSessions).toHaveBeenCalledTimes(1);
  });
});
