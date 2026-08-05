import { createBrowserRouter, type RouteObject } from "react-router";

import App from "./App.tsx";
import { RequireAuthentication } from "./auth/RequireAuthentication.tsx";
import { AuthenticationPage } from "./pages/AuthenticationPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { RouteErrorPage } from "./pages/RouteErrorPage.tsx";
import { VehiclesPage } from "./pages/VehiclesPage.tsx";

const developmentRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: "diagnostics",
        lazy: async () => {
          const { DiagnosticsPage } = await import("./pages/DiagnosticsPage.tsx");

          return { Component: DiagnosticsPage };
        },
      },
    ]
  : [];

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "login",
        element: <AuthenticationPage mode="login" />,
      },
      {
        path: "register",
        element: <AuthenticationPage mode="register" />,
      },
      {
        element: <RequireAuthentication />,
        children: [
          {
            path: "vehicles",
            element: <VehiclesPage />,
          },
        ],
      },
      ...developmentRoutes,
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
