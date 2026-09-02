CREATE TYPE "public"."chip_bound_via" AS ENUM('IMPLANT', 'EXISTING_UNREGISTERED');--> statement-breakpoint
CREATE TYPE "public"."chip_conflict_kind" AS ENUM('BELONGS_TO_OTHER_ANIMAL', 'ANIMAL_HAS_OTHER_CHIP', 'SERIAL_MISMATCH', 'DUPLICATE_NUMBER');--> statement-breakpoint
CREATE TYPE "public"."chip_read_method" AS ENUM('BLUETOOTH_READER', 'MOBILE_READER', 'PACKAGE_BARCODE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."sample_event_kind" AS ENUM('COLLECTED', 'CUSTODY_RECORDED', 'SEND_INSTRUCTED', 'SHIPPED', 'MARKED_UNUSABLE', 'RESAMPLED');--> statement-breakpoint
CREATE TYPE "public"."sample_status" AS ENUM('IN_CUSTODY', 'SEND_INSTRUCTED', 'SHIPPED', 'INVALID', 'INSUFFICIENT', 'DAMAGED', 'LOST');--> statement-breakpoint
CREATE TABLE "chip_procedure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"vet_account_id" uuid NOT NULL,
	"pre_read_number" text,
	"pre_read_method" "chip_read_method",
	"pre_read_at" timestamp with time zone,
	"implant_confirmed_at" timestamp with time zone,
	"post_read_number" text,
	"post_read_method" "chip_read_method",
	"post_read_at" timestamp with time zone,
	"microchip_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "microchip_conflict" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"request_id" uuid,
	"reported_by_account_id" uuid NOT NULL,
	"kind" "chip_conflict_kind" NOT NULL,
	"observed_number" text,
	"detail_fa" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "microchip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"number" text NOT NULL,
	"bound_via" "chip_bound_via" NOT NULL,
	"read_method" "chip_read_method" NOT NULL,
	"bound_by_account_id" uuid NOT NULL,
	"location_id" uuid,
	"request_id" uuid,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sample_id" uuid NOT NULL,
	"kind" "sample_event_kind" NOT NULL,
	"by_account_id" uuid,
	"note_fa" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracking_code" text NOT NULL,
	"animal_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"custody_account_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"status" "sample_status" DEFAULT 'IN_CUSTODY' NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"unusable_reason_fa" text,
	"superseded_by_sample_id" uuid,
	"send_instructed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"shipment_ref_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chip_procedure" ADD CONSTRAINT "chip_procedure_request_id_vet_visit_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."vet_visit_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_procedure" ADD CONSTRAINT "chip_procedure_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_procedure" ADD CONSTRAINT "chip_procedure_vet_account_id_account_id_fk" FOREIGN KEY ("vet_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_procedure" ADD CONSTRAINT "chip_procedure_microchip_id_microchip_id_fk" FOREIGN KEY ("microchip_id") REFERENCES "public"."microchip"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microchip_conflict" ADD CONSTRAINT "microchip_conflict_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microchip_conflict" ADD CONSTRAINT "microchip_conflict_request_id_vet_visit_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."vet_visit_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microchip_conflict" ADD CONSTRAINT "microchip_conflict_reported_by_account_id_account_id_fk" FOREIGN KEY ("reported_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microchip" ADD CONSTRAINT "microchip_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microchip" ADD CONSTRAINT "microchip_bound_by_account_id_account_id_fk" FOREIGN KEY ("bound_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microchip" ADD CONSTRAINT "microchip_location_id_vet_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."vet_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microchip" ADD CONSTRAINT "microchip_request_id_vet_visit_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."vet_visit_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_event" ADD CONSTRAINT "sample_event_sample_id_sample_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."sample"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_event" ADD CONSTRAINT "sample_event_by_account_id_account_id_fk" FOREIGN KEY ("by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample" ADD CONSTRAINT "sample_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample" ADD CONSTRAINT "sample_request_id_vet_visit_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."vet_visit_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample" ADD CONSTRAINT "sample_custody_account_id_account_id_fk" FOREIGN KEY ("custody_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample" ADD CONSTRAINT "sample_location_id_vet_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."vet_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chip_procedure_request_key" ON "chip_procedure" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "microchip_conflict_animal_idx" ON "microchip_conflict" USING btree ("animal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "microchip_animal_key" ON "microchip" USING btree ("animal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "microchip_number_key" ON "microchip" USING btree ("number");--> statement-breakpoint
CREATE INDEX "sample_event_sample_idx" ON "sample_event" USING btree ("sample_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_tracking_code_key" ON "sample" USING btree ("tracking_code");--> statement-breakpoint
CREATE INDEX "sample_request_idx" ON "sample" USING btree ("request_id","status");--> statement-breakpoint
CREATE INDEX "sample_custody_idx" ON "sample" USING btree ("custody_account_id","status");