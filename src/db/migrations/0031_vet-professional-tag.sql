CREATE TYPE "public"."vet_practice_scope" AS ENUM('GENERAL', 'SPECIALIST', 'NOT_DECLARED');--> statement-breakpoint
CREATE TYPE "public"."vet_tag" AS ENUM('STUDENT', 'UNLICENSED', 'LICENSED', 'TRUSTED');--> statement-breakpoint
CREATE TABLE "vet_tag_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"tag" "vet_tag" NOT NULL,
	"practice_scope" "vet_practice_scope",
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason_fa" text,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"granted_by_account_id" uuid,
	"ended_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vet_tag_assignment_scope_fits_tag" CHECK (("vet_tag_assignment"."tag" = 'STUDENT') = ("vet_tag_assignment"."practice_scope" is null)),
	CONSTRAINT "vet_tag_assignment_ends_after_start" CHECK ("vet_tag_assignment"."ended_at" is null or "vet_tag_assignment"."ended_at" >= "vet_tag_assignment"."started_at")
);
--> statement-breakpoint
ALTER TABLE "vet_tag_assignment" ADD CONSTRAINT "vet_tag_assignment_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_tag_assignment" ADD CONSTRAINT "vet_tag_assignment_granted_by_account_id_account_id_fk" FOREIGN KEY ("granted_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_tag_assignment" ADD CONSTRAINT "vet_tag_assignment_ended_by_account_id_account_id_fk" FOREIGN KEY ("ended_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vet_tag_assignment_current_key" ON "vet_tag_assignment" USING btree ("account_id") WHERE "vet_tag_assignment"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "vet_tag_assignment_account_idx" ON "vet_tag_assignment" USING btree ("account_id","started_at");--> statement-breakpoint
-- History is the record (Phase 2.5 PROMPT-002, DEC-0188): a row may only be ended, once, and never deleted.
CREATE FUNCTION "vet_tag_assignment_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vet_tag_assignment history cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."ended_at" IS NOT NULL THEN
    RAISE EXCEPTION 'an ended vet_tag_assignment cannot change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."ended_at" IS NULL
     OR NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."account_id" IS DISTINCT FROM OLD."account_id"
     OR NEW."tag" IS DISTINCT FROM OLD."tag"
     OR NEW."practice_scope" IS DISTINCT FROM OLD."practice_scope"
     OR NEW."started_at" IS DISTINCT FROM OLD."started_at"
     OR NEW."source_type" IS DISTINCT FROM OLD."source_type"
     OR NEW."source_id" IS DISTINCT FROM OLD."source_id"
     OR NEW."granted_by_account_id" IS DISTINCT FROM OLD."granted_by_account_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'a vet_tag_assignment may only be ended' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "vet_tag_assignment_guard" BEFORE UPDATE OR DELETE ON "vet_tag_assignment" FOR EACH ROW EXECUTE FUNCTION "vet_tag_assignment_guard"();--> statement-breakpoint
-- Backfill: a Phase 2 profile with a verified council code and an owner reads as a doctor without a licence.
-- Nothing recorded a licence, a payment or general/specialist, so none is invented. The Phase 1 TRUSTED_VET
-- role is a permission and stays exactly as it is; it is not turned into a public tag here.
INSERT INTO "vet_tag_assignment" ("account_id", "tag", "practice_scope", "started_at", "source_type", "source_id")
SELECT p."account_id", 'UNLICENSED', 'NOT_DECLARED', p."council_verified_at", 'BACKFILL_VET_PROFILE', p."id"
FROM "vet_profile" AS p
WHERE p."account_id" IS NOT NULL AND p."council_verified_at" IS NOT NULL AND p."merged_into_profile_id" IS NULL;