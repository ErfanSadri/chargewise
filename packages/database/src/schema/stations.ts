import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const geographyPoint = customType<{ data: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
});

export const stations = pgTable(
  "stations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: varchar("source", { length: 30 }).notNull(),
    sourceStationId: varchar("source_station_id", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    network: varchar("network", { length: 120 }),
    streetAddress: varchar("street_address", { length: 200 }),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 40 }),
    postalCode: varchar("postal_code", { length: 20 }),
    location: geographyPoint("location").notNull(),
    accessCode: varchar("access_code", { length: 40 }),
    statusCode: varchar("status_code", { length: 40 }),
    level2PortCount: integer("level_2_port_count").default(0).notNull(),
    dcFastPortCount: integer("dc_fast_port_count").default(0).notNull(),
    connectorCodes: text("connector_codes")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    rawSourceData: jsonb("raw_source_data"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("stations_source_identity_unique").on(table.source, table.sourceStationId),
    index("stations_location_gist_index").using("gist", table.location),
    index("stations_network_index").on(table.network),
    check("stations_source_not_blank_check", sql`length(btrim(${table.source})) > 0`),
    check(
      "stations_source_station_id_not_blank_check",
      sql`length(btrim(${table.sourceStationId})) > 0`,
    ),
    check("stations_name_not_blank_check", sql`length(btrim(${table.name})) > 0`),
    check(
      "stations_port_counts_nonnegative_check",
      sql`${table.level2PortCount} >= 0 AND ${table.dcFastPortCount} >= 0`,
    ),
    check(
      "stations_connector_codes_valid_check",
      sql`array_position(${table.connectorCodes}, NULL) IS NULL AND ${table.connectorCodes} <@ ARRAY['CCS', 'NACS', 'J1772', 'CHADEMO']::text[]`,
    ),
    check(
      "stations_timestamps_finite_check",
      sql`(${table.sourceUpdatedAt} IS NULL OR isfinite(${table.sourceUpdatedAt})) AND isfinite(${table.lastSyncedAt})`,
    ),
  ],
);
