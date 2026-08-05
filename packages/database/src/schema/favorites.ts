import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { stations } from "./stations.js";
import { users } from "./users.js";

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "favorites_user_station_primary_key",
      columns: [table.userId, table.stationId],
    }),
    index("favorites_station_id_index").on(table.stationId),
    index("favorites_user_created_at_index").on(table.userId, table.createdAt),
    check("favorites_created_at_finite_check", sql`isfinite(${table.createdAt})`),
  ],
);
