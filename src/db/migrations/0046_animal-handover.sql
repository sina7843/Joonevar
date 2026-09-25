CREATE TYPE "public"."handover_status" AS ENUM('SCHEDULED', 'CODE_ISSUED', 'SELLER_ENTERED', 'COMPLETED', 'REFUSED', 'EXPIRED', 'CANCELLED', 'ON_HOLD');--> statement-breakpoint
CREATE TYPE "public"."ownership_transfer_reason" AS ENUM('MARKETPLACE_SALE', 'ADMIN_CORRECTION');--> statement-breakpoint
ALTER TYPE "public"."inquiry_status" ADD VALUE 'COMPLETED' BEFORE 'CLOSED';--> statement-breakpoint
CREATE TABLE "animal_ownership_transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"reason" "ownership_transfer_reason" NOT NULL,
	"inquiry_id" uuid,
	"handover_id" uuid,
	"price_toman" bigint,
	"note_fa" text,
	"recorded_by_account_id" uuid,
	"transferred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "animal_ownership_transfer_parties" CHECK ("animal_ownership_transfer"."from_account_id" <> "animal_ownership_transfer"."to_account_id")
);
--> statement-breakpoint
CREATE TABLE "deal_handover" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"method" "listing_delivery_method" NOT NULL,
	"vet_location_id" uuid,
	"place_fa" text,
	"scheduled_at" timestamp with time zone,
	"status" "handover_status" DEFAULT 'SCHEDULED' NOT NULL,
	"code_hash" text,
	"code_issued_at" timestamp with time zone,
	"code_expires_at" timestamp with time zone,
	"code_attempts" integer DEFAULT 0 NOT NULL,
	"code_locked_until" timestamp with time zone,
	"code_issues" integer DEFAULT 0 NOT NULL,
	"code_validity_minutes" integer,
	"code_max_attempts" integer,
	"code_setting_version" integer,
	"seller_entered_at" timestamp with time zone,
	"buyer_confirmed_at" timestamp with time zone,
	"statement_version" text,
	"statement_fa" text,
	"final_price_toman" bigint,
	"completed_at" timestamp with time zone,
	"ended_reason_fa" text,
	"ended_by_account_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_handover_completed_needs_both" CHECK ("deal_handover"."status" <> 'COMPLETED'
          or ("deal_handover"."seller_entered_at" is not null and "deal_handover"."buyer_confirmed_at" is not null
              and "deal_handover"."completed_at" is not null and "deal_handover"."statement_version" is not null)),
	CONSTRAINT "deal_handover_vet_location" CHECK ("deal_handover"."vet_location_id" is null or "deal_handover"."method" = 'VET_CLINIC')
);
--> statement-breakpoint
ALTER TABLE "animal_ownership_transfer" ADD CONSTRAINT "animal_ownership_transfer_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_ownership_transfer" ADD CONSTRAINT "animal_ownership_transfer_from_account_id_account_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_ownership_transfer" ADD CONSTRAINT "animal_ownership_transfer_to_account_id_account_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_ownership_transfer" ADD CONSTRAINT "animal_ownership_transfer_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_ownership_transfer" ADD CONSTRAINT "animal_ownership_transfer_handover_id_deal_handover_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."deal_handover"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_ownership_transfer" ADD CONSTRAINT "animal_ownership_transfer_recorded_by_account_id_account_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_handover" ADD CONSTRAINT "deal_handover_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_handover" ADD CONSTRAINT "deal_handover_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_handover" ADD CONSTRAINT "deal_handover_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_handover" ADD CONSTRAINT "deal_handover_vet_location_id_vet_location_id_fk" FOREIGN KEY ("vet_location_id") REFERENCES "public"."vet_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_handover" ADD CONSTRAINT "deal_handover_ended_by_account_id_account_id_fk" FOREIGN KEY ("ended_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animal_ownership_transfer_deal_key" ON "animal_ownership_transfer" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "animal_ownership_transfer_animal_idx" ON "animal_ownership_transfer" USING btree ("animal_id","transferred_at");--> statement-breakpoint
CREATE INDEX "animal_ownership_transfer_to_idx" ON "animal_ownership_transfer" USING btree ("to_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_handover_one_key" ON "deal_handover" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "deal_handover_status_idx" ON "deal_handover" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "deal_handover_animal_idx" ON "deal_handover" USING btree ("animal_id");