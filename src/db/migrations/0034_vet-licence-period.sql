CREATE TYPE "public"."vet_licence_period_kind" AS ENUM('ACTIVATION', 'RENEWAL');--> statement-breakpoint
CREATE TYPE "public"."vet_licence_period_status" AS ENUM('PENDING_PAYMENT', 'ACTIVE', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."payment_service" ADD VALUE 'VET_LICENSE_ACTIVATION';--> statement-breakpoint
ALTER TYPE "public"."payment_service" ADD VALUE 'VET_LICENSE_RENEWAL';--> statement-breakpoint
CREATE TABLE "vet_licence_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" "vet_licence_period_kind" NOT NULL,
	"status" "vet_licence_period_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_batch_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"tariff_setting_key" text NOT NULL,
	"tariff_setting_version" integer NOT NULL,
	"amount_toman" numeric(14, 0) NOT NULL,
	"period_days" integer NOT NULL,
	"grace_days" integer,
	"reminder_days_before" integer,
	"reminder_sent_at" timestamp with time zone,
	"expired_notice_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vet_licence_period_days_positive" CHECK ("vet_licence_period"."period_days" >= 1),
	CONSTRAINT "vet_licence_period_grace_not_negative" CHECK ("vet_licence_period"."grace_days" is null or "vet_licence_period"."grace_days" >= 0),
	CONSTRAINT "vet_licence_period_window_matches_status" CHECK (("vet_licence_period"."status" = 'ACTIVE') = ("vet_licence_period"."starts_at" is not null and "vet_licence_period"."ends_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "vet_licence_period" ADD CONSTRAINT "vet_licence_period_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_licence_period" ADD CONSTRAINT "vet_licence_period_case_id_vet_professional_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."vet_professional_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_licence_period" ADD CONSTRAINT "vet_licence_period_payment_batch_id_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vet_licence_period_batch_key" ON "vet_licence_period" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE INDEX "vet_licence_period_account_idx" ON "vet_licence_period" USING btree ("account_id","status","ends_at");--> statement-breakpoint
CREATE INDEX "vet_licence_period_case_idx" ON "vet_licence_period" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_licence_period_pending_key" ON "vet_licence_period" USING btree ("case_id") WHERE "vet_licence_period"."status" = 'PENDING_PAYMENT';