CREATE TYPE "public"."kyc_status" AS ENUM('DRAFT', 'READY', 'UNDER_REVIEW', 'APPROVED', 'NEEDS_CORRECTION', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('LOGIN', 'MOBILE_CHANGE');--> statement-breakpoint
CREATE TABLE "dev_outbound_sms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_mobile" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "kyc_status" DEFAULT 'DRAFT' NOT NULL,
	"reason_fa" text,
	"document_file_id" uuid,
	"submitted_at" timestamp with time zone,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"mobile" text NOT NULL,
	"account_id" uuid,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"national_id" text NOT NULL,
	"birth_date" date NOT NULL,
	"display_name" text,
	"display_name_visible" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residence" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"province" text,
	"city" text,
	"address" text,
	"postal_code" text,
	"geo_lat" text,
	"geo_lng" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"context" "actor_context" DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "kyc_case" ADD CONSTRAINT "kyc_case_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_case" ADD CONSTRAINT "kyc_case_document_file_id_stored_file_id_fk" FOREIGN KEY ("document_file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_case" ADD CONSTRAINT "kyc_case_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenge" ADD CONSTRAINT "otp_challenge_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residence" ADD CONSTRAINT "residence_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dev_outbound_sms_to_idx" ON "dev_outbound_sms" USING btree ("to_mobile","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_case_account_key" ON "kyc_case" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "kyc_case_status_idx" ON "kyc_case" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "otp_challenge_lookup_idx" ON "otp_challenge" USING btree ("mobile","purpose","created_at");--> statement-breakpoint
CREATE INDEX "otp_challenge_account_idx" ON "otp_challenge" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_national_id_key" ON "profile" USING btree ("national_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_key" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_account_idx" ON "session" USING btree ("account_id");