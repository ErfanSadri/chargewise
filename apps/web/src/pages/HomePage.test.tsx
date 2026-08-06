import type { PublicUser } from "@chargewise/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/api-client.ts";
import { getCurrentUser } from "../api/auth-client.ts";
import { HomePage } from "./HomePage.tsx";

vi.mock("../api/auth-client.ts", () => ({
  authenticationQueryKey: ["authentication", "current-user"],
  getCurrentUser: vi.fn(),
}));

const publicUser: PublicUser = {
  id: "73a9ec58-90f7-45b8-b53a-bc3a25a92ae4",
  email: "driver@example.com",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
};

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <HomePage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("home page", () => {
  it("shows route-planning actions to an authenticated user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(publicUser);

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Where are you driving today?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Plan a route",
      }),
    ).toHaveAttribute("href", "/routes");
    expect(
      screen.queryByRole("link", {
        name: "Create your account",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps account actions for a signed-out visitor", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(
      new ApiError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("link", {
        name: "Create your account",
      }),
    ).toHaveAttribute("href", "/register");
    expect(
      screen.getByRole("link", {
        name: "Sign in",
      }),
    ).toHaveAttribute("href", "/login");
  });
});
