import { createDatabaseConnection } from "@chargewise/database";

import { createChargingSessionRepository } from "./charging-session-repository.js";

export function createChargingSessionDatabase(databaseUrl: string) {
  const connection = createDatabaseConnection(databaseUrl);

  return {
    sessions: createChargingSessionRepository(connection.db),
    close: connection.close,
  };
}
