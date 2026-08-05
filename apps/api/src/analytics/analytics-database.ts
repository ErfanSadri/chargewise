import { createDatabaseConnection } from "@chargewise/database";

import { createAnalyticsRepository } from "./analytics-repository.js";

export function createAnalyticsDatabase(databaseUrl: string) {
  const connection = createDatabaseConnection(databaseUrl);

  return {
    analytics: createAnalyticsRepository(connection.db),
    close: connection.close,
  };
}
