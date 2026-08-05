import {
  vehicleListResponseSchema,
  vehicleResponseSchema,
  type CreateVehicleRequest,
  type PublicVehicle,
  type UpdateVehicleRequest,
} from "@chargewise/shared";

import { requestJson, requestNoContent } from "./api-client.ts";

export const vehiclesQueryKey = ["vehicles"] as const;

export async function listVehicles(signal?: AbortSignal): Promise<PublicVehicle[]> {
  const response = await requestJson("/vehicles", vehicleListResponseSchema, {
    ...(signal === undefined ? {} : { signal }),
  });

  return response.data;
}

export async function createVehicle(input: CreateVehicleRequest): Promise<PublicVehicle> {
  const response = await requestJson("/vehicles", vehicleResponseSchema, {
    method: "POST",
    body: input,
  });

  return response.data;
}

export async function updateVehicle(
  vehicleId: string,
  input: UpdateVehicleRequest,
): Promise<PublicVehicle> {
  const response = await requestJson(
    `/vehicles/${encodeURIComponent(vehicleId)}`,
    vehicleResponseSchema,
    {
      method: "PATCH",
      body: input,
    },
  );

  return response.data;
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  await requestNoContent(`/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: "DELETE",
  });
}
