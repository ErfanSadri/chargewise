import { createDatabaseConnection } from "@chargewise/database";

import { createFavoriteRepository } from "./favorite-repository.js";

export function createFavoriteDatabase(databaseUrl: string) {
  const connection = createDatabaseConnection(databaseUrl);

  return {
    favorites: createFavoriteRepository(connection.db),
    close: connection.close,
  };
}
