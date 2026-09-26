CREATE TYPE "public"."animal_life_event_kind" AS ENUM('DECEASED', 'MISSING', 'FOUND', 'ARCHIVED', 'RESTORED');--> statement-breakpoint
CREATE TYPE "public"."fertility_status" AS ENUM('NOT_STERILIZED', 'STERILIZED');--> statement-breakpoint
CREATE TYPE "public"."last_mating_source" AS ENUM('OFFICIAL', 'FINDER_PERSONAL');--> statement-breakpoint
CREATE TYPE "public"."mating_media_kind" AS ENUM('IMAGE', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."mating_media_role" AS ENUM('FULL_BODY', 'FACE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."mating_media_status" AS ENUM('ACTIVE', 'REMOVED', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."mating_profile_deactivation" AS ENUM('OWNER', 'TRANSFER', 'LIFE_EVENT', 'IDENTITY_CHANGE', 'MODERATION');--> statement-breakpoint
CREATE TYPE "public"."mating_profile_state" AS ENUM('INACTIVE', 'READY', 'TEMPORARILY_UNAVAILABLE', 'INVITE_ONLY', 'COORDINATING', 'MATCH_SELECTED');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'MATING_PROFILE_IMAGE';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'MATING_PROFILE_RENDITION';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'MATING_PROFILE_VIDEO';--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'MATING_PROFILE';--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'MATING_PROFILE_MEDIA';--> statement-breakpoint
CREATE TABLE "animal_fertility_declaration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"status" "fertility_status" NOT NULL,
	"declared_by_account_id" uuid NOT NULL,
	"note_fa" text,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animal_last_mating" (
	"animal_id" uuid PRIMARY KEY NOT NULL,
	"last_mated_on" date NOT NULL,
	"source" "last_mating_source" NOT NULL,
	"source_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animal_life_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"kind" "animal_life_event_kind" NOT NULL,
	"occurred_on" date NOT NULL,
	"reason_fa" text NOT NULL,
	"recorded_by_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mating_profile_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" "mating_media_kind" NOT NULL,
	"role" "mating_media_role" NOT NULL,
	"file_id" uuid NOT NULL,
	"rendition_file_id" uuid,
	"alt_fa" text NOT NULL,
	"status" "mating_media_status" DEFAULT 'ACTIVE' NOT NULL,
	"status_reason_fa" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mating_profile_media_rendition_check" CHECK ("mating_profile_media"."kind" = 'VIDEO' or "mating_profile_media"."rendition_file_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "mating_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"state" "mating_profile_state" DEFAULT 'INACTIVE' NOT NULL,
	"deactivation_reason" "mating_profile_deactivation",
	"deactivation_note_fa" text,
	"preferences_fa" text,
	"primary_media_id" uuid,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "mating_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "mating_profile_media_id" uuid;--> statement-breakpoint
ALTER TABLE "animal_fertility_declaration" ADD CONSTRAINT "animal_fertility_declaration_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_fertility_declaration" ADD CONSTRAINT "animal_fertility_declaration_declared_by_account_id_account_id_fk" FOREIGN KEY ("declared_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_last_mating" ADD CONSTRAINT "animal_last_mating_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_life_event" ADD CONSTRAINT "animal_life_event_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_life_event" ADD CONSTRAINT "animal_life_event_recorded_by_account_id_account_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_profile_media" ADD CONSTRAINT "mating_profile_media_profile_id_mating_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."mating_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_profile_media" ADD CONSTRAINT "mating_profile_media_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_profile_media" ADD CONSTRAINT "mating_profile_media_rendition_file_id_stored_file_id_fk" FOREIGN KEY ("rendition_file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_profile" ADD CONSTRAINT "mating_profile_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_profile" ADD CONSTRAINT "mating_profile_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animal_fertility_animal_idx" ON "animal_fertility_declaration" USING btree ("animal_id","declared_at");--> statement-breakpoint
CREATE INDEX "animal_life_event_animal_idx" ON "animal_life_event" USING btree ("animal_id","created_at");--> statement-breakpoint
CREATE INDEX "mating_profile_media_profile_idx" ON "mating_profile_media" USING btree ("profile_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "mating_profile_media_rendition_key" ON "mating_profile_media" USING btree ("rendition_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mating_profile_one_video_key" ON "mating_profile_media" USING btree ("profile_id") WHERE "mating_profile_media"."kind" = 'VIDEO' and "mating_profile_media"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "mating_profile_animal_key" ON "mating_profile" USING btree ("animal_id");--> statement-breakpoint
CREATE INDEX "mating_profile_owner_idx" ON "mating_profile" USING btree ("owner_account_id","state");--> statement-breakpoint
CREATE INDEX "mating_profile_state_idx" ON "mating_profile" USING btree ("state");--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_mating_profile_id_mating_profile_id_fk" FOREIGN KEY ("mating_profile_id") REFERENCES "public"."mating_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_mating_profile_media_id_mating_profile_media_id_fk" FOREIGN KEY ("mating_profile_media_id") REFERENCES "public"."mating_profile_media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_mating_profile_key" ON "moderation_report" USING btree ("reporter_account_id","mating_profile_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_mating_media_key" ON "moderation_report" USING btree ("reporter_account_id","mating_profile_media_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_mating_profile_check" CHECK (("moderation_report"."target_kind"::text = 'MATING_PROFILE') = ("moderation_report"."mating_profile_id" is not null));--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_mating_media_check" CHECK (("moderation_report"."target_kind"::text = 'MATING_PROFILE_MEDIA') = ("moderation_report"."mating_profile_media_id" is not null));--> statement-breakpoint
-- Backfill of the derived last mating (PHASE-4 PROMPT-003). It only reads the truth that already exists:
-- mutually CONFIRMED official dates. PROPOSED, CONFLICTED and SUPERSEDED rows and every legacy personal
-- declaration or note are never read, so the upgrade confirms nothing that was not confirmed.
INSERT INTO "animal_last_mating" ("animal_id", "last_mated_on", "source", "source_id", "confirmed_at", "confirmed_count", "updated_at")
SELECT DISTINCT ON (x.animal_id) x.animal_id, x.mated_on::date, 'OFFICIAL', x.id, x.confirmed_at, count(*) OVER (PARTITION BY x.animal_id), now()
FROM (
  SELECT d.id, d.mated_on, d.confirmed_at, p.sire_animal_id AS animal_id
    FROM "mating_date_declaration" d JOIN "mating_permit" p ON p.id = d.permit_id WHERE d.status = 'CONFIRMED'
  UNION ALL
  SELECT d.id, d.mated_on, d.confirmed_at, p.dam_animal_id AS animal_id
    FROM "mating_date_declaration" d JOIN "mating_permit" p ON p.id = d.permit_id WHERE d.status = 'CONFIRMED'
) x
ORDER BY x.animal_id, x.mated_on DESC, x.confirmed_at DESC NULLS LAST, x.id DESC;
