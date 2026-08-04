CREATE EXTENSION IF NOT EXISTS "postgis";
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_normalized_check" CHECK ("users"."email" = lower(btrim("users"."email")) AND length("users"."email") > 0),
	CONSTRAINT "users_password_hash_not_blank_check" CHECK (length(btrim("users"."password_hash")) > 0),
	CONSTRAINT "users_timestamps_valid_check" CHECK (isfinite("users"."created_at") AND isfinite("users"."updated_at") AND "users"."updated_at" >= "users"."created_at")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nickname" varchar(80) NOT NULL,
	"make" varchar(80) NOT NULL,
	"model" varchar(120) NOT NULL,
	"year" smallint NOT NULL,
	"battery_capacity_kwh" numeric(6, 2),
	"efficiency_mi_per_kwh" numeric(5, 2),
	"connector_types" text[] NOT NULL,
	"preferred_networks" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_nickname_not_blank_check" CHECK (length(btrim("vehicles"."nickname")) > 0),
	CONSTRAINT "vehicles_make_not_blank_check" CHECK (length(btrim("vehicles"."make")) > 0),
	CONSTRAINT "vehicles_model_not_blank_check" CHECK (length(btrim("vehicles"."model")) > 0),
	CONSTRAINT "vehicles_year_range_check" CHECK ("vehicles"."year" BETWEEN 1990 AND 2100),
	CONSTRAINT "vehicles_battery_capacity_positive_check" CHECK ("vehicles"."battery_capacity_kwh" IS NULL OR ("vehicles"."battery_capacity_kwh" > 0 AND "vehicles"."battery_capacity_kwh" <> 'NaN'::numeric)),
	CONSTRAINT "vehicles_efficiency_positive_check" CHECK ("vehicles"."efficiency_mi_per_kwh" IS NULL OR ("vehicles"."efficiency_mi_per_kwh" > 0 AND "vehicles"."efficiency_mi_per_kwh" <> 'NaN'::numeric)),
	CONSTRAINT "vehicles_connector_types_supported_check" CHECK (cardinality("vehicles"."connector_types") > 0 AND array_position("vehicles"."connector_types", NULL) IS NULL AND "vehicles"."connector_types" <@ ARRAY['CCS', 'NACS', 'J1772', 'CHADEMO']::text[]),
	CONSTRAINT "vehicles_preferred_networks_valid_check" CHECK (array_position("vehicles"."preferred_networks", NULL) IS NULL),
	CONSTRAINT "vehicles_timestamps_valid_check" CHECK (isfinite("vehicles"."created_at") AND isfinite("vehicles"."updated_at") AND "vehicles"."updated_at" >= "vehicles"."created_at")
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicles_user_id_index" ON "vehicles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_one_default_per_user_index" ON "vehicles" USING btree ("user_id") WHERE "vehicles"."is_default" = true;
