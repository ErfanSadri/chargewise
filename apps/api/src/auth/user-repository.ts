import { type ChargeWiseDatabase, users } from "@chargewise/database";
import { eq } from "drizzle-orm";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export interface UserRepository {
  create: (input: CreateUserInput) => Promise<UserRecord>;
  findByEmail: (email: string) => Promise<UserRecord | null>;
  findById: (id: string) => Promise<UserRecord | null>;
}

/**
 * The normal database and a Drizzle transaction both expose these operations.
 * This allows registration to create the user inside a transaction later.
 */
export type UserDatabase = Pick<ChargeWiseDatabase, "insert" | "select">;

const userSelection = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export function createUserRepository(database: UserDatabase): UserRepository {
  return {
    async create(input) {
      const [createdUser] = await database
        .insert(users)
        .values({
          email: input.email,
          passwordHash: input.passwordHash,
        })
        .returning(userSelection);

      if (createdUser === undefined) {
        throw new Error("Database did not return the created user");
      }

      return createdUser;
    },

    async findByEmail(email) {
      const [user] = await database
        .select(userSelection)
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      return user ?? null;
    },

    async findById(id) {
      const [user] = await database
        .select(userSelection)
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return user ?? null;
    },
  };
}
