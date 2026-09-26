CREATE TYPE "public"."finder_cancel_kind" AS ENUM('BILATERAL', 'UNILATERAL');--> statement-breakpoint
CREATE TYPE "public"."finder_contract_status" AS ENUM('DRAFTING', 'CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."finder_template_status" AS ENUM('PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."mating_financial_category" AS ENUM('FIXED_AMOUNT', 'OFFSPRING_SHARE', 'MIXED', 'NO_PAYMENT', 'PRIVATE_DETAILS');--> statement-breakpoint
CREATE TYPE "public"."mating_place_category" AS ENUM('SIRE_OWNER', 'DAM_OWNER', 'NEUTRAL');--> statement-breakpoint
CREATE TYPE "public"."mating_request_status" AS ENUM('WAITING_REVIEW', 'PRELIMINARILY_ACCEPTED', 'REJECTED', 'NEGOTIATING', 'CANCELLED', 'EXPIRED', 'CONTRACT_DRAFTING', 'CONTRACT_CONFIRMED', 'MATING_COMPLETED', 'MATING_NOT_COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."mating_route" AS ENUM('OFFICIAL', 'PERSONAL');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'FINDER_MESSAGE_ATTACHMENT';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'FINDER_CONTRACT_PDF';--> statement-breakpoint
ALTER TYPE "public"."rate_limit_action" ADD VALUE 'FINDER_REQUEST_CREATE';--> statement-breakpoint
ALTER TYPE "public"."rate_limit_action" ADD VALUE 'FINDER_MESSAGE_POST';--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'FINDER_MESSAGE';--> statement-breakpoint
CREATE TABLE "finder_contract_approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_version_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"otp_id" uuid NOT NULL,
	"ip" text,
	"user_agent" text,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_contract_otp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_version_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_contract_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"status" "finder_template_status" DEFAULT 'PUBLISHED' NOT NULL,
	"title_fa" text NOT NULL,
	"clauses" jsonb NOT NULL,
	"reason_fa" text NOT NULL,
	"published_by_account_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finder_contract_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_contract" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"status" "finder_contract_status" DEFAULT 'DRAFTING' NOT NULL,
	"current_number" integer DEFAULT 1 NOT NULL,
	"confirmed_number" integer,
	"confirmed_at" timestamp with time zone,
	"pdf_file_id" uuid,
	"cancel_requested_by_account_id" uuid,
	"cancel_requested_at" timestamp with time zone,
	"cancel_kind" "finder_cancel_kind",
	"cancelled_by_account_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_conversation_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"blocker_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_account_id" uuid NOT NULL,
	"body_fa" text,
	"redacted" boolean DEFAULT false NOT NULL,
	"file_id" uuid,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finder_message_content_check" CHECK ("finder_message"."body_fa" is not null or "finder_message"."file_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "mating_coordination" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mating_request_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"from_status" "mating_request_status",
	"to_status" "mating_request_status" NOT NULL,
	"actor_account_id" uuid,
	"reason_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mating_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_account_id" uuid NOT NULL,
	"receiver_account_id" uuid NOT NULL,
	"sender_animal_id" uuid NOT NULL,
	"receiver_animal_id" uuid NOT NULL,
	"receiver_profile_id" uuid NOT NULL,
	"status" "mating_request_status" DEFAULT 'WAITING_REVIEW' NOT NULL,
	"route" "mating_route" NOT NULL,
	"window_from" date NOT NULL,
	"window_to" date NOT NULL,
	"city_fa" text NOT NULL,
	"place_category" "mating_place_category" NOT NULL,
	"message_fa" text,
	"financial_category" "mating_financial_category" NOT NULL,
	"special_conditions_fa" text,
	"expires_at" timestamp with time zone NOT NULL,
	"snapshot" jsonb NOT NULL,
	"terms_version" integer DEFAULT 1 NOT NULL,
	"terms_proposed_by_account_id" uuid,
	"paused_at" timestamp with time zone,
	"sender_contact_consent" boolean DEFAULT false NOT NULL,
	"receiver_contact_consent" boolean DEFAULT false NOT NULL,
	"closed_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mating_request_window_check" CHECK ("mating_request"."window_from" <= "mating_request"."window_to"),
	CONSTRAINT "mating_request_two_animals_check" CHECK ("mating_request"."sender_animal_id" <> "mating_request"."receiver_animal_id")
);
--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "finder_message_id" uuid;--> statement-breakpoint
ALTER TABLE "finder_contract_approval" ADD CONSTRAINT "finder_contract_approval_contract_version_id_finder_contract_version_id_fk" FOREIGN KEY ("contract_version_id") REFERENCES "public"."finder_contract_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract_approval" ADD CONSTRAINT "finder_contract_approval_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract_approval" ADD CONSTRAINT "finder_contract_approval_otp_id_finder_contract_otp_id_fk" FOREIGN KEY ("otp_id") REFERENCES "public"."finder_contract_otp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract_otp" ADD CONSTRAINT "finder_contract_otp_contract_version_id_finder_contract_version_id_fk" FOREIGN KEY ("contract_version_id") REFERENCES "public"."finder_contract_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract_otp" ADD CONSTRAINT "finder_contract_otp_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract_template" ADD CONSTRAINT "finder_contract_template_published_by_account_id_account_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract_version" ADD CONSTRAINT "finder_contract_version_contract_id_finder_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."finder_contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract_version" ADD CONSTRAINT "finder_contract_version_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract" ADD CONSTRAINT "finder_contract_request_id_mating_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mating_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract" ADD CONSTRAINT "finder_contract_template_id_finder_contract_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."finder_contract_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract" ADD CONSTRAINT "finder_contract_pdf_file_id_stored_file_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract" ADD CONSTRAINT "finder_contract_cancel_requested_by_account_id_account_id_fk" FOREIGN KEY ("cancel_requested_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_contract" ADD CONSTRAINT "finder_contract_cancelled_by_account_id_account_id_fk" FOREIGN KEY ("cancelled_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_conversation_block" ADD CONSTRAINT "finder_conversation_block_conversation_id_finder_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."finder_conversation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_conversation_block" ADD CONSTRAINT "finder_conversation_block_blocker_account_id_account_id_fk" FOREIGN KEY ("blocker_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_conversation" ADD CONSTRAINT "finder_conversation_request_id_mating_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mating_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_message" ADD CONSTRAINT "finder_message_conversation_id_finder_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."finder_conversation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_message" ADD CONSTRAINT "finder_message_sender_account_id_account_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_message" ADD CONSTRAINT "finder_message_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_coordination" ADD CONSTRAINT "mating_coordination_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_coordination" ADD CONSTRAINT "mating_coordination_request_id_mating_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mating_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_request_event" ADD CONSTRAINT "mating_request_event_request_id_mating_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mating_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_request_event" ADD CONSTRAINT "mating_request_event_actor_account_id_account_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_request" ADD CONSTRAINT "mating_request_sender_account_id_account_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_request" ADD CONSTRAINT "mating_request_receiver_account_id_account_id_fk" FOREIGN KEY ("receiver_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_request" ADD CONSTRAINT "mating_request_sender_animal_id_animal_id_fk" FOREIGN KEY ("sender_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_request" ADD CONSTRAINT "mating_request_receiver_animal_id_animal_id_fk" FOREIGN KEY ("receiver_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_request" ADD CONSTRAINT "mating_request_receiver_profile_id_mating_profile_id_fk" FOREIGN KEY ("receiver_profile_id") REFERENCES "public"."mating_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_request" ADD CONSTRAINT "mating_request_terms_proposed_by_account_id_account_id_fk" FOREIGN KEY ("terms_proposed_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finder_contract_approval_key" ON "finder_contract_approval" USING btree ("contract_version_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_contract_approval_otp_key" ON "finder_contract_approval" USING btree ("otp_id");--> statement-breakpoint
CREATE INDEX "finder_contract_otp_version_idx" ON "finder_contract_otp" USING btree ("contract_version_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_template_version_key" ON "finder_contract_template" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_template_one_published_key" ON "finder_contract_template" USING btree ("status") WHERE "finder_contract_template"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "finder_contract_version_key" ON "finder_contract_version" USING btree ("contract_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_contract_request_key" ON "finder_contract" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_conversation_block_key" ON "finder_conversation_block" USING btree ("conversation_id","blocker_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_conversation_request_key" ON "finder_conversation" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "finder_message_conversation_idx" ON "finder_message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mating_coordination_one_active_key" ON "mating_coordination" USING btree ("animal_id") WHERE "mating_coordination"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "mating_coordination_request_animal_key" ON "mating_coordination" USING btree ("request_id","animal_id");--> statement-breakpoint
CREATE INDEX "mating_request_event_request_idx" ON "mating_request_event" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mating_request_one_live_pair_key" ON "mating_request" USING btree ("sender_animal_id","receiver_animal_id") WHERE "mating_request"."status" in ('WAITING_REVIEW','PRELIMINARILY_ACCEPTED','NEGOTIATING','CONTRACT_DRAFTING','CONTRACT_CONFIRMED');--> statement-breakpoint
CREATE INDEX "mating_request_receiver_idx" ON "mating_request" USING btree ("receiver_account_id","status");--> statement-breakpoint
CREATE INDEX "mating_request_sender_idx" ON "mating_request" USING btree ("sender_account_id","status");--> statement-breakpoint
CREATE INDEX "mating_request_expiry_idx" ON "mating_request" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_finder_message_id_finder_message_id_fk" FOREIGN KEY ("finder_message_id") REFERENCES "public"."finder_message"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_report_one_open_finder_message_key" ON "moderation_report" USING btree ("reporter_account_id","finder_message_id") WHERE "moderation_report"."status" = 'OPEN';--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_finder_message_check" CHECK (("moderation_report"."target_kind"::text = 'FINDER_MESSAGE') = ("moderation_report"."finder_message_id" is not null));