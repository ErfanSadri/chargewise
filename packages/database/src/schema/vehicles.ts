import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: varchar("nickname", { length: 80 }).notNull(),
    make: varchar("make", { length: 80 }).notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    year: smallint("year").notNull(),
    batteryCapacityKwh: numeric("battery_capacity_kwh", { precision: 6, scale: 2 }),
    efficiencyMiPerKwh: numeric("efficiency_mi_per_kwh", { precision: 5, scale: 2 }),
    connectorTypes: text("connector_types").array().notNull(),
    preferredNetworks: text("preferred_networks")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("vehicles_user_id_index").on(table.userId),
    uniqueIndex("vehicles_one_default_per_user_index")
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
    check("vehicles_nickname_not_blank_check", sql`length(btrim(${table.nickname})) > 0`),
    check("vehicles_make_not_blank_check", sql`length(btrim(${table.make})) > 0`),
    check("vehicles_model_not_blank_check", sql`length(btrim(${table.model})) > 0`),
    check("vehicles_year_range_check", sql`${table.year} BETWEEN 1990 AND 2100`),
    check(
      "vehicles_battery_capacity_positive_check",
      sql`${table.batteryCapacityKwh} IS NULL OR (${table.batteryCapacityKwh} > 0 AND ${table.batteryCapacityKwh} <> 'NaN'::numeric)`,
    ),
    check(
      "vehicles_efficiency_positive_check",
      sql`${table.efficiencyMiPerKwh} IS NULL OR (${table.efficiencyMiPerKwh} > 0 AND ${table.efficiencyMiPerKwh} <> 'NaN'::numeric)`,
    ),
    check(
      "vehicles_connector_types_supported_check",
      sql`cardinality(${table.connectorTypes}) > 0 AND array_position(${table.connectorTypes}, NULL) IS NULL AND ${table.connectorTypes} <@ ARRAY['CCS', 'NACS', 'J1772', 'CHADEMO']::text[]`,
    ),
    check(
      "vehicles_preferred_networks_valid_check",
      sql`array_position(${table.preferredNetworks}, NULL) IS NULL`,
    ),
    check(
      "vehicles_timestamps_valid_check",
      sql`isfinite(${table.createdAt}) AND isfinite(${table.updatedAt}) AND ${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);
