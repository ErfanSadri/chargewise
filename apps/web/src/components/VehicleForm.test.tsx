import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VehicleForm } from "./VehicleForm.tsx";

describe("vehicle form accessibility", () => {
  it("marks and focuses the first invalid field", async () => {
    const user = userEvent.setup();

    render(<VehicleForm isSubmitting={false} onSubmit={vi.fn()} submitLabel="Save vehicle" />);

    await user.click(
      screen.getByRole("button", {
        name: "Save vehicle",
      }),
    );

    expect(screen.getByLabelText("Nickname")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nickname")).toHaveFocus();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
