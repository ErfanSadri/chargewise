import type { PublicFavorite } from "@chargewise/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addFavorite, listFavorites, removeFavorite } from "./favorite-client.ts";

const favorite: PublicFavorite = {
  stationId: "ecba119c-963d-4931-acb8-1320791258be",
  name: "Westfield Fast Charging",
  network: "Electrify America",
  longitude: -118.605,
  latitude: 34.19,
  connectorCodes: ["CCS"],
  level2PortCount: 0,
  dcFastPortCount: 8,
  accessCode: "public",
  sourceStatus: "E",
  lastSyncedAt: "2026-08-02T20:00:00.000Z",
  favoritedAt: "2026-08-05T06:00:00.000Z",
  isFavorite: true,
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("favorite client", () => {
  it("loads and idempotently saves favorites", async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify({
          data: [favorite],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(listFavorites()).resolves.toEqual([favorite]);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: favorite,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(addFavorite(favorite.stationId)).resolves.toEqual(favorite);

    const [path, requestInit] = fetchMock.mock.calls[1] ?? [];

    expect(path).toBe(`/api/v1/favorites/${favorite.stationId}`);
    expect(requestInit).toMatchObject({
      method: "PUT",
      credentials: "include",
    });
  });

  it("sends an idempotent delete request", async () => {
    const fetchMock = mockFetch(
      new Response(null, {
        status: 204,
      }),
    );

    await expect(removeFavorite(favorite.stationId)).resolves.toBeUndefined();

    const [path, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(path).toBe(`/api/v1/favorites/${favorite.stationId}`);
    expect(requestInit).toMatchObject({
      method: "DELETE",
      credentials: "include",
    });
  });
});
