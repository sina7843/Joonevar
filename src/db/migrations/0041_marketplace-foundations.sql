CREATE TYPE "public"."marketplace_market" AS ENUM('ANIMAL_SALE', 'MERCHANDISE');--> statement-breakpoint
ALTER TYPE "public"."account_role_name" ADD VALUE 'MARKETPLACE_ADMIN';--> statement-breakpoint
ALTER TYPE "public"."account_role_name" ADD VALUE 'LISTING_MODERATOR';--> statement-breakpoint
ALTER TYPE "public"."account_role_name" ADD VALUE 'SELLER_REVIEWER';--> statement-breakpoint
ALTER TYPE "public"."account_role_name" ADD VALUE 'FINANCE_OPERATOR';--> statement-breakpoint
ALTER TYPE "public"."account_role_name" ADD VALUE 'DISPUTE_REVIEWER';--> statement-breakpoint
ALTER TYPE "public"."account_role_name" ADD VALUE 'SUPPORT_AGENT';--> statement-breakpoint
ALTER TYPE "public"."actor_context" ADD VALUE 'MARKETPLACE_ADMIN';--> statement-breakpoint
ALTER TYPE "public"."actor_context" ADD VALUE 'LISTING_MODERATOR';--> statement-breakpoint
ALTER TYPE "public"."actor_context" ADD VALUE 'SELLER_REVIEWER';--> statement-breakpoint
ALTER TYPE "public"."actor_context" ADD VALUE 'FINANCE_OPERATOR';--> statement-breakpoint
ALTER TYPE "public"."actor_context" ADD VALUE 'DISPUTE_REVIEWER';--> statement-breakpoint
ALTER TYPE "public"."actor_context" ADD VALUE 'SUPPORT_AGENT';--> statement-breakpoint
ALTER TYPE "public"."setting_group" ADD VALUE 'ANIMAL_MARKET';--> statement-breakpoint
ALTER TYPE "public"."setting_group" ADD VALUE 'COMMERCE';--> statement-breakpoint
ALTER TYPE "public"."setting_group" ADD VALUE 'SETTLEMENT';--> statement-breakpoint
ALTER TYPE "public"."setting_group" ADD VALUE 'MARKETPLACE_OPERATIONS';--> statement-breakpoint
CREATE TABLE "marketplace_species" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market" "marketplace_market" NOT NULL,
	"species_code" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_species" ADD CONSTRAINT "marketplace_species_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_species" ADD CONSTRAINT "marketplace_species_updated_by_account_id_account_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_species_key" ON "marketplace_species" USING btree ("market","species_code");--> statement-breakpoint
CREATE INDEX "marketplace_species_enabled_idx" ON "marketplace_species" USING btree ("market","enabled");