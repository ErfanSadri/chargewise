import type { PublicVehicle } from "@chargewise/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createVehicle, listVehicles, updateVehicle } from "../api/vehicle-client.ts";
import { VehiclesPage } from "./VehiclesPage.tsx";

vi.mock("../api/vehicle-client.ts", () => ({
  vehiclesQueryKey: ["vehicles"],
  listVehicles: vi.fn(),
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(),
  deleteVehicle: vi.fn(),
}));

const firstVehicle: PublicVehicle = {
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

const secondVehicle: PublicVehicle = {
  id: "05e7ed58-e5e4-43a7-b94f-7c5ee1fda488",
  nickname: "City EV",
  make: "Tesla",
  model: "Model 3",
  year: 2026,
  batteryCapacityKwh: "75.00",
  efficiencyMiPerKwh: "4.10",
  connectorTypes: ["NACS"],
  preferredNetworks: ["Tesla Supercharger"],
  isDefault: false,
  createdAt: "2026-08-04T13:00:00.000Z",
  updatedAt: "2026-08-04T13:00:00.000Z",
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
    <QueryClientProvider client={queryClient}>
      <VehiclesPage />
    </QueryClientProvider>,
  );

  return queryClient;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("vehicle management UI", () => {
  it("creates the first vehicle and refreshes the list", async () => {
    vi.mocked(listVehicles).mockResolvedValueOnce([]).mockResolvedValue([firstVehicle]);

    vi.mocked(createVehicle).mockResolvedValue(firstVehicle);

    const user = userEvent.setup();

    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "Add your first vehicle",
      }),
    );

    await user.type(screen.getByLabelText("Nickname"), "My i5");

    await user.type(screen.getByLabelText("Make"), "BMW");

    await user.type(screen.getByLabelText("Model"), "i5 eDrive40");

    await user.type(screen.getByLabelText("Year"), "2025");

    await user.type(screen.getByLabelText("Battery capacity"), "81.20");

    await user.type(screen.getByLabelText("Efficiency"), "3.10");

    await user.click(
      screen.getByRole("checkbox", {
        name: "CCS",
      }),
    );

    await user.type(screen.getByLabelText("Preferred charging networks"), "Electrify America");

    await user.click(
      screen.getByRole("checkbox", {
        name: "Use this as my default vehicle",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add vehicle",
      }),
    );

    await waitFor(() => {
      expect(createVehicle).toHaveBeenCalledWith({
        nickname: "My i5",
        make: "BMW",
        model: "i5 eDrive40",
        year: 2025,
        batteryCapacityKwh: "81.20",
        efficiencyMiPerKwh: "3.10",
        connectorTypes: ["CCS"],
        preferredNetworks: ["Electrify America"],
        isDefault: true,
      });
    });

    expect(
      await screen.findByRole("heading", {
        name: "My i5",
      }),
    ).toBeInTheDocument();

    expect(listVehicles).toHaveBeenCalledTimes(2);
  });

  it("makes another vehicle the default and refreshes the list", async () => {
    vi.mocked(listVehicles)
      .mockResolvedValueOnce([firstVehicle, secondVehicle])
      .mockResolvedValue([
        {
          ...firstVehicle,
          isDefault: false,
        },
        {
          ...secondVehicle,
          isDefault: true,
        },
      ]);

    vi.mocked(updateVehicle).mockResolvedValue({
      ...secondVehicle,
      isDefault: true,
    });

    const user = userEvent.setup();

    renderPage();

    const cityHeading = await screen.findByRole("heading", {
      name: "City EV",
    });

    const cityCard = cityHeading.closest("article");

    expect(cityCard).not.toBeNull();

    await user.click(
      within(cityCard as HTMLElement).getByRole("button", {
        name: "Make default",
      }),
    );

    await waitFor(() => {
      expect(updateVehicle).toHaveBeenCalledWith(secondVehicle.id, {
        isDefault: true,
      });
    });

    await waitFor(() => {
      const refreshedCard = screen
        .getByRole("heading", {
          name: "City EV",
        })
        .closest("article");

      expect(refreshedCard).not.toBeNull();

      expect(within(refreshedCard as HTMLElement).getByText("Default")).toBeInTheDocument();
    });

    expect(listVehicles).toHaveBeenCalledTimes(2);
  });
});
