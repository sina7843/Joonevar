CREATE TYPE "public"."vet_review_check_result" AS ENUM('PASS', 'FAIL', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TABLE "vet_case_review_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"submission_version" integer NOT NULL,
	"check_code" text NOT NULL,
	"result" "vet_review_check_result" NOT NULL,
	"note_fa" text,
	"reviewer_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vet_case_review_check_fail_has_note" CHECK ("vet_case_review_check"."result" <> 'FAIL' or "vet_case_review_check"."note_fa" is not null)
);
--> statement-breakpoint
ALTER TABLE "vet_professional_case" ADD COLUMN "claimed_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "vet_professional_case" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vet_case_review_check" ADD CONSTRAINT "vet_case_review_check_case_id_vet_professional_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."vet_professional_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_case_review_check" ADD CONSTRAINT "vet_case_review_check_reviewer_account_id_account_id_fk" FOREIGN KEY ("reviewer_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vet_case_review_check_case_idx" ON "vet_case_review_check" USING btree ("case_id","submission_version","check_code","created_at");--> statement-breakpoint
ALTER TABLE "vet_professional_case" ADD CONSTRAINT "vet_professional_case_claimed_by_account_id_account_id_fk" FOREIGN KEY ("claimed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vet_professional_case_claim_idx" ON "vet_professional_case" USING btree ("claimed_by_account_id");--> statement-breakpoint
-- Hand-written (PHASE-2.5 PROMPT-007). A case of the workbench that is under review with nobody holding
-- it goes back to the queue before the claim rule exists; nothing is invented about who reviewed it.
UPDATE "vet_professional_case" SET "status" = 'SUBMITTED', "version" = "version" + 1, "updated_at" = now()
  WHERE "status" = 'UNDER_REVIEW' AND "legacy_application_id" IS NULL;--> statement-breakpoint
ALTER TABLE "vet_professional_case" ADD CONSTRAINT "vet_professional_case_claim_matches_review" CHECK (("vet_professional_case"."claimed_by_account_id" is null) = ("vet_professional_case"."claimed_at" is null) and ("vet_professional_case"."claimed_by_account_id" is null or "vet_professional_case"."status" = 'UNDER_REVIEW') and ("vet_professional_case"."status" <> 'UNDER_REVIEW' or "vet_professional_case"."claimed_by_account_id" is not null or "vet_professional_case"."legacy_application_id" is not null));--> statement-breakpoint
-- A recorded review check is evidence of what a reviewer saw: never edited, never removed.
CREATE OR REPLACE FUNCTION vet_case_review_check_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vet_case_review_check is append-only' USING ERRCODE = '23001';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER vet_case_review_check_immutable BEFORE UPDATE OR DELETE ON "vet_case_review_check"
  FOR EACH ROW EXECUTE FUNCTION vet_case_review_check_guard();--> statement-breakpoint
-- The audit trail is append-only at the database, not only by convention in the code.
-- The one change allowed is the foreign key's own ON DELETE SET NULL of the actor: every other field stays.
CREATE OR REPLACE FUNCTION audit_event_guard() RETURNS trigger AS $$
DECLARE
  restored "audit_event";
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.actor_account_id IS NOT NULL AND NEW.actor_account_id IS NULL THEN
    restored := NEW;
    restored.actor_account_id := OLD.actor_account_id;
    IF restored IS NOT DISTINCT FROM OLD THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_event is append-only' USING ERRCODE = '23001';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION audit_event_guard();