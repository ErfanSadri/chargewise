import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique("users_email_unique"),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "users_email_normalized_check",
      sql`${table.email} = lower(btrim(${table.email})) AND length(${table.email}) > 0`,
    ),
    check("users_password_hash_not_blank_check", sql`length(btrim(${table.passwordHash})) > 0`),
    check(
      "users_timestamps_valid_check",
      sql`isfinite(${table.createdAt}) AND isfinite(${table.updatedAt}) AND ${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);
