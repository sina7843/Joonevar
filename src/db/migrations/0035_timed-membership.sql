CREATE TYPE "public"."membership_application_status" AS ENUM('SUBMITTED', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."membership_period_kind" AS ENUM('INITIAL', 'RENEWAL');--> statement-breakpoint
CREATE TYPE "public"."membership_period_status" AS ENUM('PENDING_PAYMENT', 'ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "membership_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "membership_application_status" DEFAULT 'SUBMITTED' NOT NULL,
	"statement_fa" text,
	"review_note_fa" text,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "membership_period_kind" NOT NULL,
	"status" "membership_period_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_batch_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"tariff_setting_key" text NOT NULL,
	"tariff_setting_version" integer NOT NULL,
	"amount_toman" numeric(14, 0) NOT NULL,
	"period_days" integer NOT NULL,
	"grace_days" integer,
	"reminder_days_before" integer,
	"reminder_sent_at" timestamp with time zone,
	"expired_notice_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_period_days_positive" CHECK ("membership_period"."period_days" >= 1),
	CONSTRAINT "membership_period_grace_not_negative" CHECK ("membership_period"."grace_days" is null or "membership_period"."grace_days" >= 0),
	CONSTRAINT "membership_period_window_matches_status" CHECK (("membership_period"."status" = 'ACTIVE') = ("membership_period"."starts_at" is not null and "membership_period"."ends_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "status" SET DEFAULT 'NONE';--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "lifetime" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "current_period_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "status_reason_fa" text;--> statement-breakpoint
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_period" ADD CONSTRAINT "membership_period_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_period" ADD CONSTRAINT "membership_period_payment_batch_id_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_application_open_key" ON "membership_application" USING btree ("account_id") WHERE "membership_application"."status" in ('SUBMITTED', 'NEEDS_CORRECTION');--> statement-breakpoint
CREATE INDEX "membership_application_queue_idx" ON "membership_application" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_period_batch_key" ON "membership_period" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE INDEX "membership_period_account_idx" ON "membership_period" USING btree ("account_id","status","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_period_pending_key" ON "membership_period" USING btree ("account_id") WHERE "membership_period"."status" = 'PENDING_PAYMENT';--> statement-breakpoint
CREATE INDEX "membership_status_idx" ON "membership" USING btree ("status","current_period_ends_at");--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_lifetime_has_no_end" CHECK ("membership"."lifetime" = false or "membership"."current_period_ends_at" is null);--> statement-breakpoint
-- Hand-written (PHASE-2.5 PROMPT-009). The two Phase 1 states that no longer describe anything
-- are mapped explicitly; nothing is guessed and no expiry is invented:
--   INACTIVE        -> SUSPENDED                 (the association had put the membership aside)
--   PAYMENT_PENDING -> APPROVED_AWAITING_PAYMENT (paying was joining; there was no review to fail)
UPDATE "membership" SET "status" = 'SUSPENDED' WHERE "status" = 'INACTIVE';--> statement-breakpoint
UPDATE "membership" SET "status" = 'APPROVED_AWAITING_PAYMENT' WHERE "status" = 'PAYMENT_PENDING';--> statement-breakpoint
-- A membership that was already active was sold as a lifetime one (D04) and keeps that promise:
-- it is marked lifetime and is never given an end date nobody sold it (DEC-0195).
UPDATE "membership" SET "lifetime" = true WHERE "status" = 'ACTIVE';--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_status_known" CHECK ("membership"."status" in ('NONE', 'PENDING_REVIEW', 'NEEDS_CORRECTION', 'REJECTED', 'APPROVED_AWAITING_PAYMENT', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED', 'PAYMENT_PENDING', 'INACTIVE'));