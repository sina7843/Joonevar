CREATE TYPE "public"."handover_proposal_status" AS ENUM('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."inquiry_message_kind" AS ENUM('TEXT', 'IMAGE', 'DOCUMENT', 'OFFER', 'HANDOVER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('OPEN', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'CONVERTED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."offer_party" AS ENUM('BUYER', 'SELLER');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'WITHDRAWN');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'INQUIRY_ATTACHMENT';--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'INQUIRY_MESSAGE';--> statement-breakpoint
ALTER TYPE "public"."payment_service" ADD VALUE 'ANIMAL_DEPOSIT';--> statement-breakpoint
CREATE TABLE "inquiry_block" (
	"inquiry_id" uuid NOT NULL,
	"by_account_id" uuid NOT NULL,
	"reason_fa" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiry_block_inquiry_id_by_account_id_pk" PRIMARY KEY("inquiry_id","by_account_id")
);
--> statement-breakpoint
CREATE TABLE "inquiry_handover_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"proposed_by_account_id" uuid NOT NULL,
	"method" "listing_delivery_method" NOT NULL,
	"place_fa" text,
	"proposed_at" timestamp with time zone NOT NULL,
	"status" "handover_proposal_status" DEFAULT 'PROPOSED' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiry_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"sender_account_id" uuid,
	"kind" "inquiry_message_kind" DEFAULT 'TEXT' NOT NULL,
	"body_fa" text,
	"redacted_note_fa" text,
	"file_id" uuid,
	"offer_id" uuid,
	"hidden_at" timestamp with time zone,
	"hidden_by_account_id" uuid,
	"hidden_reason_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiry_message_has_content" CHECK ("inquiry_message"."body_fa" is not null or "inquiry_message"."file_id" is not null or "inquiry_message"."offer_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "listing_inquiry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_account_id" uuid NOT NULL,
	"seller_account_id" uuid NOT NULL,
	"status" "inquiry_status" DEFAULT 'OPEN' NOT NULL,
	"message_fa" text,
	"final_price_toman" bigint,
	"final_price_locked_at" timestamp with time zone,
	"deposit_amount_toman" bigint,
	"commission_fixed_toman" bigint,
	"commission_percent_bp" integer,
	"commission_min_toman" bigint,
	"commission_max_toman" bigint,
	"commission_setting_versions" text,
	"cancellation_policy_version" text,
	"accepted_at" timestamp with time zone,
	"payment_deadline_at" timestamp with time zone,
	"payment_window_hours" integer,
	"payment_batch_id" uuid,
	"reserved_at" timestamp with time zone,
	"contact_revealed_at" timestamp with time zone,
	"closed_reason_fa" text,
	"status_changed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_inquiry_deposit_needs_price" CHECK ("listing_inquiry"."deposit_amount_toman" is null or ("listing_inquiry"."final_price_toman" is not null and "listing_inquiry"."deposit_amount_toman" > 0)),
	CONSTRAINT "listing_inquiry_reserved_needs_batch" CHECK ("listing_inquiry"."reserved_at" is null or "listing_inquiry"."payment_batch_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "listing_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"party" "offer_party" NOT NULL,
	"amount_toman" bigint NOT NULL,
	"status" "offer_status" DEFAULT 'PROPOSED' NOT NULL,
	"supersedes_offer_id" uuid,
	"created_by_account_id" uuid NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_offer_amount_positive" CHECK ("listing_offer"."amount_toman" > 0)
);
--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "inquiry_message_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiry_block" ADD CONSTRAINT "inquiry_block_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_block" ADD CONSTRAINT "inquiry_block_by_account_id_account_id_fk" FOREIGN KEY ("by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_handover_proposal" ADD CONSTRAINT "inquiry_handover_proposal_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_handover_proposal" ADD CONSTRAINT "inquiry_handover_proposal_proposed_by_account_id_account_id_fk" FOREIGN KEY ("proposed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_message" ADD CONSTRAINT "inquiry_message_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_message" ADD CONSTRAINT "inquiry_message_sender_account_id_account_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_message" ADD CONSTRAINT "inquiry_message_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_message" ADD CONSTRAINT "inquiry_message_offer_id_listing_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_message" ADD CONSTRAINT "inquiry_message_hidden_by_account_id_account_id_fk" FOREIGN KEY ("hidden_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_inquiry" ADD CONSTRAINT "listing_inquiry_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_inquiry" ADD CONSTRAINT "listing_inquiry_buyer_account_id_account_id_fk" FOREIGN KEY ("buyer_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_inquiry" ADD CONSTRAINT "listing_inquiry_seller_account_id_account_id_fk" FOREIGN KEY ("seller_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_inquiry" ADD CONSTRAINT "listing_inquiry_payment_batch_id_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_handover_one_live_key" ON "inquiry_handover_proposal" USING btree ("inquiry_id") WHERE "inquiry_handover_proposal"."status" = 'PROPOSED';--> statement-breakpoint
CREATE INDEX "inquiry_handover_inquiry_idx" ON "inquiry_handover_proposal" USING btree ("inquiry_id","created_at");--> statement-breakpoint
CREATE INDEX "inquiry_message_thread_idx" ON "inquiry_message" USING btree ("inquiry_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_inquiry_one_live_key" ON "listing_inquiry" USING btree ("listing_id","buyer_account_id") WHERE "listing_inquiry"."status" in ('OPEN','ACCEPTED');--> statement-breakpoint
CREATE UNIQUE INDEX "listing_inquiry_one_accepted_key" ON "listing_inquiry" USING btree ("listing_id") WHERE "listing_inquiry"."status" in ('ACCEPTED','CONVERTED');--> statement-breakpoint
CREATE INDEX "listing_inquiry_listing_idx" ON "listing_inquiry" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "listing_inquiry_buyer_idx" ON "listing_inquiry" USING btree ("buyer_account_id","status");--> statement-breakpoint
CREATE INDEX "listing_inquiry_deadline_idx" ON "listing_inquiry" USING btree ("status","payment_deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_inquiry_batch_key" ON "listing_inquiry" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_offer_one_live_key" ON "listing_offer" USING btree ("inquiry_id") WHERE "listing_offer"."status" = 'PROPOSED';--> statement-breakpoint
CREATE INDEX "listing_offer_inquiry_idx" ON "listing_offer" USING btree ("inquiry_id","created_at");--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_inquiry_message_id_inquiry_message_id_fk" FOREIGN KEY ("inquiry_message_id") REFERENCES "public"."inquiry_message"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_message_key" ON "moderation_report" USING btree ("reporter_account_id","inquiry_message_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_message_check" CHECK (("moderation_report"."target_kind"::text = 'INQUIRY_MESSAGE') = ("moderation_report"."inquiry_message_id" is not null));