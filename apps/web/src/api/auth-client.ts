import {
  currentUserResponseSchema,
  loginResponseSchema,
  registerResponseSchema,
  type LoginRequest,
  type PublicUser,
  type RegisterRequest,
} from "@chargewise/shared";

import { requestJson, requestNoContent } from "./api-client.ts";

export const authenticationQueryKey = ["authentication", "current-user"] as const;

export async function getCurrentUser(signal?: AbortSignal): Promise<PublicUser> {
  const response = await requestJson("/auth/me", currentUserResponseSchema, {
    ...(signal === undefined ? {} : { signal }),
  });

  return response.data;
}

export async function registerUser(input: RegisterRequest): Promise<PublicUser> {
  const response = await requestJson("/auth/register", registerResponseSchema, {
    method: "POST",
    body: input,
  });

  return response.data;
}

export async function loginUser(input: LoginRequest): Promise<PublicUser> {
  const response = await requestJson("/auth/login", loginResponseSchema, {
    method: "POST",
    body: input,
  });

  return response.data;
}

export async function logoutUser(): Promise<void> {
  await requestNoContent("/auth/logout", {
    method: "POST",
  });
}
