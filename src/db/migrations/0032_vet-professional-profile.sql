CREATE TYPE "public"."vet_applicant_type" AS ENUM('STUDENT', 'DOCTOR');--> statement-breakpoint
CREATE TYPE "public"."vet_case_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'REJECTED', 'WITHDRAWN', 'VERIFIED_STUDENT', 'VERIFIED_NO_LICENSE', 'LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'EXPIRED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."vet_case_type" AS ENUM('STUDENT', 'COUNCIL', 'LICENCE', 'CLAIM');--> statement-breakpoint
CREATE TYPE "public"."vet_professional_document_kind" AS ENUM('STUDENT_CARD', 'COUNCIL_CARD', 'PRACTICE_LICENCE', 'CERTIFICATE', 'IDENTITY', 'OTHER');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'VET_PROFESSIONAL_DOCUMENT';--> statement-breakpoint
CREATE TABLE "vet_equipment" (
	"code" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_professional_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"vet_profile_id" uuid,
	"case_type" "vet_case_type" NOT NULL,
	"status" "vet_case_status" DEFAULT 'DRAFT' NOT NULL,
	"current_submission_version" integer DEFAULT 0 NOT NULL,
	"legacy_application_id" uuid,
	"review_note_fa" text,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vet_professional_case_version_not_negative" CHECK ("vet_professional_case"."current_submission_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vet_professional_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"submission_version" integer NOT NULL,
	"kind" "vet_professional_document_kind" NOT NULL,
	"file_id" uuid NOT NULL,
	"title_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_professional_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"submitted_by_account_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vet_professional_submission_version_positive" CHECK ("vet_professional_submission"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "vet_profile_certificate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vet_profile_id" uuid NOT NULL,
	"title_fa" text NOT NULL,
	"issuer_fa" text,
	"issued_on" date,
	"file_id" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_profile_equipment" (
	"vet_profile_id" uuid NOT NULL,
	"equipment_code" text NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vet_profile_equipment_vet_profile_id_equipment_code_pk" PRIMARY KEY("vet_profile_id","equipment_code")
);
--> statement-breakpoint
CREATE TABLE "vet_profile_service" (
	"vet_profile_id" uuid NOT NULL,
	"service_code" text NOT NULL,
	CONSTRAINT "vet_profile_service_vet_profile_id_service_code_pk" PRIMARY KEY("vet_profile_id","service_code")
);
--> statement-breakpoint
CREATE TABLE "vet_service" (
	"code" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "applicant_type" "vet_applicant_type";--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "student_number" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "university_fa" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "practice_scope" "vet_practice_scope";--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "council_verified_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "has_licence" boolean;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "licence_code" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "licence_date" date;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "licence_file_id" uuid;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "licence_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "licence_verified_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "clinic_name_fa" text;--> statement-breakpoint
ALTER TABLE "vet_professional_case" ADD CONSTRAINT "vet_professional_case_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_professional_case" ADD CONSTRAINT "vet_professional_case_vet_profile_id_vet_profile_id_fk" FOREIGN KEY ("vet_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_professional_case" ADD CONSTRAINT "vet_professional_case_legacy_application_id_vet_application_id_fk" FOREIGN KEY ("legacy_application_id") REFERENCES "public"."vet_application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_professional_case" ADD CONSTRAINT "vet_professional_case_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_professional_document" ADD CONSTRAINT "vet_professional_document_case_id_vet_professional_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."vet_professional_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_professional_document" ADD CONSTRAINT "vet_professional_document_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_professional_submission" ADD CONSTRAINT "vet_professional_submission_case_id_vet_professional_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."vet_professional_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_professional_submission" ADD CONSTRAINT "vet_professional_submission_submitted_by_account_id_account_id_fk" FOREIGN KEY ("submitted_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_certificate" ADD CONSTRAINT "vet_profile_certificate_vet_profile_id_vet_profile_id_fk" FOREIGN KEY ("vet_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_certificate" ADD CONSTRAINT "vet_profile_certificate_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_equipment" ADD CONSTRAINT "vet_profile_equipment_vet_profile_id_vet_profile_id_fk" FOREIGN KEY ("vet_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_equipment" ADD CONSTRAINT "vet_profile_equipment_equipment_code_vet_equipment_code_fk" FOREIGN KEY ("equipment_code") REFERENCES "public"."vet_equipment"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_service" ADD CONSTRAINT "vet_profile_service_vet_profile_id_vet_profile_id_fk" FOREIGN KEY ("vet_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_service" ADD CONSTRAINT "vet_profile_service_service_code_vet_service_code_fk" FOREIGN KEY ("service_code") REFERENCES "public"."vet_service"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vet_equipment_name_fa_key" ON "vet_equipment" USING btree ("name_fa");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_professional_case_legacy_key" ON "vet_professional_case" USING btree ("legacy_application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_professional_case_open_key" ON "vet_professional_case" USING btree ("account_id","case_type") WHERE "vet_professional_case"."status" in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION');--> statement-breakpoint
CREATE INDEX "vet_professional_case_status_idx" ON "vet_professional_case" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_professional_document_file_key" ON "vet_professional_document" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "vet_professional_document_case_idx" ON "vet_professional_document" USING btree ("case_id","submission_version");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_professional_submission_version_key" ON "vet_professional_submission" USING btree ("case_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_profile_certificate_file_key" ON "vet_profile_certificate" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "vet_profile_certificate_profile_idx" ON "vet_profile_certificate" USING btree ("vet_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_service_name_fa_key" ON "vet_service" USING btree ("name_fa");--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_council_verified_by_account_id_account_id_fk" FOREIGN KEY ("council_verified_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_licence_file_id_stored_file_id_fk" FOREIGN KEY ("licence_file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_licence_verified_by_account_id_account_id_fk" FOREIGN KEY ("licence_verified_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_student_fields_only_for_students" CHECK ("vet_profile"."applicant_type" is not distinct from 'STUDENT' or ("vet_profile"."student_number" is null and "vet_profile"."university_fa" is null));--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_student_has_no_doctor_fields" CHECK ("vet_profile"."applicant_type" is distinct from 'STUDENT' or ("vet_profile"."council_code" is null and "vet_profile"."council_verified_at" is null and "vet_profile"."practice_scope" is null and "vet_profile"."has_licence" is null));--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_doctor_fields_need_a_doctor" CHECK ("vet_profile"."applicant_type" is not distinct from 'DOCTOR' or ("vet_profile"."practice_scope" is null and "vet_profile"."has_licence" is null));--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_licence_only_when_declared" CHECK ("vet_profile"."has_licence" is true or ("vet_profile"."licence_code" is null and "vet_profile"."licence_date" is null and "vet_profile"."licence_file_id" is null and "vet_profile"."licence_verified_at" is null));--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_licence_verified_with_evidence" CHECK ("vet_profile"."licence_verified_at" is null or ("vet_profile"."licence_code" is not null and "vet_profile"."licence_date" is not null and "vet_profile"."licence_file_id" is not null));--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_council_verified_with_code" CHECK ("vet_profile"."council_verified_at" is null or "vet_profile"."council_code" is not null);--> statement-breakpoint
-- Submitted evidence is never rewritten or removed; a correction is a new version (Phase 2.5 PROMPT-003, DEC-0189).
CREATE FUNCTION "vet_professional_evidence_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are evidence and cannot be changed or deleted', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "vet_professional_submission_guard" BEFORE UPDATE OR DELETE ON "vet_professional_submission" FOR EACH ROW EXECUTE FUNCTION "vet_professional_evidence_guard"();--> statement-breakpoint
CREATE TRIGGER "vet_professional_document_guard" BEFORE UPDATE OR DELETE ON "vet_professional_document" FOR EACH ROW EXECUTE FUNCTION "vet_professional_evidence_guard"();--> statement-breakpoint
-- Reference data named by the product itself and nothing more: the Phase 1 veterinary service types, with the
-- labels the Finder already uses, and the one piece of equipment the trusted-vet rules name.
INSERT INTO "vet_service" ("code", "name_fa", "sort_order") VALUES
  ('MICROCHIP_IMPLANT', 'کاشت میکروچیپ', 1),
  ('MICROCHIP_VERIFICATION', 'تأیید میکروچیپ', 2),
  ('DNA_RESAMPLING', 'نمونه‌گیری مجدد DNA', 3),
  ('PREGNANCY_CHECK', 'بررسی بارداری', 4);--> statement-breakpoint
INSERT INTO "vet_equipment" ("code", "name_fa", "sort_order") VALUES ('MICROCHIP_READER', 'دستگاه میکروچیپ‌ریدر', 1);--> statement-breakpoint
-- Backfill the profile. An owned profile with a council code is a doctor; nobody ever said general or
-- specialist, so NOT_DECLARED; nobody ever said whether they hold a licence, so has_licence stays null.
UPDATE "vet_profile" SET "applicant_type" = 'DOCTOR', "practice_scope" = 'NOT_DECLARED'
WHERE "account_id" IS NOT NULL AND "council_code" IS NOT NULL;--> statement-breakpoint
-- Who verified the code is known only where a Phase 2 approval did it.
UPDATE "vet_profile" AS p SET "council_verified_by_account_id" = a."reviewed_by_account_id"
FROM "vet_application" AS a
WHERE a."vet_profile_id" = p."id" AND a."status" = 'APPROVED' AND a."account_id" = p."account_id"
  AND p."council_verified_at" IS NOT NULL AND p."council_verified_by_account_id" IS NULL;--> statement-breakpoint
-- Every Phase 2 application becomes a case with its one known submission and its documents. Earlier
-- corrections overwrote the application in place, so only the last submitted values exist to copy.
INSERT INTO "vet_professional_case" ("account_id", "vet_profile_id", "case_type", "status", "current_submission_version", "legacy_application_id", "review_note_fa", "reviewed_by_account_id", "reviewed_at", "created_at", "updated_at")
SELECT a."account_id", a."vet_profile_id",
  (CASE a."kind" WHEN 'CLAIM' THEN 'CLAIM' ELSE 'COUNCIL' END)::"vet_case_type",
  (CASE a."status" WHEN 'APPROVED' THEN 'VERIFIED_NO_LICENSE' ELSE a."status"::text END)::"vet_case_status",
  1, a."id", a."review_note_fa", a."reviewed_by_account_id", a."reviewed_at", a."created_at", a."updated_at"
FROM "vet_application" AS a;--> statement-breakpoint
INSERT INTO "vet_professional_submission" ("case_id", "version", "submitted_by_account_id", "submitted_at", "payload")
SELECT c."id", 1, a."account_id", a."submitted_at",
  jsonb_build_object('source', 'VET_APPLICATION', 'kind', a."kind", 'displayNameFa', a."display_name_fa", 'councilCode', a."council_code",
    'phone', a."phone", 'cityId', a."city_id", 'statementFa', a."statement_fa", 'appealFa', a."appeal_fa")
FROM "vet_application" AS a JOIN "vet_professional_case" AS c ON c."legacy_application_id" = a."id";--> statement-breakpoint
INSERT INTO "vet_professional_document" ("case_id", "submission_version", "kind", "file_id", "created_at")
SELECT c."id", 1, d."kind"::text::"vet_professional_document_kind", d."file_id", d."created_at"
FROM "vet_application_document" AS d JOIN "vet_professional_case" AS c ON c."legacy_application_id" = d."application_id";