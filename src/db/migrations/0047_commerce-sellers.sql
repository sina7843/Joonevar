CREATE TYPE "public"."commerce_member_status" AS ENUM('INVITED', 'ACTIVE', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."commerce_seller_kind" AS ENUM('PET_SHOP', 'VERIFIED_BUSINESS', 'PLATFORM');--> statement-breakpoint
CREATE TYPE "public"."commerce_seller_role" AS ENUM('OWNER', 'ADMIN', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."commerce_seller_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."seller_document_kind" AS ENUM('BUSINESS_LICENCE', 'REPRESENTATIVE_ID', 'BANK_PROOF', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."seller_plan_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."seller_subscription_status" AS ENUM('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'SELLER_DOCUMENT';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'SELLER_LOGO';--> statement-breakpoint
ALTER TYPE "public"."payment_service" ADD VALUE 'COMMERCE_SELLER_PLAN';--> statement-breakpoint
CREATE TABLE "commerce_seller" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"kind" "commerce_seller_kind" NOT NULL,
	"status" "commerce_seller_status" DEFAULT 'DRAFT' NOT NULL,
	"display_name_fa" text,
	"legal_name_fa" text,
	"slug" text,
	"business_type_fa" text,
	"national_identifier" text,
	"representative_name_fa" text,
	"representative_phone" text,
	"contact_email" text,
	"licence_kind_fa" text,
	"licence_number" text,
	"licence_issued_on" text,
	"licence_expires_on" text,
	"province_code" text,
	"city_id" uuid,
	"address_fa" text,
	"postal_code" text,
	"settlement_iban" text,
	"settlement_holder_name_fa" text,
	"iban_verified_at" timestamp with time zone,
	"iban_verified_by_account_id" uuid,
	"iban_verification_note_fa" text,
	"shipping_policy_fa" text,
	"return_policy_fa" text,
	"logo_file_id" uuid,
	"agreement_version" text,
	"agreement_accepted_at" timestamp with time zone,
	"agreement_accepted_by_account_id" uuid,
	"submitted_at" timestamp with time zone,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"status_reason_fa" text,
	"status_changed_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_seller_active_needs_agreement" CHECK ("commerce_seller"."status" <> 'ACTIVE' or ("commerce_seller"."agreement_version" is not null and "commerce_seller"."activated_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "seller_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"kind" "seller_document_kind" NOT NULL,
	"file_id" uuid NOT NULL,
	"note_fa" text,
	"added_by_account_id" uuid NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "commerce_seller_role" DEFAULT 'STAFF' NOT NULL,
	"status" "commerce_member_status" DEFAULT 'INVITED' NOT NULL,
	"invited_by_account_id" uuid,
	"responded_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label_fa" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "seller_plan_status" DEFAULT 'DRAFT' NOT NULL,
	"duration_days" integer NOT NULL,
	"product_limit" integer,
	"commission_percent_bp" integer NOT NULL,
	"commission_min_toman" bigint,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_setting_key" text NOT NULL,
	"note_fa" text,
	"created_by_account_id" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_plan_percent_range" CHECK ("seller_plan"."commission_percent_bp" >= 0 and "seller_plan"."commission_percent_bp" <= 10000),
	CONSTRAINT "seller_plan_duration_positive" CHECK ("seller_plan"."duration_days" > 0),
	CONSTRAINT "seller_plan_limit_positive" CHECK ("seller_plan"."product_limit" is null or "seller_plan"."product_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "seller_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "seller_subscription_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"duration_days" integer NOT NULL,
	"product_limit" integer,
	"commission_percent_bp" integer NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payment_batch_id" uuid,
	"free_of_charge" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_subscription_active_needs_window" CHECK ("seller_subscription"."status" <> 'ACTIVE' or ("seller_subscription"."starts_at" is not null and "seller_subscription"."ends_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD CONSTRAINT "commerce_seller_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD CONSTRAINT "commerce_seller_province_code_province_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."province"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD CONSTRAINT "commerce_seller_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD CONSTRAINT "commerce_seller_iban_verified_by_account_id_account_id_fk" FOREIGN KEY ("iban_verified_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD CONSTRAINT "commerce_seller_logo_file_id_stored_file_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD CONSTRAINT "commerce_seller_agreement_accepted_by_account_id_account_id_fk" FOREIGN KEY ("agreement_accepted_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD CONSTRAINT "commerce_seller_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_document" ADD CONSTRAINT "seller_document_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_document" ADD CONSTRAINT "seller_document_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_document" ADD CONSTRAINT "seller_document_added_by_account_id_account_id_fk" FOREIGN KEY ("added_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_member" ADD CONSTRAINT "seller_member_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_member" ADD CONSTRAINT "seller_member_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_member" ADD CONSTRAINT "seller_member_invited_by_account_id_account_id_fk" FOREIGN KEY ("invited_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_plan" ADD CONSTRAINT "seller_plan_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_subscription" ADD CONSTRAINT "seller_subscription_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_subscription" ADD CONSTRAINT "seller_subscription_plan_id_seller_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."seller_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_subscription" ADD CONSTRAINT "seller_subscription_payment_batch_id_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_seller_slug_key" ON "commerce_seller" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "commerce_seller_owner_idx" ON "commerce_seller" USING btree ("owner_account_id","status");--> statement-breakpoint
CREATE INDEX "commerce_seller_queue_idx" ON "commerce_seller" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_seller_identifier_key" ON "commerce_seller" USING btree ("national_identifier") WHERE "commerce_seller"."status" not in ('REJECTED','TERMINATED') and "commerce_seller"."national_identifier" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_seller_iban_key" ON "commerce_seller" USING btree ("settlement_iban") WHERE "commerce_seller"."status" not in ('REJECTED','TERMINATED') and "commerce_seller"."settlement_iban" is not null;--> statement-breakpoint
CREATE INDEX "seller_document_seller_idx" ON "seller_document" USING btree ("seller_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_document_live_key" ON "seller_document" USING btree ("seller_id","kind") WHERE "seller_document"."superseded_at" is null and "seller_document"."kind" <> 'OTHER';--> statement-breakpoint
CREATE UNIQUE INDEX "seller_member_key" ON "seller_member" USING btree ("seller_id","account_id");--> statement-breakpoint
CREATE INDEX "seller_member_account_idx" ON "seller_member" USING btree ("account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_plan_version_key" ON "seller_plan" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_plan_live_key" ON "seller_plan" USING btree ("code") WHERE "seller_plan"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "seller_subscription_seller_idx" ON "seller_subscription" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "seller_subscription_window_idx" ON "seller_subscription" USING btree ("status","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_subscription_batch_key" ON "seller_subscription" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_subscription_live_key" ON "seller_subscription" USING btree ("seller_id") WHERE "seller_subscription"."status" in ('PENDING_PAYMENT','ACTIVE');