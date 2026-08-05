CREATE TYPE "public"."charging_issue_type" AS ENUM('NONE', 'UNAVAILABLE', 'BROKEN', 'SLOW', 'PAYMENT', 'OCCUPIED', 'OTHER');--> statement-breakpoint
CREATE TABLE "charging_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"charging_minutes" integer NOT NULL,
	"wait_minutes" integer DEFAULT 0 NOT NULL,
	"energy_added_kwh" numeric(7, 3) NOT NULL,
	"total_cost" numeric(10, 2) NOT NULL,
	"starting_soc" smallint NOT NULL,
	"ending_soc" smallint NOT NULL,
	"odometer_miles" integer,
	"issue_type" charging_issue_type DEFAULT 'NONE' NOT NULL,
	"notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charging_sessions_minutes_valid_check" CHECK ("charging_sessions"."charging_minutes" > 0 AND "charging_sessions"."wait_minutes" >= 0),
	CONSTRAINT "charging_sessions_energy_positive_check" CHECK ("charging_sessions"."energy_added_kwh" > 0 AND "charging_sessions"."energy_added_kwh" <> 'NaN'::numeric),
	CONSTRAINT "charging_sessions_cost_nonnegative_check" CHECK ("charging_sessions"."total_cost" >= 0 AND "charging_sessions"."total_cost" <> 'NaN'::numeric),
	CONSTRAINT "charging_sessions_soc_valid_check" CHECK ("charging_sessions"."starting_soc" BETWEEN 0 AND 99 AND "charging_sessions"."ending_soc" BETWEEN 1 AND 100 AND "charging_sessions"."ending_soc" > "charging_sessions"."starting_soc"),
	CONSTRAINT "charging_sessions_odometer_nonnegative_check" CHECK ("charging_sessions"."odometer_miles" IS NULL OR "charging_sessions"."odometer_miles" >= 0),
	CONSTRAINT "charging_sessions_notes_not_blank_check" CHECK ("charging_sessions"."notes" IS NULL OR length(btrim("charging_sessions"."notes")) > 0),
	CONSTRAINT "charging_sessions_timestamps_valid_check" CHECK (isfinite("charging_sessions"."started_at") AND isfinite("charging_sessions"."created_at") AND isfinite("charging_sessions"."updated_at") AND "charging_sessions"."updated_at" >= "charging_sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charging_sessions_user_started_at_index" ON "charging_sessions" USING btree ("user_id","started_at","id");--> statement-breakpoint
CREATE INDEX "charging_sessions_vehicle_id_index" ON "charging_sessions" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "charging_sessions_station_id_index" ON "charging_sessions" USING btree ("station_id");