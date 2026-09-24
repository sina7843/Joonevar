CREATE TYPE "public"."community_lifecycle" AS ENUM('DRAFT', 'PENDING_VERIFICATION', 'NEEDS_CORRECTION', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."community_ownership_kind" AS ENUM('CLAIM', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."community_ownership_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."community_role" AS ENUM('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER');--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'CLUB';--> statement-breakpoint
CREATE TABLE "community_ownership_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"kind" "community_ownership_kind" NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"target_account_id" uuid NOT NULL,
	"status" "community_ownership_status" DEFAULT 'PENDING' NOT NULL,
	"reason_fa" text,
	"decision_reason_fa" text,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community" ADD COLUMN "lifecycle" "community_lifecycle" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "community" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community" ADD COLUMN "verified_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "community" ADD COLUMN "lifecycle_reason_fa" text;--> statement-breakpoint
ALTER TABLE "community_manager" ADD COLUMN "role" "community_role" DEFAULT 'MEMBER' NOT NULL;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "community_id" uuid;--> statement-breakpoint
ALTER TABLE "community_ownership_request" ADD CONSTRAINT "community_ownership_request_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_ownership_request" ADD CONSTRAINT "community_ownership_request_requested_by_account_id_account_id_fk" FOREIGN KEY ("requested_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_ownership_request" ADD CONSTRAINT "community_ownership_request_target_account_id_account_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_ownership_request" ADD CONSTRAINT "community_ownership_request_decided_by_account_id_account_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_ownership_open_key" ON "community_ownership_request" USING btree ("community_id") WHERE "community_ownership_request"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "community_ownership_target_idx" ON "community_ownership_request" USING btree ("target_account_id","status");--> statement-breakpoint
ALTER TABLE "community" ADD CONSTRAINT "community_verified_by_account_id_account_id_fk" FOREIGN KEY ("verified_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_lifecycle_idx" ON "community" USING btree ("kind","lifecycle");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_club_key" ON "moderation_report" USING btree ("reporter_account_id","community_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "moderation_report_club_idx" ON "moderation_report" USING btree ("community_id","status");--> statement-breakpoint
ALTER TABLE "community" ADD CONSTRAINT "community_verified_together" CHECK (("community"."verified_at" is null) = ("community"."verified_by_account_id" is null));--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_club_check" CHECK (("moderation_report"."target_kind"::text = 'CLUB') = ("moderation_report"."community_id" is not null));--> statement-breakpoint
-- Existing records keep the standing they already had, and nothing is invented.
-- A community that is published today was published under the Phase 2 rules, so it
-- is ACTIVE; verified_at and verified_by stay empty because no such decision was
-- ever recorded and inventing a verifier would be a lie. Everything else is a DRAFT.
UPDATE "community" SET "lifecycle" = 'ACTIVE' WHERE "public_status" = 'PUBLISHED';--> statement-breakpoint
-- Everybody already listed on a community was put there as a co-manager, which is
-- what ADMIN means now; MEMBER is only the default for assignments made from here on.
UPDATE "community_manager" SET "role" = 'ADMIN';
