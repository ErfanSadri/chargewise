import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api/api-client.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) =>
        error instanceof ApiError && error.statusCode >= 500 && failureCount < 1,
    },
    mutations: {
      retry: false,
    },
  },
});
