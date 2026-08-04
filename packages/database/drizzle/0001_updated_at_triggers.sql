CREATE OR REPLACE FUNCTION "public"."set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW."updated_at" = now();
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "users_set_updated_at"
BEFORE UPDATE ON "users"
FOR EACH ROW
EXECUTE FUNCTION "public"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "vehicles_set_updated_at"
BEFORE UPDATE ON "vehicles"
FOR EACH ROW
EXECUTE FUNCTION "public"."set_updated_at"();
