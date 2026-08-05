import {
  favoriteListResponseSchema,
  favoriteResponseSchema,
  type PublicFavorite,
} from "@chargewise/shared";

import { requestJson, requestNoContent } from "./api-client.ts";

export const favoritesQueryKey = ["favorites"] as const;

export async function listFavorites(signal?: AbortSignal): Promise<PublicFavorite[]> {
  const response = await requestJson("/favorites", favoriteListResponseSchema, {
    ...(signal === undefined ? {} : { signal }),
  });

  return response.data;
}

export async function addFavorite(stationId: string): Promise<PublicFavorite> {
  const response = await requestJson(
    `/favorites/${encodeURIComponent(stationId)}`,
    favoriteResponseSchema,
    {
      method: "PUT",
    },
  );

  return response.data;
}

export async function removeFavorite(stationId: string): Promise<void> {
  await requestNoContent(`/favorites/${encodeURIComponent(stationId)}`, {
    method: "DELETE",
  });
}
