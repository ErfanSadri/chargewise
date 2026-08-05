import {
  routeSearchResponseSchema,
  type RouteSearchRequest,
  type RouteSearchResponse,
} from "@chargewise/shared";

import { requestJson } from "./api-client.ts";

export async function searchRoute(input: RouteSearchRequest): Promise<RouteSearchResponse> {
  return requestJson("/routes/search", routeSearchResponseSchema, {
    method: "POST",
    body: input,
  });
}
