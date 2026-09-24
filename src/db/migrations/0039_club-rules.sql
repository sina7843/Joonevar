CREATE TYPE "public"."club_membership_status" AS ENUM('INELIGIBLE', 'PENDING_REVIEW', 'AWAITING_PAYMENT', 'ACTIVE', 'REJECTED', 'EXPIRED', 'SUSPENDED', 'LEFT');--> statement-breakpoint
CREATE TYPE "public"."club_rule_status" AS ENUM('DRAFT', 'PUBLISHED', 'SUPERSEDED');--> statement-breakpoint
ALTER TYPE "public"."payment_service" ADD VALUE 'CLUB_MEMBERSHIP';--> statement-breakpoint
CREATE TABLE "club_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "club_membership_status" DEFAULT 'INELIGIBLE' NOT NULL,
	"admitted_rule_version_id" uuid,
	"evaluated_rule_version_id" uuid,
	"unmet_fa" jsonb,
	"accepted_terms_version" text,
	"accepted_terms_at" timestamp with time zone,
	"fee_toman" bigint,
	"payment_batch_id" uuid,
	"applied_at" timestamp with time zone,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason_fa" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_reevaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"launched_by_account_id" uuid NOT NULL,
	"reason_fa" text NOT NULL,
	"examined" integer DEFAULT 0 NOT NULL,
	"still_eligible" integer DEFAULT 0 NOT NULL,
	"now_ineligible" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_rule_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "club_rule_status" DEFAULT 'DRAFT' NOT NULL,
	"tree" jsonb NOT NULL,
	"terms_fa" text,
	"terms_version" text,
	"fee_toman" bigint,
	"membership_days" integer,
	"note_fa" text,
	"created_by_account_id" uuid NOT NULL,
	"published_by_account_id" uuid,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_rule_fee_positive" CHECK ("club_rule_version"."fee_toman" is null or "club_rule_version"."fee_toman" > 0),
	CONSTRAINT "club_rule_days_positive" CHECK ("club_rule_version"."membership_days" is null or "club_rule_version"."membership_days" > 0),
	CONSTRAINT "club_rule_published_together" CHECK (("club_rule_version"."published_at" is null) = ("club_rule_version"."published_by_account_id" is null))
);
--> statement-breakpoint
ALTER TABLE "payment_item" ALTER COLUMN "setting_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_item" ALTER COLUMN "setting_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_item" ADD COLUMN "price_source" text DEFAULT 'SETTING' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_item" ADD COLUMN "price_source_id" uuid;--> statement-breakpoint
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_admitted_rule_version_id_club_rule_version_id_fk" FOREIGN KEY ("admitted_rule_version_id") REFERENCES "public"."club_rule_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_evaluated_rule_version_id_club_rule_version_id_fk" FOREIGN KEY ("evaluated_rule_version_id") REFERENCES "public"."club_rule_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_decided_by_account_id_account_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_reevaluation" ADD CONSTRAINT "club_reevaluation_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_reevaluation" ADD CONSTRAINT "club_reevaluation_rule_version_id_club_rule_version_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."club_rule_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_reevaluation" ADD CONSTRAINT "club_reevaluation_launched_by_account_id_account_id_fk" FOREIGN KEY ("launched_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_rule_version" ADD CONSTRAINT "club_rule_version_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_rule_version" ADD CONSTRAINT "club_rule_version_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_rule_version" ADD CONSTRAINT "club_rule_version_published_by_account_id_account_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_membership_key" ON "club_membership" USING btree ("community_id","account_id");--> statement-breakpoint
CREATE INDEX "club_membership_status_idx" ON "club_membership" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "club_membership_account_idx" ON "club_membership" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "club_reevaluation_idx" ON "club_reevaluation" USING btree ("community_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "club_rule_version_key" ON "club_rule_version" USING btree ("community_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "club_rule_draft_key" ON "club_rule_version" USING btree ("community_id") WHERE "club_rule_version"."status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "club_rule_published_key" ON "club_rule_version" USING btree ("community_id") WHERE "club_rule_version"."status" = 'PUBLISHED';--> statement-breakpoint
ALTER TABLE "payment_item" ADD CONSTRAINT "payment_item_price_source_check" CHECK (("payment_item"."price_source" = 'SETTING') = ("payment_item"."setting_key" is not null and "payment_item"."setting_version" is not null));--> statement-breakpoint
ALTER TABLE "payment_item" ADD CONSTRAINT "payment_item_price_source_id_check" CHECK (("payment_item"."price_source" = 'SETTING') = ("payment_item"."price_source_id" is null));