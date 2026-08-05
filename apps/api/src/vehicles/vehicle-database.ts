import { createDatabaseConnection, type ChargeWiseDatabase } from "@chargewise/database";

import type { RunVehicleTransaction } from "./vehicle-service.js";
import { createVehicleRepository, type VehicleRepository } from "./vehicle-repository.js";

export interface VehicleDatabase {
  vehicles: VehicleRepository;
  runVehicleTransaction: RunVehicleTransaction;
  close: () => Promise<void>;
}

export function createRunVehicleTransaction(database: ChargeWiseDatabase): RunVehicleTransaction {
  return async (operation) =>
    database.transaction(async (transaction) => operation(createVehicleRepository(transaction)));
}

export function createVehicleDatabase(databaseUrl: string): VehicleDatabase {
  const connection = createDatabaseConnection(databaseUrl);

  return {
    vehicles: createVehicleRepository(connection.db),
    runVehicleTransaction: createRunVehicleTransaction(connection.db),
    close: connection.close,
  };
}
