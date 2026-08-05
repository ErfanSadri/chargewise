import { createDatabaseConnection } from "@chargewise/database";

import { createStationRepository } from "./station-repository.js";
import type { RouteSearchStationRepository } from "./route-search-service.js";

export interface RouteSearchDatabase {
  stations: RouteSearchStationRepository;
  close: () => Promise<void>;
}

export function createRouteSearchDatabase(databaseUrl: string): RouteSearchDatabase {
  const connection = createDatabaseConnection(databaseUrl);

  return {
    stations: createStationRepository(connection.db),
    close: connection.close,
  };
}
