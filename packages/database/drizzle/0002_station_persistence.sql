CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(30) NOT NULL,
	"source_station_id" varchar(80) NOT NULL,
	"name" varchar(200) NOT NULL,
	"network" varchar(120),
	"street_address" varchar(200),
	"city" varchar(120),
	"state" varchar(40),
	"postal_code" varchar(20),
	"location" geography(Point,4326) NOT NULL,
	"access_code" varchar(40),
	"status_code" varchar(40),
	"level_2_port_count" integer DEFAULT 0 NOT NULL,
	"dc_fast_port_count" integer DEFAULT 0 NOT NULL,
	"connector_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"raw_source_data" jsonb,
	"source_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stations_source_identity_unique" UNIQUE("source","source_station_id"),
	CONSTRAINT "stations_source_not_blank_check" CHECK (length(btrim("stations"."source")) > 0),
	CONSTRAINT "stations_source_station_id_not_blank_check" CHECK (length(btrim("stations"."source_station_id")) > 0),
	CONSTRAINT "stations_name_not_blank_check" CHECK (length(btrim("stations"."name")) > 0),
	CONSTRAINT "stations_port_counts_nonnegative_check" CHECK ("stations"."level_2_port_count" >= 0 AND "stations"."dc_fast_port_count" >= 0),
	CONSTRAINT "stations_connector_codes_valid_check" CHECK (array_position("stations"."connector_codes", NULL) IS NULL AND "stations"."connector_codes" <@ ARRAY['CCS', 'NACS', 'J1772', 'CHADEMO']::text[]),
	CONSTRAINT "stations_timestamps_finite_check" CHECK (("stations"."source_updated_at" IS NULL OR isfinite("stations"."source_updated_at")) AND isfinite("stations"."last_synced_at"))
);
--> statement-breakpoint
CREATE INDEX "stations_location_gist_index" ON "stations" USING gist ("location");--> statement-breakpoint
CREATE INDEX "stations_network_index" ON "stations" USING btree ("network");