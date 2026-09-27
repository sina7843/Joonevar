CREATE TYPE "public"."finder_report_category" AS ENUM('FALSE_ANIMAL_DATA', 'INVALID_CHIP_CLAIM', 'HARASSMENT', 'CONTRACT_BREACH', 'UNAUTHORIZED_BROKERAGE', 'CROSS_BREED_REQUEST', 'ANIMAL_ABUSE', 'OTHER_POLICY');--> statement-breakpoint
CREATE TYPE "public"."sanction_scope" AS ENUM('FINDER_ACCESS', 'ACCOUNT');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'FINDER_REPORT_EVIDENCE';--> statement-breakpoint
ALTER TYPE "public"."mating_profile_deactivation" ADD VALUE 'SUBSCRIPTION_ENDED';--> statement-breakpoint
ALTER TYPE "public"."mating_profile_deactivation" ADD VALUE 'SUSPENSION';--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'FINDER_ACCOUNT';--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'FINDER_REQUEST';--> statement-breakpoint
CREATE TABLE "account_sanction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"scope" "sanction_scope" NOT NULL,
	"reason_fa" text NOT NULL,
	"report_id" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by_account_id" uuid NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by_account_id" uuid,
	"lift_reason_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_sanction_window_check" CHECK ("account_sanction"."ends_at" is null or "account_sanction"."ends_at" > "account_sanction"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "moderation_report_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"uploaded_by_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_account_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"body_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finder_feedback_score_check" CHECK ("finder_feedback"."score" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "finder_reminder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_user_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_account_id" uuid NOT NULL,
	"blocked_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	CONSTRAINT "finder_user_block_self_check" CHECK ("finder_user_block"."blocker_account_id" <> "finder_user_block"."blocked_account_id")
);
--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "finder_request_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "reported_account_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "finder_category" "finder_report_category";--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "assigned_to_account_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_sanction" ADD CONSTRAINT "account_sanction_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sanction" ADD CONSTRAINT "account_sanction_report_id_moderation_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."moderation_report"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sanction" ADD CONSTRAINT "account_sanction_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sanction" ADD CONSTRAINT "account_sanction_lifted_by_account_id_account_id_fk" FOREIGN KEY ("lifted_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report_evidence" ADD CONSTRAINT "moderation_report_evidence_report_id_moderation_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."moderation_report"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report_evidence" ADD CONSTRAINT "moderation_report_evidence_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report_evidence" ADD CONSTRAINT "moderation_report_evidence_uploaded_by_account_id_account_id_fk" FOREIGN KEY ("uploaded_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_feedback" ADD CONSTRAINT "finder_feedback_request_id_mating_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mating_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_feedback" ADD CONSTRAINT "finder_feedback_author_account_id_account_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_reminder" ADD CONSTRAINT "finder_reminder_request_id_mating_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mating_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_user_block" ADD CONSTRAINT "finder_user_block_blocker_account_id_account_id_fk" FOREIGN KEY ("blocker_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_user_block" ADD CONSTRAINT "finder_user_block_blocked_account_id_account_id_fk" FOREIGN KEY ("blocked_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_sanction_one_open_key" ON "account_sanction" USING btree ("account_id","scope") WHERE "account_sanction"."lifted_at" is null;--> statement-breakpoint
CREATE INDEX "moderation_report_evidence_report_idx" ON "moderation_report_evidence" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_feedback_author_key" ON "finder_feedback" USING btree ("request_id","author_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_reminder_key" ON "finder_reminder" USING btree ("request_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_user_block_active_key" ON "finder_user_block" USING btree ("blocker_account_id","blocked_account_id") WHERE "finder_user_block"."lifted_at" is null;--> statement-breakpoint
CREATE INDEX "finder_user_block_blocked_idx" ON "finder_user_block" USING btree ("blocked_account_id");--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_finder_request_id_mating_request_id_fk" FOREIGN KEY ("finder_request_id") REFERENCES "public"."mating_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_reported_account_id_account_id_fk" FOREIGN KEY ("reported_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_assigned_to_account_id_account_id_fk" FOREIGN KEY ("assigned_to_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_finder_request_key" ON "moderation_report" USING btree ("reporter_account_id","finder_request_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_finder_account_key" ON "moderation_report" USING btree ("reporter_account_id","reported_account_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "moderation_report_finder_queue_idx" ON "moderation_report" USING btree ("finder_category","status");--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_finder_request_check" CHECK (("moderation_report"."target_kind"::text = 'FINDER_REQUEST') = ("moderation_report"."finder_request_id" is not null));--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_finder_account_check" CHECK (("moderation_report"."target_kind"::text = 'FINDER_ACCOUNT') = ("moderation_report"."reported_account_id" is not null));