import type { CreateChargingSessionRequest, PublicChargingSession } from "@chargewise/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createChargingSession,
  deleteChargingSession,
  listChargingSessions,
  updateChargingSession,
} from "./charging-session-client.ts";

const chargingSession: PublicChargingSession = {
  id: "0f30c755-32c8-49c7-9aef-f53f761355c5",
  vehicleId: "6f719184-e691-4c73-bf4f-4e353c40cd99",
  stationId: "ecba119c-963d-4931-acb8-1320791258be",
  startedAt: "2026-08-01T19:00:00.000Z",
  chargingMinutes: 31,
  waitMinutes: 8,
  energyAddedKwh: "42.700",
  totalCost: "12.50",
  startingSoc: 18,
  endingSoc: 79,
  odometerMiles: 15420,
  issueType: "NONE",
  notes: "Successful session",
  createdAt: "2026-08-01T20:00:00.000Z",
  updatedAt: "2026-08-01T20:00:00.000Z",
};

const createInput: CreateChargingSessionRequest = {
  vehicleId: chargingSession.vehicleId,
  stationId: chargingSession.stationId,
  startedAt: chargingSession.startedAt,
  chargingMinutes: chargingSession.chargingMinutes,
  waitMinutes: chargingSession.waitMinutes,
  energyAddedKwh: chargingSession.energyAddedKwh,
  totalCost: chargingSession.totalCost,
  startingSoc: chargingSession.startingSoc,
  endingSoc: chargingSession.endingSoc,
  odometerMiles: chargingSession.odometerMiles,
  issueType: chargingSession.issueType,
  notes: chargingSession.notes,
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("charging-session client", () => {
  it("loads a filtered cursor page", async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify({
          data: [chargingSession],
          meta: {
            nextCursor: null,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      listChargingSessions({
        from: "2026-08-01",
        to: "2026-08-31",
        cursor: chargingSession.id,
      }),
    ).resolves.toEqual({
      data: [chargingSession],
      meta: {
        nextCursor: null,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/charging-sessions?from=2026-08-01&to=2026-08-31&cursor=${chargingSession.id}`,
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("creates and updates sessions with typed JSON requests", async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify({
          data: chargingSession,
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(createChargingSession(createInput)).resolves.toEqual(chargingSession);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            ...chargingSession,
            notes: "Updated",
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      updateChargingSession(chargingSession.id, {
        notes: "Updated",
      }),
    ).resolves.toMatchObject({
      id: chargingSession.id,
      notes: "Updated",
    });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(createInput),
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({
        notes: "Updated",
      }),
    });
  });

  it("deletes a session", async () => {
    const fetchMock = mockFetch(
      new Response(null, {
        status: 204,
      }),
    );

    await expect(deleteChargingSession(chargingSession.id)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/charging-sessions/${chargingSession.id}`,
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
      }),
    );
  });
});
