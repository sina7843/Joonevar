CREATE TYPE "public"."vet_application_document_kind" AS ENUM('COUNCIL_CARD', 'PRACTICE_LICENCE', 'IDENTITY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."vet_application_kind" AS ENUM('PROFILE', 'CLAIM');--> statement-breakpoint
CREATE TYPE "public"."vet_application_status" AS ENUM('SUBMITTED', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
ALTER TYPE "public"."account_role_name" ADD VALUE 'REVIEW_OPERATOR';--> statement-breakpoint
ALTER TYPE "public"."actor_context" ADD VALUE 'REVIEW_OPERATOR';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'VET_APPLICATION_DOCUMENT';--> statement-breakpoint
CREATE TABLE "vet_application_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "vet_application_document_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "vet_application_kind" NOT NULL,
	"vet_profile_id" uuid,
	"display_name_fa" text NOT NULL,
	"council_code" text NOT NULL,
	"phone" text,
	"city_id" uuid,
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
ALTER TABLE "vet_profile" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vet_profile" ALTER COLUMN "council_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "listed_city_id" uuid;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "listed_contact_fa" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "source_fa" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "hidden_by_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vet_application_document" ADD CONSTRAINT "vet_application_document_application_id_vet_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."vet_application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_application_document" ADD CONSTRAINT "vet_application_document_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_application" ADD CONSTRAINT "vet_application_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_application" ADD CONSTRAINT "vet_application_vet_profile_id_vet_profile_id_fk" FOREIGN KEY ("vet_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_application" ADD CONSTRAINT "vet_application_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_application" ADD CONSTRAINT "vet_application_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vet_application_document_file_key" ON "vet_application_document" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "vet_application_document_application_idx" ON "vet_application_document" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "vet_application_status_idx" ON "vet_application" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_application_open_account_key" ON "vet_application" USING btree ("account_id") WHERE "vet_application"."status" in ('SUBMITTED', 'NEEDS_CORRECTION');--> statement-breakpoint
CREATE UNIQUE INDEX "vet_application_open_claim_key" ON "vet_application" USING btree ("vet_profile_id") WHERE "vet_application"."kind" = 'CLAIM' and "vet_application"."status" in ('SUBMITTED', 'NEEDS_CORRECTION');--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_listed_city_id_city_id_fk" FOREIGN KEY ("listed_city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;