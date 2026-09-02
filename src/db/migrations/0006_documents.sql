CREATE TYPE "public"."issuance_state" AS ENUM('AWAITING_PAYMENT', 'AWAITING_ISSUANCE', 'ISSUED', 'BLOCKED');--> statement-breakpoint
CREATE TABLE "registration_sheet_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"payment_item_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"state" "issuance_state" DEFAULT 'AWAITING_PAYMENT' NOT NULL,
	"blocked_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_sheet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"sheet_no" text NOT NULL,
	"pet_id" text NOT NULL,
	"microchip_number" text NOT NULL,
	"sample_tracking_code" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registration_sheet_item" ADD CONSTRAINT "registration_sheet_item_batch_id_payment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sheet_item" ADD CONSTRAINT "registration_sheet_item_payment_item_id_payment_item_id_fk" FOREIGN KEY ("payment_item_id") REFERENCES "public"."payment_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sheet_item" ADD CONSTRAINT "registration_sheet_item_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sheet_item" ADD CONSTRAINT "registration_sheet_item_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sheet" ADD CONSTRAINT "registration_sheet_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sheet" ADD CONSTRAINT "registration_sheet_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sheet" ADD CONSTRAINT "registration_sheet_item_id_registration_sheet_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."registration_sheet_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sheet" ADD CONSTRAINT "registration_sheet_batch_id_payment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registration_sheet_item_batch_animal_key" ON "registration_sheet_item" USING btree ("batch_id","animal_id");--> statement-breakpoint
CREATE INDEX "registration_sheet_item_owner_idx" ON "registration_sheet_item" USING btree ("owner_account_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_sheet_animal_key" ON "registration_sheet" USING btree ("animal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_sheet_no_key" ON "registration_sheet" USING btree ("sheet_no");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_sheet_pet_id_key" ON "registration_sheet" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "registration_sheet_owner_idx" ON "registration_sheet" USING btree ("owner_account_id");