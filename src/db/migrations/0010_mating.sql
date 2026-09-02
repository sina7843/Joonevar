CREATE TYPE "public"."allocation_rule_type" AS ENUM('FIXED', 'PERCENTAGE', 'MIXED');--> statement-breakpoint
CREATE TYPE "public"."permit_status" AS ENUM('DRAFT', 'AWAITING_COUNTERPARTY', 'AWAITING_PAYMENT', 'READY_TO_SUBMIT', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'ISSUED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "mating_permit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiator_account_id" uuid NOT NULL,
	"counterparty_account_id" uuid,
	"sire_animal_id" uuid NOT NULL,
	"dam_animal_id" uuid NOT NULL,
	"status" "permit_status" DEFAULT 'DRAFT' NOT NULL,
	"rule_type" "allocation_rule_type",
	"rule_note_fa" text,
	"invited_at" timestamp with time zone,
	"counterparty_confirmed_at" timestamp with time zone,
	"batch_id" uuid,
	"submitted_at" timestamp with time zone,
	"reason_fa" text,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"permit_no" text,
	"issued_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permit_allocation_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"permit_id" uuid NOT NULL,
	"side" text NOT NULL,
	"party_account_id" uuid NOT NULL,
	"fixed_count" integer,
	"percent" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mating_permit" ADD CONSTRAINT "mating_permit_initiator_account_id_account_id_fk" FOREIGN KEY ("initiator_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_permit" ADD CONSTRAINT "mating_permit_counterparty_account_id_account_id_fk" FOREIGN KEY ("counterparty_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_permit" ADD CONSTRAINT "mating_permit_sire_animal_id_animal_id_fk" FOREIGN KEY ("sire_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_permit" ADD CONSTRAINT "mating_permit_dam_animal_id_animal_id_fk" FOREIGN KEY ("dam_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_permit" ADD CONSTRAINT "mating_permit_batch_id_payment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_permit" ADD CONSTRAINT "mating_permit_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permit_allocation_share" ADD CONSTRAINT "permit_allocation_share_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permit_allocation_share" ADD CONSTRAINT "permit_allocation_share_party_account_id_account_id_fk" FOREIGN KEY ("party_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mating_permit_no_key" ON "mating_permit" USING btree ("permit_no");--> statement-breakpoint
CREATE INDEX "mating_permit_initiator_idx" ON "mating_permit" USING btree ("initiator_account_id","status");--> statement-breakpoint
CREATE INDEX "mating_permit_counterparty_idx" ON "mating_permit" USING btree ("counterparty_account_id","status");--> statement-breakpoint
CREATE INDEX "mating_permit_animals_idx" ON "mating_permit" USING btree ("sire_animal_id","dam_animal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permit_allocation_side_key" ON "permit_allocation_share" USING btree ("permit_id","side");