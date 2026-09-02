CREATE TYPE "public"."kennel_status" AS ENUM('DRAFT', 'READY_TO_SUBMIT', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "kennel_breed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kennel_id" uuid NOT NULL,
	"breed_id" uuid NOT NULL,
	"added_by_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kennel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"status" "kennel_status" DEFAULT 'DRAFT' NOT NULL,
	"name_fa" text,
	"name_en" text,
	"phone" text,
	"province_fa" text,
	"city_fa" text,
	"address_fa" text,
	"latitude" double precision,
	"longitude" double precision,
	"note_fa" text,
	"batch_id" uuid,
	"reason_fa" text,
	"submitted_at" timestamp with time zone,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kennel_breed" ADD CONSTRAINT "kennel_breed_kennel_id_kennel_id_fk" FOREIGN KEY ("kennel_id") REFERENCES "public"."kennel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kennel_breed" ADD CONSTRAINT "kennel_breed_breed_id_reference_breed_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."reference_breed"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kennel_breed" ADD CONSTRAINT "kennel_breed_added_by_account_id_account_id_fk" FOREIGN KEY ("added_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kennel" ADD CONSTRAINT "kennel_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kennel" ADD CONSTRAINT "kennel_batch_id_payment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kennel" ADD CONSTRAINT "kennel_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kennel_breed_key" ON "kennel_breed" USING btree ("kennel_id","breed_id");--> statement-breakpoint
CREATE INDEX "kennel_owner_idx" ON "kennel" USING btree ("owner_account_id","status");