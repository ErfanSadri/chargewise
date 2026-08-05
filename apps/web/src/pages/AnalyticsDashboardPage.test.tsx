import type {
  AnalyticsNetworkBreakdown,
  AnalyticsStationBreakdown,
  AnalyticsSummary,
  PublicChargingSession,
} from "@chargewise/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAnalyticsNetworks,
  getAnalyticsStations,
  getAnalyticsSummary,
} from "../api/analytics-client.ts";
import { listChargingSessions } from "../api/charging-session-client.ts";
import { AnalyticsDashboardPage } from "./AnalyticsDashboardPage.tsx";

vi.mock("../api/analytics-client.ts", () => ({
  analyticsQueryKey: ["analytics"],
  getAnalyticsQueryKey: (resource: string, filters: unknown) => ["analytics", resource, filters],
  getAnalyticsSummary: vi.fn(),
  getAnalyticsNetworks: vi.fn(),
  getAnalyticsStations: vi.fn(),
}));

vi.mock("../api/charging-session-client.ts", () => ({
  chargingSessionsQueryKey: ["charging-sessions"],
  listChargingSessions: vi.fn(),
}));

const stationId = "ecba119c-963d-4931-acb8-1320791258be";

const summary: AnalyticsSummary = {
  sessionCount: 4,
  totalEnergyKwh: "155.400",
  totalCost: "24.10",
  averageCostPerKwh: "0.1551",
  averageChargingMinutes: "29.50",
  averageWaitMinutes: "6.25",
  averageObservedPowerKw: "79.02",
  issueFreePercentage: "75.00",
};

const networks: AnalyticsNetworkBreakdown[] = [
  {
    network: "EVgo",
    sessionCount: 2,
    totalEnergyKwh: "85.400",
    totalCost: "10.10",
    averageCostPerKwh: "0.1183",
    averageObservedPowerKw: "75.35",
    issueFreePercentage: "100.00",
  },
  {
    network: "Electrify America",
    sessionCount: 2,
    totalEnergyKwh: "70.000",
    totalCost: "14.00",
    averageCostPerKwh: "0.2000",
    averageObservedPowerKw: "84.00",
    issueFreePercentage: "50.00",
  },
];

const stations: AnalyticsStationBreakdown[] = [
  {
    stationId,
    name: "Westfield Fast Charging",
    network: "Electrify America",
    sessionCount: 2,
    totalEnergyKwh: "70.000",
    totalCost: "14.00",
    averageCostPerKwh: "0.2000",
    averageChargingMinutes: "25.00",
    averageWaitMinutes: "2.50",
    averageObservedPowerKw: "84.00",
    issueFreePercentage: "50.00",
    lastSessionAt: "2026-08-02T12:00:00.000Z",
  },
];

const recentSession: PublicChargingSession = {
  id: "0f30c755-32c8-49c7-9aef-f53f761355c5",
  vehicleId: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  stationId,
  startedAt: "2026-08-02T12:00:00.000Z",
  chargingMinutes: 20,
  waitMinutes: 0,
  energyAddedKwh: "30.000",
  totalCost: "6.00",
  startingSoc: 20,
  endingSoc: 80,
  odometerMiles: null,
  issueType: "NONE",
  notes: null,
  createdAt: "2026-08-02T12:30:00.000Z",
  updatedAt: "2026-08-02T12:30:00.000Z",
};

function createHistoryPage(sessions: PublicChargingSession[]) {
  return {
    data: sessions,
    meta: {
      nextCursor: null,
    },
  };
}

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
        <AnalyticsDashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return queryClient;
}

function mockCompleteDashboard(): void {
  vi.mocked(getAnalyticsSummary).mockResolvedValue(summary);
  vi.mocked(getAnalyticsNetworks).mockResolvedValue(networks);
  vi.mocked(getAnalyticsStations).mockResolvedValue(stations);
  vi.mocked(listChargingSessions).mockResolvedValue(createHistoryPage([recentSession]));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("analytics dashboard", () => {
  it("presents exact summary, network, station, and recent-session values", async () => {
    mockCompleteDashboard();

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Key charging metrics",
      }),
    ).toBeInTheDocument();

    const overview = screen
      .getByRole("heading", {
        name: "Key charging metrics",
      })
      .closest("section");

    expect(overview).not.toBeNull();

    expect(within(overview as HTMLElement).getByText("155.400 kWh")).toBeInTheDocument();
    expect(within(overview as HTMLElement).getByText("$24.10")).toBeInTheDocument();
    expect(within(overview as HTMLElement).getByText("$0.1551/kWh")).toBeInTheDocument();
    expect(within(overview as HTMLElement).getByText("79.02 kW")).toBeInTheDocument();
    expect(within(overview as HTMLElement).getByText("75.00%")).toBeInTheDocument();

    expect(
      screen.getByLabelText(
        "EVgo: 2 sessions, 85.400 kilowatt-hours, $10.10 total cost, 100.00% issue-free",
      ),
    ).toBeInTheDocument();

    const stationTable = screen.getByRole("table", {
      name: "Most-used stations",
    });

    expect(
      within(stationTable).getByRole("rowheader", {
        name: /Westfield Fast Charging/u,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Westfield Fast Charging",
      }),
    ).toBeInTheDocument();
  });

  it("shows a meaningful empty state without invalid numeric output", async () => {
    vi.mocked(getAnalyticsSummary).mockResolvedValue({
      sessionCount: 0,
      totalEnergyKwh: "0.000",
      totalCost: "0.00",
      averageCostPerKwh: null,
      averageChargingMinutes: null,
      averageWaitMinutes: null,
      averageObservedPowerKw: null,
      issueFreePercentage: null,
    });
    vi.mocked(getAnalyticsNetworks).mockResolvedValue([]);
    vi.mocked(getAnalyticsStations).mockResolvedValue([]);
    vi.mocked(listChargingSessions).mockResolvedValue(createHistoryPage([]));

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Your dashboard will appear after your first session.",
      }),
    ).toBeInTheDocument();

    expect(screen.queryByText(/NaN/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/Infinity/u)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Log a charging session",
      }),
    ).toHaveAttribute("href", "/sessions");
  });

  it("applies one valid date range to every dashboard request", async () => {
    mockCompleteDashboard();
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole("heading", {
      name: "Key charging metrics",
    });

    fireEvent.change(screen.getByLabelText("From"), {
      target: {
        value: "2026-08-01",
      },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: {
        value: "2026-08-31",
      },
    });

    await user.click(
      screen.getByRole("button", {
        name: "Apply dates",
      }),
    );

    await waitFor(() => {
      expect(getAnalyticsSummary).toHaveBeenLastCalledWith(
        {
          from: "2026-08-01",
          to: "2026-08-31",
        },
        expect.any(AbortSignal),
      );
    });

    expect(getAnalyticsNetworks).toHaveBeenLastCalledWith(
      {
        from: "2026-08-01",
        to: "2026-08-31",
      },
      expect.any(AbortSignal),
    );
    expect(getAnalyticsStations).toHaveBeenLastCalledWith(
      {
        from: "2026-08-01",
        to: "2026-08-31",
      },
      expect.any(AbortSignal),
    );
    expect(listChargingSessions).toHaveBeenLastCalledWith(
      {
        from: "2026-08-01",
        to: "2026-08-31",
      },
      expect.any(AbortSignal),
    );
  });

  it("rejects an invalid range without issuing another request", async () => {
    mockCompleteDashboard();
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole("heading", {
      name: "Key charging metrics",
    });

    fireEvent.change(screen.getByLabelText("From"), {
      target: {
        value: "2026-08-10",
      },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: {
        value: "2026-08-01",
      },
    });

    await user.click(
      screen.getByRole("button", {
        name: "Apply dates",
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a valid date range whose end is not before its start.",
    );
    expect(getAnalyticsSummary).toHaveBeenCalledTimes(1);
    expect(getAnalyticsNetworks).toHaveBeenCalledTimes(1);
    expect(getAnalyticsStations).toHaveBeenCalledTimes(1);
    expect(listChargingSessions).toHaveBeenCalledTimes(1);
  });

  it("offers a retry when an analytics dependency fails", async () => {
    vi.mocked(getAnalyticsSummary).mockRejectedValue(new Error("analytics unavailable"));
    vi.mocked(getAnalyticsNetworks).mockResolvedValue([]);
    vi.mocked(getAnalyticsStations).mockResolvedValue([]);
    vi.mocked(listChargingSessions).mockResolvedValue(createHistoryPage([]));

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "We could not calculate your analytics.",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Try again",
      }),
    ).toBeInTheDocument();
  });
});
