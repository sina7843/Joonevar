CREATE TYPE "public"."appeal_status" AS ENUM('SUBMITTED', 'UNDER_REVIEW', 'ANSWERED');--> statement-breakpoint
CREATE TYPE "public"."postal_document_type" AS ENUM('REGISTRATION_SHEET', 'PEDIGREE');--> statement-breakpoint
CREATE TABLE "parentage_appeal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"status" "appeal_status" DEFAULT 'SUBMITTED' NOT NULL,
	"message_fa" text NOT NULL,
	"response_fa" text,
	"corrected_result_id" uuid,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedigree_issuance_item" (
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
CREATE TABLE "pedigree" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"pedigree_code" text NOT NULL,
	"issued_from_result_id" uuid NOT NULL,
	"issued_from_result_version" integer NOT NULL,
	"sire_animal_id" uuid,
	"dam_animal_id" uuid,
	"generation_at_issue" integer NOT NULL,
	"correction_notice_fa" text,
	"noticed_at" timestamp with time zone,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postal_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"document_type" "postal_document_type" NOT NULL,
	"document_id" uuid NOT NULL,
	"recipient_name_fa" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"province_fa" text,
	"city_fa" text,
	"address_fa" text NOT NULL,
	"postal_code" text,
	"note_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parentage_appeal" ADD CONSTRAINT "parentage_appeal_result_id_parentage_result_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."parentage_result"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parentage_appeal" ADD CONSTRAINT "parentage_appeal_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parentage_appeal" ADD CONSTRAINT "parentage_appeal_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parentage_appeal" ADD CONSTRAINT "parentage_appeal_corrected_result_id_parentage_result_id_fk" FOREIGN KEY ("corrected_result_id") REFERENCES "public"."parentage_result"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parentage_appeal" ADD CONSTRAINT "parentage_appeal_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedigree_issuance_item" ADD CONSTRAINT "pedigree_issuance_item_batch_id_payment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedigree_issuance_item" ADD CONSTRAINT "pedigree_issuance_item_payment_item_id_payment_item_id_fk" FOREIGN KEY ("payment_item_id") REFERENCES "public"."payment_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedigree_issuance_item" ADD CONSTRAINT "pedigree_issuance_item_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedigree_issuance_item" ADD CONSTRAINT "pedigree_issuance_item_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedigree" ADD CONSTRAINT "pedigree_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedigree" ADD CONSTRAINT "pedigree_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedigree" ADD CONSTRAINT "pedigree_item_id_pedigree_issuance_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pedigree_issuance_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedigree" ADD CONSTRAINT "pedigree_batch_id_payment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedigree" ADD CONSTRAINT "pedigree_issued_from_result_id_parentage_result_id_fk" FOREIGN KEY ("issued_from_result_id") REFERENCES "public"."parentage_result"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postal_request" ADD CONSTRAINT "postal_request_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parentage_appeal_result_idx" ON "parentage_appeal" USING btree ("result_id");--> statement-breakpoint
CREATE INDEX "parentage_appeal_owner_idx" ON "parentage_appeal" USING btree ("owner_account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pedigree_item_batch_animal_key" ON "pedigree_issuance_item" USING btree ("batch_id","animal_id");--> statement-breakpoint
CREATE INDEX "pedigree_item_owner_idx" ON "pedigree_issuance_item" USING btree ("owner_account_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "pedigree_animal_key" ON "pedigree" USING btree ("animal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedigree_code_key" ON "pedigree" USING btree ("pedigree_code");--> statement-breakpoint
CREATE INDEX "pedigree_owner_idx" ON "pedigree" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "postal_request_owner_idx" ON "postal_request" USING btree ("owner_account_id","created_at");--> statement-breakpoint
CREATE INDEX "postal_request_document_idx" ON "postal_request" USING btree ("document_type","document_id");