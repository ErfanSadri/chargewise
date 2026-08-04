import { createDatabaseConnection, type ChargeWiseDatabase } from "@chargewise/database";

import type { RunUserTransaction } from "./authentication-service.js";
import { createUserRepository, type UserRepository } from "./user-repository.js";

export interface AuthenticationDatabase {
  users: UserRepository;
  runUserTransaction: RunUserTransaction;
  close: () => Promise<void>;
}

export function createRunUserTransaction(database: ChargeWiseDatabase): RunUserTransaction {
  return async (operation) =>
    database.transaction(async (transaction) => operation(createUserRepository(transaction)));
}

export function createAuthenticationDatabase(databaseUrl: string): AuthenticationDatabase {
  const connection = createDatabaseConnection(databaseUrl);

  return {
    users: createUserRepository(connection.db),
    runUserTransaction: createRunUserTransaction(connection.db),
    close: connection.close,
  };
}
