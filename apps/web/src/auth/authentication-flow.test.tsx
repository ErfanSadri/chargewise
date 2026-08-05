import type { PublicUser } from "@chargewise/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, type RouteObject, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";

import { ApiError } from "../api/api-client.ts";
import { getCurrentUser, loginUser, registerUser } from "../api/auth-client.ts";
import { AuthenticationPage } from "../pages/AuthenticationPage.tsx";
import { RequireAuthentication } from "./RequireAuthentication.tsx";

vi.mock("../api/auth-client.ts", () => ({
  authenticationQueryKey: ["authentication", "current-user"],
  getCurrentUser: vi.fn(),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
}));

const publicUser: PublicUser = {
  id: "73a9ec58-90f7-45b8-b53a-bc3a25a92ae4",
  email: "driver@example.com",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

type MemoryRouterOptions = NonNullable<Parameters<typeof createMemoryRouter>[1]>;

type InitialEntries = NonNullable<MemoryRouterOptions["initialEntries"]>;

function renderRoutes(routes: RouteObject[], initialEntries: InitialEntries) {
  const router = createMemoryRouter(routes, {
    initialEntries,
  });

  const queryClient = createTestQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return {
    queryClient,
    router,
  };
}

function LoginDestination() {
  const location = useLocation();

  const state =
    typeof location.state === "object" && location.state !== null && "from" in location.state
      ? location.state
      : undefined;

  return <p>Login destination: {typeof state?.from === "string" ? state.from : "missing"}</p>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("authentication UI flow", () => {
  it("validates credentials before sending registration", async () => {
    const user = userEvent.setup();

    renderRoutes(
      [
        {
          path: "/register",
          element: <AuthenticationPage mode="register" />,
        },
      ],
      ["/register"],
    );

    await user.type(screen.getByLabelText("Email address"), "driver@example.com");

    await user.type(screen.getByLabelText("Password"), "short");

    await user.click(
      screen.getByRole("button", {
        name: "Create account",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must contain at least 12 characters",
    );

    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("logs in, stores the user, and returns to the protected destination", async () => {
    vi.mocked(loginUser).mockResolvedValue(publicUser);

    const user = userEvent.setup();

    const { queryClient } = renderRoutes(
      [
        {
          path: "/login",
          element: <AuthenticationPage mode="login" />,
        },
        {
          path: "/vehicles",
          element: <h1>Vehicles destination</h1>,
        },
      ],
      [
        {
          pathname: "/login",
          state: {
            from: "/vehicles",
          },
        },
      ],
    );

    await user.type(screen.getByLabelText("Email address"), " Driver@Example.com ");

    await user.type(screen.getByLabelText("Password"), "correct-password-123");

    await user.click(
      screen.getByRole("button", {
        name: "Sign in",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Vehicles destination",
      }),
    ).toBeInTheDocument();

    expect(loginUser).toHaveBeenCalledWith({
      email: "driver@example.com",
      password: "correct-password-123",
    });

    expect(queryClient.getQueryData(["authentication", "current-user"])).toEqual(publicUser);
  });

  it("redirects an unauthenticated protected request to login", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(
      new ApiError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      }),
    );

    renderRoutes(
      [
        {
          element: <RequireAuthentication />,
          children: [
            {
              path: "/vehicles",
              element: <h1>Protected vehicles</h1>,
            },
          ],
        },
        {
          path: "/login",
          element: <LoginDestination />,
        },
      ],
      ["/vehicles"],
    );

    expect(await screen.findByText("Login destination: /vehicles")).toBeInTheDocument();

    await waitFor(() => {
      expect(getCurrentUser).toHaveBeenCalledOnce();
    });

    expect(
      screen.queryByRole("heading", {
        name: "Protected vehicles",
      }),
    ).not.toBeInTheDocument();
  });
});
