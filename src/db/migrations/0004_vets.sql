CREATE TYPE "public"."licence_status" AS ENUM('NONE', 'VALID', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('ACTIVE', 'CONSUMED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."vet_location_kind" AS ENUM('CLINIC', 'HOSPITAL', 'CENTRE');--> statement-breakpoint
CREATE TYPE "public"."visit_context" AS ENUM('MICROCHIP', 'DNA', 'PREGNANCY');--> statement-breakpoint
CREATE TYPE "public"."visit_request_status" AS ENUM('ACTIVE', 'CHECKED_IN', 'COMPLETED', 'SUPERSEDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."visit_service_type" AS ENUM('MICROCHIP_IMPLANT', 'MICROCHIP_VERIFICATION', 'DNA_RESAMPLING', 'PREGNANCY_CHECK');--> statement-breakpoint
CREATE TABLE "referral_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" "referral_status" DEFAULT 'ACTIVE' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"validity_days" integer NOT NULL,
	"settings_version" integer NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_account_id" uuid,
	"ended_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vet_account_id" uuid NOT NULL,
	"name_fa" text NOT NULL,
	"kind" "vet_location_kind" DEFAULT 'CLINIC' NOT NULL,
	"province_fa" text,
	"city_fa" text,
	"neighborhood_fa" text,
	"address_fa" text,
	"phone" text,
	"latitude" double precision,
	"longitude" double precision,
	"licence_number" text,
	"licence_status" "licence_status" DEFAULT 'NONE' NOT NULL,
	"can_implant_microchip" boolean DEFAULT false NOT NULL,
	"can_draw_blood_sample" boolean DEFAULT false NOT NULL,
	"can_pregnancy_check" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"display_name_fa" text NOT NULL,
	"council_code" text NOT NULL,
	"council_verified_at" timestamp with time zone,
	"phone" text,
	"bio_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_visit_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"context" "visit_context" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_visit_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"vet_account_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"context" "visit_context" NOT NULL,
	"service_type" "visit_service_type" NOT NULL,
	"status" "visit_request_status" DEFAULT 'ACTIVE' NOT NULL,
	"superseded_by_request_id" uuid,
	"supersede_reason_fa" text,
	"checked_in_at" timestamp with time zone,
	"checked_in_by_account_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "referral_code" ADD CONSTRAINT "referral_code_request_id_vet_visit_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."vet_visit_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_code" ADD CONSTRAINT "referral_code_consumed_by_account_id_account_id_fk" FOREIGN KEY ("consumed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_location" ADD CONSTRAINT "vet_location_vet_account_id_account_id_fk" FOREIGN KEY ("vet_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_visit_batch" ADD CONSTRAINT "vet_visit_batch_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_visit_request" ADD CONSTRAINT "vet_visit_request_batch_id_vet_visit_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."vet_visit_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_visit_request" ADD CONSTRAINT "vet_visit_request_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_visit_request" ADD CONSTRAINT "vet_visit_request_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_visit_request" ADD CONSTRAINT "vet_visit_request_vet_account_id_account_id_fk" FOREIGN KEY ("vet_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_visit_request" ADD CONSTRAINT "vet_visit_request_location_id_vet_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."vet_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_visit_request" ADD CONSTRAINT "vet_visit_request_checked_in_by_account_id_account_id_fk" FOREIGN KEY ("checked_in_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_code_key" ON "referral_code" USING btree ("code");--> statement-breakpoint
CREATE INDEX "referral_code_request_idx" ON "referral_code" USING btree ("request_id","status");--> statement-breakpoint
CREATE INDEX "vet_location_vet_idx" ON "vet_location" USING btree ("vet_account_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_profile_account_key" ON "vet_profile" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_profile_council_code_key" ON "vet_profile" USING btree ("council_code");--> statement-breakpoint
CREATE INDEX "vet_visit_batch_owner_idx" ON "vet_visit_batch" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "vet_visit_request_owner_idx" ON "vet_visit_request" USING btree ("owner_account_id","status");--> statement-breakpoint
CREATE INDEX "vet_visit_request_vet_idx" ON "vet_visit_request" USING btree ("vet_account_id","status");--> statement-breakpoint
CREATE INDEX "vet_visit_request_animal_idx" ON "vet_visit_request" USING btree ("animal_id");--> statement-breakpoint
CREATE INDEX "vet_visit_request_batch_idx" ON "vet_visit_request" USING btree ("batch_id");