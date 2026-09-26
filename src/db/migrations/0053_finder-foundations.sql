CREATE TYPE "public"."finder_period_kind" AS ENUM('INITIAL', 'RENEWAL');--> statement-breakpoint
CREATE TYPE "public"."finder_plan_audience" AS ENUM('OWNER', 'KENNEL');--> statement-breakpoint
CREATE TYPE "public"."finder_plan_status" AS ENUM('PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."finder_rule_mode" AS ENUM('WARN', 'BLOCK');--> statement-breakpoint
CREATE TYPE "public"."finder_rule_status" AS ENUM('PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."finder_subscription_status" AS ENUM('PENDING_PAYMENT', 'ACTIVE', 'SUPERSEDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."finder_suspension_policy" AS ENUM('PERIOD_CONTINUES_NO_REFUND', 'PERIOD_PAUSED_NO_REFUND');--> statement-breakpoint
ALTER TYPE "public"."marketplace_market" ADD VALUE 'MATING';--> statement-breakpoint
ALTER TYPE "public"."setting_group" ADD VALUE 'MATING_FINDER';--> statement-breakpoint
ALTER TYPE "public"."payment_service" ADD VALUE 'MATING_FINDER_SUBSCRIPTION';--> statement-breakpoint
CREATE TABLE "finder_breed_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species_code" text NOT NULL,
	"breed_id" uuid,
	"sex" "animal_sex" NOT NULL,
	"version" integer NOT NULL,
	"status" "finder_rule_status" DEFAULT 'PUBLISHED' NOT NULL,
	"min_age_months" integer,
	"max_age_months" integer,
	"cooldown_days" integer,
	"cooldown_months" integer,
	"cooldown_mode" "finder_rule_mode" DEFAULT 'WARN' NOT NULL,
	"kinship_max_degree" integer,
	"kinship_mode" "finder_rule_mode" DEFAULT 'WARN' NOT NULL,
	"warning_fa" text,
	"reason_fa" text NOT NULL,
	"published_by_account_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "finder_rule_cooldown_check" CHECK (("finder_breed_rule"."cooldown_days" is null) <> ("finder_breed_rule"."cooldown_months" is null)),
	CONSTRAINT "finder_rule_cooldown_positive_check" CHECK (coalesce("finder_breed_rule"."cooldown_days", "finder_breed_rule"."cooldown_months") >= 0),
	CONSTRAINT "finder_rule_age_check" CHECK (("finder_breed_rule"."min_age_months" is null or "finder_breed_rule"."min_age_months" >= 0) and ("finder_breed_rule"."max_age_months" is null or "finder_breed_rule"."max_age_months" >= 1) and ("finder_breed_rule"."min_age_months" is null or "finder_breed_rule"."max_age_months" is null or "finder_breed_rule"."min_age_months" <= "finder_breed_rule"."max_age_months")),
	CONSTRAINT "finder_rule_kinship_check" CHECK ("finder_breed_rule"."kinship_max_degree" is null or "finder_breed_rule"."kinship_max_degree" between 1 and 6)
);
--> statement-breakpoint
CREATE TABLE "finder_plan_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience" "finder_plan_audience" NOT NULL,
	"duration_months" integer NOT NULL,
	"version" integer NOT NULL,
	"status" "finder_plan_status" DEFAULT 'PUBLISHED' NOT NULL,
	"title_fa" text NOT NULL,
	"price_toman" bigint,
	"active_animal_capacity" integer NOT NULL,
	"purchasable_from" timestamp with time zone,
	"purchasable_until" timestamp with time zone,
	"suspension_policy" "finder_suspension_policy" NOT NULL,
	"note_fa" text,
	"reason_fa" text NOT NULL,
	"published_by_account_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_by_account_id" uuid,
	"archived_at" timestamp with time zone,
	"archive_reason_fa" text,
	CONSTRAINT "finder_plan_duration_check" CHECK ("finder_plan_version"."duration_months" in (1, 3, 6, 12)),
	CONSTRAINT "finder_plan_capacity_check" CHECK ("finder_plan_version"."active_animal_capacity" >= 1),
	CONSTRAINT "finder_plan_price_check" CHECK ("finder_plan_version"."price_toman" is null or "finder_plan_version"."price_toman" > 0),
	CONSTRAINT "finder_plan_window_check" CHECK ("finder_plan_version"."purchasable_from" is null or "finder_plan_version"."purchasable_until" is null or "finder_plan_version"."purchasable_from" < "finder_plan_version"."purchasable_until")
);
--> statement-breakpoint
CREATE TABLE "finder_subscription_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"audience" "finder_plan_audience" NOT NULL,
	"plan_version" integer NOT NULL,
	"duration_months" integer NOT NULL,
	"active_animal_capacity" integer NOT NULL,
	"price_toman" bigint NOT NULL,
	"suspension_policy" "finder_suspension_policy" NOT NULL,
	"kind" "finder_period_kind" NOT NULL,
	"status" "finder_subscription_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_batch_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finder_subscription_active_window_check" CHECK ("finder_subscription_period"."status" <> 'ACTIVE' or ("finder_subscription_period"."starts_at" is not null and "finder_subscription_period"."ends_at" is not null and "finder_subscription_period"."starts_at" < "finder_subscription_period"."ends_at")),
	CONSTRAINT "finder_subscription_price_check" CHECK ("finder_subscription_period"."price_toman" > 0)
);
--> statement-breakpoint
ALTER TABLE "finder_breed_rule" ADD CONSTRAINT "finder_breed_rule_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_breed_rule" ADD CONSTRAINT "finder_breed_rule_breed_id_reference_breed_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."reference_breed"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_breed_rule" ADD CONSTRAINT "finder_breed_rule_published_by_account_id_account_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_plan_version" ADD CONSTRAINT "finder_plan_version_published_by_account_id_account_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_plan_version" ADD CONSTRAINT "finder_plan_version_archived_by_account_id_account_id_fk" FOREIGN KEY ("archived_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_subscription_period" ADD CONSTRAINT "finder_subscription_period_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_subscription_period" ADD CONSTRAINT "finder_subscription_period_plan_version_id_finder_plan_version_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."finder_plan_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_subscription_period" ADD CONSTRAINT "finder_subscription_period_payment_batch_id_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finder_rule_version_key" ON "finder_breed_rule" USING btree ("species_code",coalesce("breed_id", '00000000-0000-0000-0000-000000000000'::uuid),"sex","version");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_rule_one_published_key" ON "finder_breed_rule" USING btree ("species_code",coalesce("breed_id", '00000000-0000-0000-0000-000000000000'::uuid),"sex") WHERE "finder_breed_rule"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "finder_plan_version_key" ON "finder_plan_version" USING btree ("audience","duration_months","version");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_plan_one_published_key" ON "finder_plan_version" USING btree ("audience","duration_months") WHERE "finder_plan_version"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "finder_subscription_one_pending_key" ON "finder_subscription_period" USING btree ("account_id") WHERE "finder_subscription_period"."status" = 'PENDING_PAYMENT';--> statement-breakpoint
CREATE UNIQUE INDEX "finder_subscription_batch_key" ON "finder_subscription_period" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE INDEX "finder_subscription_account_idx" ON "finder_subscription_period" USING btree ("account_id","status","ends_at");