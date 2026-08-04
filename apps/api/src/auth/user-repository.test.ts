import { users } from "@chargewise/database";
import { describe, expect, it, vi } from "vitest";

import {
  createUserRepository,
  type CreateUserInput,
  type UserDatabase,
  type UserRecord,
} from "./user-repository.js";

const userRecord: UserRecord = {
  id: "8c30cbb4-f724-4e72-a994-f1429f758c54",
  email: "driver@example.com",
  passwordHash: "$argon2id$test-password-hash",
  createdAt: new Date("2026-08-04T12:00:00.000Z"),
  updatedAt: new Date("2026-08-04T12:00:00.000Z"),
};

function createInsertDatabase(rows: UserRecord[]) {
  const returning = vi.fn(async () => rows);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  return {
    database: {
      insert,
    } as unknown as UserDatabase,
    insert,
    values,
    returning,
  };
}

function createSelectDatabase(rows: UserRecord[]) {
  const limit = vi.fn(async () => rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    database: {
      select,
    } as unknown as UserDatabase,
    select,
    from,
    where,
    limit,
  };
}

describe("user repository", () => {
  it("creates and returns a user", async () => {
    const mock = createInsertDatabase([userRecord]);
    const repository = createUserRepository(mock.database);

    const input: CreateUserInput = {
      email: "driver@example.com",
      passwordHash: "$argon2id$test-password-hash",
    };

    await expect(repository.create(input)).resolves.toEqual(userRecord);

    expect(mock.insert).toHaveBeenCalledWith(users);
    expect(mock.values).toHaveBeenCalledWith(input);
    expect(mock.returning).toHaveBeenCalledTimes(1);
  });

  it("fails safely if PostgreSQL does not return the created row", async () => {
    const mock = createInsertDatabase([]);
    const repository = createUserRepository(mock.database);

    await expect(
      repository.create({
        email: "driver@example.com",
        passwordHash: "$argon2id$test-password-hash",
      }),
    ).rejects.toThrowError("Database did not return the created user");
  });

  it("finds a user by normalized email", async () => {
    const mock = createSelectDatabase([userRecord]);
    const repository = createUserRepository(mock.database);

    await expect(repository.findByEmail("driver@example.com")).resolves.toEqual(userRecord);

    expect(mock.from).toHaveBeenCalledWith(users);
    expect(mock.where).toHaveBeenCalledTimes(1);
    expect(mock.limit).toHaveBeenCalledWith(1);
  });

  it("finds a user by ID", async () => {
    const mock = createSelectDatabase([userRecord]);
    const repository = createUserRepository(mock.database);

    await expect(repository.findById(userRecord.id)).resolves.toEqual(userRecord);

    expect(mock.from).toHaveBeenCalledWith(users);
    expect(mock.where).toHaveBeenCalledTimes(1);
    expect(mock.limit).toHaveBeenCalledWith(1);
  });

  it("returns null when the user does not exist", async () => {
    const mock = createSelectDatabase([]);
    const repository = createUserRepository(mock.database);

    await expect(repository.findByEmail("missing@example.com")).resolves.toBeNull();

    await expect(repository.findById("8c30cbb4-f724-4e72-a994-f1429f758c54")).resolves.toBeNull();
  });
});
