import type { ChargeWiseDatabase } from "@chargewise/database";
import { describe, expect, it, vi } from "vitest";

import { createRunUserTransaction } from "./authentication-database.js";
import type { UserDatabase } from "./user-repository.js";

describe("authentication database transaction adapter", () => {
  it("runs the user operation with a transaction-backed repository", async () => {
    const transactionDatabase = {
      insert: vi.fn(),
      select: vi.fn(),
    } as unknown as UserDatabase;

    const transaction = vi.fn(async (operation: (database: UserDatabase) => Promise<string>) =>
      operation(transactionDatabase),
    );

    const database = {
      transaction,
    } as unknown as ChargeWiseDatabase;

    const runUserTransaction = createRunUserTransaction(database);
    const operation = vi.fn(async (users) => {
      expect(users).toEqual(
        expect.objectContaining({
          create: expect.any(Function),
          findByEmail: expect.any(Function),
          findById: expect.any(Function),
        }),
      );

      return "transaction-result";
    });

    await expect(runUserTransaction(operation)).resolves.toBe("transaction-result");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("propagates failures so Drizzle can roll back the transaction", async () => {
    const transactionError = new Error("private transaction operation failure");

    const transactionDatabase = {
      insert: vi.fn(),
      select: vi.fn(),
    } as unknown as UserDatabase;

    const transaction = vi.fn(async (operation: (database: UserDatabase) => Promise<unknown>) =>
      operation(transactionDatabase),
    );

    const database = {
      transaction,
    } as unknown as ChargeWiseDatabase;

    const runUserTransaction = createRunUserTransaction(database);

    await expect(
      runUserTransaction(async () => {
        throw transactionError;
      }),
    ).rejects.toBe(transactionError);
  });
});
