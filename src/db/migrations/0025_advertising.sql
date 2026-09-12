CREATE TYPE "public"."ad_plan_period" AS ENUM('D30', 'D90', 'D365');--> statement-breakpoint
CREATE TYPE "public"."ad_plan_tier" AS ENUM('FEATURED', 'PRO');--> statement-breakpoint
CREATE TYPE "public"."ad_subscription_status" AS ENUM('PENDING_PAYMENT', 'ACTIVE', 'CANCELLED', 'PAYMENT_FAILED');--> statement-breakpoint
CREATE TYPE "public"."ad_target_type" AS ENUM('VET', 'CENTRE', 'COMMUNITY');--> statement-breakpoint
ALTER TYPE "public"."setting_group" ADD VALUE 'ADVERTISING';--> statement-breakpoint
ALTER TYPE "public"."payment_service" ADD VALUE 'ADVERTISING_PACKAGE';--> statement-breakpoint
CREATE TABLE "ad_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" "ad_plan_tier" NOT NULL,
	"period" "ad_plan_period" NOT NULL,
	"duration_days" integer NOT NULL,
	"price_setting_key" text NOT NULL,
	"features_fa" text,
	"slot_capacity" integer,
	"is_active" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "ad_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "ad_subscription_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"payment_batch_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_subscription" ADD CONSTRAINT "ad_subscription_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_subscription" ADD CONSTRAINT "ad_subscription_plan_id_ad_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ad_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_subscription" ADD CONSTRAINT "ad_subscription_payment_batch_id_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_plan_tier_period_key" ON "ad_plan" USING btree ("tier","period");--> statement-breakpoint
CREATE INDEX "ad_subscription_target_idx" ON "ad_subscription" USING btree ("target_type","target_id","status");--> statement-breakpoint
CREATE INDEX "ad_subscription_account_idx" ON "ad_subscription" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_subscription_batch_key" ON "ad_subscription" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE INDEX "ad_subscription_window_idx" ON "ad_subscription" USING btree ("status","ends_at");