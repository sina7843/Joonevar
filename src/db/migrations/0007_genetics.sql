CREATE TYPE "public"."parentage_result_status" AS ENUM('WAITING_PARENT_RESULTS', 'TECHNICAL_REVIEW', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('DRAFT', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."sample_event_kind" ADD VALUE 'RECEIVED' BEFORE 'MARKED_UNUSABLE';--> statement-breakpoint
ALTER TYPE "public"."sample_event_kind" ADD VALUE 'PROCESSING_STARTED' BEFORE 'MARKED_UNUSABLE';--> statement-breakpoint
ALTER TYPE "public"."sample_status" ADD VALUE 'RECEIVED' BEFORE 'INVALID';--> statement-breakpoint
ALTER TYPE "public"."sample_status" ADD VALUE 'PROCESSING' BEFORE 'INVALID';--> statement-breakpoint
CREATE TABLE "genetics_receipt_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genetics_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"file_id" uuid,
	"status" "receipt_status" DEFAULT 'DRAFT' NOT NULL,
	"payer_note_fa" text,
	"reason_fa" text,
	"submitted_at" timestamp with time zone,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parentage_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"status" "parentage_result_status" DEFAULT 'TECHNICAL_REVIEW' NOT NULL,
	"result_version" integer DEFAULT 1 NOT NULL,
	"supersedes_result_id" uuid,
	"sire_result_id" uuid,
	"dam_result_id" uuid,
	"technical_note_fa" text,
	"recorded_by_account_id" uuid NOT NULL,
	"processed_at" timestamp with time zone,
	"finalised_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "genetics_receipt_item" ADD CONSTRAINT "genetics_receipt_item_receipt_id_genetics_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."genetics_receipt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genetics_receipt_item" ADD CONSTRAINT "genetics_receipt_item_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genetics_receipt_item" ADD CONSTRAINT "genetics_receipt_item_sample_id_sample_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."sample"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genetics_receipt" ADD CONSTRAINT "genetics_receipt_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genetics_receipt" ADD CONSTRAINT "genetics_receipt_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genetics_receipt" ADD CONSTRAINT "genetics_receipt_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parentage_result" ADD CONSTRAINT "parentage_result_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parentage_result" ADD CONSTRAINT "parentage_result_sample_id_sample_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."sample"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parentage_result" ADD CONSTRAINT "parentage_result_recorded_by_account_id_account_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "genetics_receipt_item_sample_key" ON "genetics_receipt_item" USING btree ("receipt_id","sample_id");--> statement-breakpoint
CREATE INDEX "genetics_receipt_item_animal_idx" ON "genetics_receipt_item" USING btree ("animal_id");--> statement-breakpoint
CREATE INDEX "genetics_receipt_owner_idx" ON "genetics_receipt" USING btree ("owner_account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "parentage_result_animal_version_key" ON "parentage_result" USING btree ("animal_id","result_version");--> statement-breakpoint
CREATE INDEX "parentage_result_animal_idx" ON "parentage_result" USING btree ("animal_id","status");