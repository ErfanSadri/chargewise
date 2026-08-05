import { type ChargeWiseDatabase, stations } from "@chargewise/database";
import { sql } from "drizzle-orm";

import type { NormalizedStation } from "../providers/index.js";
import type { RouteSearchStationRepository } from "./route-search-service.js";

const stationSource = "NLR_AFDC";

export type StationDatabase = Pick<ChargeWiseDatabase, "insert">;

export function createStationRepository(database: StationDatabase): RouteSearchStationRepository {
  return {
    async upsertMany(stationRecords) {
      const uniqueStations = deduplicateStations(stationRecords);

      if (uniqueStations.length === 0) {
        return [];
      }

      return database
        .insert(stations)
        .values(
          uniqueStations.map((station) => ({
            source: stationSource,
            sourceStationId: station.sourceStationId,
            name: station.name,
            network: station.network,
            streetAddress: station.streetAddress,
            city: station.city,
            state: station.state,
            postalCode: station.postalCode,
            location: sql`ST_SetSRID(ST_MakePoint(${station.longitude}, ${station.latitude}), 4326)::geography`,
            accessCode: station.accessCode,
            statusCode: station.sourceStatus,
            level2PortCount: station.level2PortCount,
            dcFastPortCount: station.dcFastPortCount,
            connectorCodes: station.connectorCodes,
            sourceUpdatedAt: new Date(station.sourceUpdatedAt),
            lastSyncedAt: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: [stations.source, stations.sourceStationId],
          set: {
            name: sql`excluded."name"`,
            network: sql`excluded."network"`,
            streetAddress: sql`excluded."street_address"`,
            city: sql`excluded."city"`,
            state: sql`excluded."state"`,
            postalCode: sql`excluded."postal_code"`,
            location: sql`excluded."location"`,
            accessCode: sql`excluded."access_code"`,
            statusCode: sql`excluded."status_code"`,
            level2PortCount: sql`excluded."level_2_port_count"`,
            dcFastPortCount: sql`excluded."dc_fast_port_count"`,
            connectorCodes: sql`excluded."connector_codes"`,
            sourceUpdatedAt: sql`excluded."source_updated_at"`,
            lastSyncedAt: sql`excluded."last_synced_at"`,
          },
        })
        .returning({
          sourceStationId: stations.sourceStationId,
          id: stations.id,
        });
    },
  };
}

function deduplicateStations(stationRecords: readonly NormalizedStation[]): NormalizedStation[] {
  const bySourceId = new Map<string, NormalizedStation>();

  for (const station of stationRecords) {
    bySourceId.set(station.sourceStationId, station);
  }

  return [...bySourceId.values()];
}
