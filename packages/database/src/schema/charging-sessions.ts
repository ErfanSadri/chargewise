import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { stations } from "./stations.js";
import { users } from "./users.js";
import { vehicles } from "./vehicles.js";

export const chargingIssueType = pgEnum("charging_issue_type", [
  "NONE",
  "UNAVAILABLE",
  "BROKEN",
  "SLOW",
  "PAYMENT",
  "OCCUPIED",
  "OTHER",
]);

export const chargingSessions = pgTable(
  "charging_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    chargingMinutes: integer("charging_minutes").notNull(),
    waitMinutes: integer("wait_minutes").default(0).notNull(),
    energyAddedKwh: numeric("energy_added_kwh", {
      precision: 7,
      scale: 3,
    }).notNull(),
    totalCost: numeric("total_cost", {
      precision: 10,
      scale: 2,
    }).notNull(),
    startingSoc: smallint("starting_soc").notNull(),
    endingSoc: smallint("ending_soc").notNull(),
    odometerMiles: integer("odometer_miles"),
    issueType: chargingIssueType("issue_type").default("NONE").notNull(),
    notes: varchar("notes", { length: 1000 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("charging_sessions_user_started_at_index").on(table.userId, table.startedAt, table.id),
    index("charging_sessions_vehicle_id_index").on(table.vehicleId),
    index("charging_sessions_station_id_index").on(table.stationId),
    check(
      "charging_sessions_minutes_valid_check",
      sql`${table.chargingMinutes} > 0 AND ${table.waitMinutes} >= 0`,
    ),
    check(
      "charging_sessions_energy_positive_check",
      sql`${table.energyAddedKwh} > 0 AND ${table.energyAddedKwh} <> 'NaN'::numeric`,
    ),
    check(
      "charging_sessions_cost_nonnegative_check",
      sql`${table.totalCost} >= 0 AND ${table.totalCost} <> 'NaN'::numeric`,
    ),
    check(
      "charging_sessions_soc_valid_check",
      sql`${table.startingSoc} BETWEEN 0 AND 99 AND ${table.endingSoc} BETWEEN 1 AND 100 AND ${table.endingSoc} > ${table.startingSoc}`,
    ),
    check(
      "charging_sessions_odometer_nonnegative_check",
      sql`${table.odometerMiles} IS NULL OR ${table.odometerMiles} >= 0`,
    ),
    check(
      "charging_sessions_notes_not_blank_check",
      sql`${table.notes} IS NULL OR length(btrim(${table.notes})) > 0`,
    ),
    check(
      "charging_sessions_timestamps_valid_check",
      sql`isfinite(${table.startedAt}) AND isfinite(${table.createdAt}) AND isfinite(${table.updatedAt}) AND ${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);
