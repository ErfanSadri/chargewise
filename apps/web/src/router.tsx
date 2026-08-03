import { createBrowserRouter, type RouteObject } from "react-router";

import App from "./App.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { RouteErrorPage } from "./pages/RouteErrorPage.tsx";

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
      ...developmentRoutes,
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
