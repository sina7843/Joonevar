CREATE TYPE "public"."account_role_name" AS ENUM('BREEDER', 'TRUSTED_VET', 'ASSOCIATION_OPERATOR', 'GENETICS_OPERATOR', 'SUPERADMIN');--> statement-breakpoint
CREATE TYPE "public"."account_role_status" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('PROFILE_INCOMPLETE', 'ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."actor_context" AS ENUM('USER', 'BREEDER', 'TRUSTED_VET', 'ASSOCIATION_OPERATOR', 'GENETICS_OPERATOR', 'SUPERADMIN');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('ACCOUNT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');--> statement-breakpoint
CREATE TYPE "public"."file_purpose" AS ENUM('KYC_NATIONAL_ID', 'FOREIGN_PEDIGREE_FRONT', 'FOREIGN_PEDIGREE_BACK', 'GENETICS_RECEIPT', 'ANIMAL_PHOTO');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."setting_group" AS ENUM('DEADLINES', 'FEES', 'GENETICS_CENTRE', 'REFERENCE_DATA', 'GUIDE_TEXT', 'OTP_TECHNICAL', 'BREEDING_POLICY');--> statement-breakpoint
CREATE TYPE "public"."setting_kind" AS ENUM('INT', 'MONEY_TOMAN', 'STRING', 'TEXT', 'BOOL', 'JSON');--> statement-breakpoint
CREATE TYPE "public"."setting_scope_type" AS ENUM('GLOBAL');--> statement-breakpoint
CREATE TYPE "public"."setting_source" AS ENUM('PRODUCT_DECISION', 'DOCUMENTED_POLICY', 'TECHNICAL_DEFAULT', 'OPERATIONAL_DATA');--> statement-breakpoint
CREATE TABLE "account_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "account_role_name" NOT NULL,
	"status" "account_role_status" DEFAULT 'PENDING' NOT NULL,
	"granted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" text NOT NULL,
	"status" "account_status" DEFAULT 'PROFILE_INCOMPLETE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_account_id" uuid,
	"actor_context" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_version" integer,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"step" text NOT NULL,
	"origin_route" text NOT NULL,
	"selection" jsonb,
	"title_fa" text NOT NULL,
	"body_fa" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pedigree_issuer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"approved_at" timestamp with time zone,
	"note_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"scope_type" "setting_scope_type" DEFAULT 'GLOBAL' NOT NULL,
	"scope_id" text DEFAULT '' NOT NULL,
	"group" "setting_group" NOT NULL,
	"kind" "setting_kind" NOT NULL,
	"source" "setting_source" NOT NULL,
	"value" jsonb,
	"label_fa" text NOT NULL,
	"note_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_breed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_fa" text NOT NULL,
	"name_en" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account_role" ADD CONSTRAINT "account_role_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_account_id_account_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_account_id_account_id_fk" FOREIGN KEY ("recipient_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_setting" ADD CONSTRAINT "product_setting_updated_by_account_id_account_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_role_unique" ON "account_role" USING btree ("account_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "account_mobile_key" ON "account" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX "audit_event_target_idx" ON "audit_event" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_event_actor_idx" ON "audit_event" USING btree ("actor_account_id");--> statement-breakpoint
CREATE INDEX "audit_event_occurred_idx" ON "audit_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_idem_key" ON "notification_delivery" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_recipient_idx" ON "notification" USING btree ("recipient_account_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_entity_idx" ON "notification" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedigree_issuer_name_key" ON "pedigree_issuer" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "product_setting_scope_key" ON "product_setting" USING btree ("key","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "product_setting_group_idx" ON "product_setting" USING btree ("group");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_breed_name_en_key" ON "reference_breed" USING btree ("name_en");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_file_storage_key" ON "stored_file" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "stored_file_owner_idx" ON "stored_file" USING btree ("owner_account_id");