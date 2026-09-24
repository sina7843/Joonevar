CREATE TYPE "public"."listing_promotion_status" AS ENUM('PENDING_PAYMENT', 'ACTIVE', 'CANCELLED', 'PAYMENT_FAILED');--> statement-breakpoint
CREATE TYPE "public"."moderation_appeal_status" AS ENUM('OPEN', 'UPHELD', 'OVERTURNED');--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'ANIMAL_LISTING';--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'LISTING_MEDIA';--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'SELLER';--> statement-breakpoint
ALTER TYPE "public"."payment_service" ADD VALUE 'ANIMAL_LISTING_PROMOTION';--> statement-breakpoint
CREATE TABLE "moderation_appeal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"appellant_account_id" uuid NOT NULL,
	"statement_fa" text NOT NULL,
	"status" "moderation_appeal_status" DEFAULT 'OPEN' NOT NULL,
	"decision_reason_fa" text,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_promotion_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label_fa" text NOT NULL,
	"duration_days" integer NOT NULL,
	"price_setting_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_promotion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "listing_promotion_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"duration_days" integer,
	"payment_batch_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "listing_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "listing_media_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "seller_account_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "listing_revision" integer;--> statement-breakpoint
ALTER TABLE "moderation_appeal" ADD CONSTRAINT "moderation_appeal_report_id_moderation_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."moderation_report"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_appeal" ADD CONSTRAINT "moderation_appeal_appellant_account_id_account_id_fk" FOREIGN KEY ("appellant_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_appeal" ADD CONSTRAINT "moderation_appeal_decided_by_account_id_account_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_promotion" ADD CONSTRAINT "listing_promotion_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_promotion" ADD CONSTRAINT "listing_promotion_package_id_listing_promotion_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."listing_promotion_package"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_promotion" ADD CONSTRAINT "listing_promotion_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_promotion" ADD CONSTRAINT "listing_promotion_payment_batch_id_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_appeal_one_open_key" ON "moderation_appeal" USING btree ("report_id","appellant_account_id") WHERE "moderation_appeal"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "moderation_appeal_queue_idx" ON "moderation_appeal" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_promotion_package_code_key" ON "listing_promotion_package" USING btree ("code");--> statement-breakpoint
CREATE INDEX "listing_promotion_listing_idx" ON "listing_promotion" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "listing_promotion_window_idx" ON "listing_promotion" USING btree ("status","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_promotion_batch_key" ON "listing_promotion" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_promotion_live_key" ON "listing_promotion" USING btree ("listing_id") WHERE "listing_promotion"."status" in ('PENDING_PAYMENT','ACTIVE');--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_listing_media_id_animal_listing_media_id_fk" FOREIGN KEY ("listing_media_id") REFERENCES "public"."animal_listing_media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_seller_account_id_account_id_fk" FOREIGN KEY ("seller_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_listing_key" ON "moderation_report" USING btree ("reporter_account_id","listing_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_media_key" ON "moderation_report" USING btree ("reporter_account_id","listing_media_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_seller_key" ON "moderation_report" USING btree ("reporter_account_id","seller_account_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "moderation_report_listing_idx" ON "moderation_report" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "moderation_report_seller_idx" ON "moderation_report" USING btree ("seller_account_id","status");--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_listing_check" CHECK (("moderation_report"."target_kind"::text = 'ANIMAL_LISTING') = ("moderation_report"."listing_id" is not null));--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_media_check" CHECK (("moderation_report"."target_kind"::text = 'LISTING_MEDIA') = ("moderation_report"."listing_media_id" is not null));--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_seller_check" CHECK (("moderation_report"."target_kind"::text = 'SELLER') = ("moderation_report"."seller_account_id" is not null));