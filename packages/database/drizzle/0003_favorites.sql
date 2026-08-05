CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_station_primary_key" PRIMARY KEY("user_id","station_id"),
	CONSTRAINT "favorites_created_at_finite_check" CHECK (isfinite("favorites"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorites_station_id_index" ON "favorites" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "favorites_user_created_at_index" ON "favorites" USING btree ("user_id","created_at");