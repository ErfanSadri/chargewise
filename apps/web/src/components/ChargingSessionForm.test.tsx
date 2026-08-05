import type { PublicVehicle } from "@chargewise/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChargingSessionForm } from "./ChargingSessionForm.tsx";

const vehicle: PublicVehicle = {
  id: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  nickname: "My i5",
  make: "BMW",
  model: "i5 eDrive40",
  year: 2025,
  batteryCapacityKwh: "81.20",
  efficiencyMiPerKwh: "3.10",
  connectorTypes: ["CCS"],
  preferredNetworks: [],
  isDefault: true,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const station = {
  id: "ecba119c-963d-4931-acb8-1320791258be",
  name: "Westfield Fast Charging",
};

describe("charging-session form", () => {
  it("parses a complete typed submission", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <ChargingSessionForm
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        serverMessage={null}
        stations={[station]}
        submitLabel="Log session"
        vehicles={[vehicle]}
      />,
    );

    await user.type(screen.getByLabelText("Energy added"), "42.700");
    await user.type(screen.getByLabelText("Notes"), "Successful stop");

    await user.click(
      screen.getByRole("button", {
        name: "Log session",
      }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: vehicle.id,
        stationId: station.id,
        chargingMinutes: 30,
        waitMinutes: 0,
        energyAddedKwh: "42.700",
        totalCost: "0.00",
        startingSoc: 20,
        endingSoc: 80,
        odometerMiles: null,
        issueType: "NONE",
        notes: "Successful stop",
      }),
    );
  });

  it("rejects a complete form whose ending charge is not higher", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <ChargingSessionForm
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        serverMessage={null}
        stations={[station]}
        submitLabel="Log session"
        vehicles={[vehicle]}
      />,
    );

    await user.type(screen.getByLabelText("Energy added"), "20");
    await user.clear(screen.getByLabelText("Ending charge"));
    await user.type(screen.getByLabelText("Ending charge"), "10");

    await user.click(
      screen.getByRole("button", {
        name: "Log session",
      }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Review the highlighted charging-session fields.",
    );
    expect(
      screen.getByText("Ending state of charge must be greater than starting state of charge"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Ending charge")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Ending charge")).toHaveFocus();
  });
});
