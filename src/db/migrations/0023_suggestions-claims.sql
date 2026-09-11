CREATE TYPE "public"."centre_claim_document_kind" AS ENUM('CENTRE_LICENCE', 'AUTHORIZATION_LETTER', 'IDENTITY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."suggestion_kind" AS ENUM('VET', 'CENTRE');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'CENTRE_CLAIM_DOCUMENT';--> statement-breakpoint
CREATE TABLE "centre_claim_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "centre_claim_document_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centre_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"claimant_name_fa" text NOT NULL,
	"role_fa" text NOT NULL,
	"phone" text,
	"statement_fa" text,
	"status" "vet_application_status" DEFAULT 'SUBMITTED' NOT NULL,
	"review_note_fa" text,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"appeal_fa" text,
	"appealed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "suggestion_kind" NOT NULL,
	"submitted_by_account_id" uuid NOT NULL,
	"display_name_fa" text NOT NULL,
	"city_id" uuid NOT NULL,
	"contact_fa" text,
	"source_fa" text NOT NULL,
	"note_fa" text,
	"status" "vet_application_status" DEFAULT 'SUBMITTED' NOT NULL,
	"review_note_fa" text,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_vet_profile_id" uuid,
	"created_centre_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "centre_claim_document" ADD CONSTRAINT "centre_claim_document_claim_id_centre_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."centre_claim"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_claim_document" ADD CONSTRAINT "centre_claim_document_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_claim" ADD CONSTRAINT "centre_claim_centre_id_centre_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_claim" ADD CONSTRAINT "centre_claim_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_claim" ADD CONSTRAINT "centre_claim_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_suggestion" ADD CONSTRAINT "directory_suggestion_submitted_by_account_id_account_id_fk" FOREIGN KEY ("submitted_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_suggestion" ADD CONSTRAINT "directory_suggestion_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_suggestion" ADD CONSTRAINT "directory_suggestion_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_suggestion" ADD CONSTRAINT "directory_suggestion_created_vet_profile_id_vet_profile_id_fk" FOREIGN KEY ("created_vet_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_suggestion" ADD CONSTRAINT "directory_suggestion_created_centre_id_centre_id_fk" FOREIGN KEY ("created_centre_id") REFERENCES "public"."centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "centre_claim_document_file_key" ON "centre_claim_document" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "centre_claim_document_claim_idx" ON "centre_claim_document" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "centre_claim_status_idx" ON "centre_claim" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "centre_claim_open_centre_key" ON "centre_claim" USING btree ("centre_id") WHERE "centre_claim"."status" in ('SUBMITTED', 'NEEDS_CORRECTION');--> statement-breakpoint
CREATE UNIQUE INDEX "centre_claim_open_account_key" ON "centre_claim" USING btree ("account_id") WHERE "centre_claim"."status" in ('SUBMITTED', 'NEEDS_CORRECTION');--> statement-breakpoint
CREATE INDEX "directory_suggestion_status_idx" ON "directory_suggestion" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "directory_suggestion_account_idx" ON "directory_suggestion" USING btree ("submitted_by_account_id","created_at");