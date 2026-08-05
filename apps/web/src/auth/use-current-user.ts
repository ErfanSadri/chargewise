import type { PublicUser } from "@chargewise/shared";
import { useQuery } from "@tanstack/react-query";

import { authenticationQueryKey, getCurrentUser } from "../api/auth-client.ts";
import { isUnauthenticatedError } from "../api/api-client.ts";

export function useCurrentUser() {
  return useQuery<PublicUser | null>({
    queryKey: authenticationQueryKey,
    queryFn: async ({ signal }) => {
      try {
        return await getCurrentUser(signal);
      } catch (error: unknown) {
        if (isUnauthenticatedError(error)) {
          return null;
        }

        throw error;
      }
    },
  });
}
