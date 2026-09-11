CREATE TYPE "public"."moderation_decision" AS ENUM('DISMISS', 'REQUEST_CORRECTION', 'HIDE', 'SOFT_DELETE', 'RESTRICT_PUBLISHER');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('INCORRECT_INFO', 'HEALTH_MISINFORMATION', 'OFFENSIVE', 'SPAM', 'COPYRIGHT', 'PRIVACY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'DISMISSED', 'ACTIONED');--> statement-breakpoint
CREATE TYPE "public"."report_target_kind" AS ENUM('CONTENT');--> statement-breakpoint
ALTER TYPE "public"."setting_group" ADD VALUE 'MODERATION';--> statement-breakpoint
CREATE TABLE "moderation_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_kind" "report_target_kind" DEFAULT 'CONTENT' NOT NULL,
	"content_id" uuid,
	"reporter_account_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"content_revision" integer,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"decision" "moderation_decision",
	"decision_reason" text,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_report_target_check" CHECK (("moderation_report"."target_kind" = 'CONTENT') = ("moderation_report"."content_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "publisher_restriction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"source_content_id" uuid,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by_account_id" uuid,
	"lift_reason" text
);
--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "correction_note" text;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "correction_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_content_id_content_item_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_reporter_account_id_account_id_fk" FOREIGN KEY ("reporter_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_decided_by_account_id_account_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_restriction" ADD CONSTRAINT "publisher_restriction_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_restriction" ADD CONSTRAINT "publisher_restriction_source_content_id_content_item_id_fk" FOREIGN KEY ("source_content_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_restriction" ADD CONSTRAINT "publisher_restriction_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_restriction" ADD CONSTRAINT "publisher_restriction_lifted_by_account_id_account_id_fk" FOREIGN KEY ("lifted_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_key" ON "moderation_report" USING btree ("reporter_account_id","content_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "moderation_report_queue_idx" ON "moderation_report" USING btree ("status","content_id");--> statement-breakpoint
CREATE INDEX "moderation_report_reporter_idx" ON "moderation_report" USING btree ("reporter_account_id","created_at");--> statement-breakpoint
CREATE INDEX "publisher_restriction_account_idx" ON "publisher_restriction" USING btree ("account_id");