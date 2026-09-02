CREATE TYPE "public"."allocation_status" AS ENUM('PENDING_BOTH_OWNERS', 'FINAL', 'SUPERSEDED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "allocation_approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"party_account_id" uuid NOT NULL,
	"approved" boolean NOT NULL,
	"reason_fa" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocation_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"puppy_id" uuid NOT NULL,
	"proposed_owner_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puppy_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"permit_id" uuid NOT NULL,
	"litter_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "allocation_status" DEFAULT 'PENDING_BOTH_OWNERS' NOT NULL,
	"proposed_by_account_id" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note_fa" text,
	"replaces_version" integer,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puppy_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puppy_id" uuid NOT NULL,
	"permit_id" uuid NOT NULL,
	"card_no" text NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"allocation_version" integer NOT NULL,
	"batch_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "allocation_approval" ADD CONSTRAINT "allocation_approval_allocation_id_puppy_allocation_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."puppy_allocation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_approval" ADD CONSTRAINT "allocation_approval_party_account_id_account_id_fk" FOREIGN KEY ("party_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_item" ADD CONSTRAINT "allocation_item_allocation_id_puppy_allocation_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."puppy_allocation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_item" ADD CONSTRAINT "allocation_item_puppy_id_puppy_id_fk" FOREIGN KEY ("puppy_id") REFERENCES "public"."puppy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_item" ADD CONSTRAINT "allocation_item_proposed_owner_account_id_account_id_fk" FOREIGN KEY ("proposed_owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy_allocation" ADD CONSTRAINT "puppy_allocation_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy_allocation" ADD CONSTRAINT "puppy_allocation_litter_id_litter_id_fk" FOREIGN KEY ("litter_id") REFERENCES "public"."litter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy_allocation" ADD CONSTRAINT "puppy_allocation_proposed_by_account_id_account_id_fk" FOREIGN KEY ("proposed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy_card" ADD CONSTRAINT "puppy_card_puppy_id_puppy_id_fk" FOREIGN KEY ("puppy_id") REFERENCES "public"."puppy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy_card" ADD CONSTRAINT "puppy_card_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy_card" ADD CONSTRAINT "puppy_card_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy_card" ADD CONSTRAINT "puppy_card_batch_id_payment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_approval_party_key" ON "allocation_approval" USING btree ("allocation_id","party_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_item_puppy_key" ON "allocation_item" USING btree ("allocation_id","puppy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "puppy_allocation_version_key" ON "puppy_allocation" USING btree ("permit_id","version");--> statement-breakpoint
CREATE INDEX "puppy_allocation_litter_idx" ON "puppy_allocation" USING btree ("litter_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "puppy_card_puppy_key" ON "puppy_card" USING btree ("puppy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "puppy_card_no_key" ON "puppy_card" USING btree ("card_no");