CREATE TYPE "public"."membership_number_status" AS ENUM('PENDING', 'ISSUED');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('NONE', 'PAYMENT_PENDING', 'ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('PENDING', 'VERIFIED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_batch_status" AS ENUM('DRAFT', 'AWAITING_PAYMENT', 'PAID', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_item_status" AS ENUM('PENDING', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_service" AS ENUM('MEMBERSHIP', 'REGISTRATION_SHEET', 'PEDIGREE', 'MATING_PERMIT', 'KENNEL_REGISTRATION', 'PUPPY_CARD');--> statement-breakpoint
CREATE TABLE "dev_payment_outcome" (
	"reference" text PRIMARY KEY NOT NULL,
	"paid" text NOT NULL,
	"amount_rial" numeric(20, 0) NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"status" "membership_status" DEFAULT 'NONE' NOT NULL,
	"activated_at" timestamp with time zone,
	"membership_no" text,
	"number_status" "membership_number_status" DEFAULT 'PENDING' NOT NULL,
	"payment_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"reference" text NOT NULL,
	"amount_rial" numeric(20, 0) NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'PENDING' NOT NULL,
	"provider_ref" text,
	"failure_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"service" "payment_service" NOT NULL,
	"status" "payment_batch_status" DEFAULT 'DRAFT' NOT NULL,
	"resume_context" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_callback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_ref" text NOT NULL,
	"attempt_id" uuid,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"amount_toman" numeric(20, 0) NOT NULL,
	"setting_key" text NOT NULL,
	"setting_version" integer NOT NULL,
	"status" "payment_item_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_payment_batch_id_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_batch_id_payment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_batch" ADD CONSTRAINT "payment_batch_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_callback" ADD CONSTRAINT "payment_callback_attempt_id_payment_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_item" ADD CONSTRAINT "payment_item_batch_id_payment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_no_key" ON "membership" USING btree ("membership_no");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempt_reference_key" ON "payment_attempt" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payment_attempt_batch_idx" ON "payment_attempt" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "payment_batch_account_idx" ON "payment_batch" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_callback_key" ON "payment_callback" USING btree ("provider","external_ref");--> statement-breakpoint
CREATE INDEX "payment_item_batch_idx" ON "payment_item" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_item_target_key" ON "payment_item" USING btree ("batch_id","target_type","target_id");