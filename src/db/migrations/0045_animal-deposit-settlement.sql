CREATE TYPE "public"."commission_rule_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."deal_cancellation_outcome" AS ENUM('FULL_REFUND', 'PARTIAL_REFUND', 'NO_REFUND', 'AWAITING_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."deal_cancellation_reason" AS ENUM('BUYER_CANCELLED', 'SELLER_CANCELLED', 'INFO_MISMATCH', 'FALSE_LISTING', 'HEALTH_ISSUE', 'BUYER_NO_SHOW', 'SELLER_NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."deposit_refund_status" AS ENUM('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'MANUAL_REQUIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."dispute_decision" AS ENUM('BUYER_FAVOURED', 'SELLER_FAVOURED', 'NO_FAULT', 'OUT_OF_SCOPE');--> statement-breakpoint
CREATE TYPE "public"."dispute_scope" AS ENUM('DEPOSIT', 'LISTING_FACTS', 'HANDOVER');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."refund_attempt_outcome" AS ENUM('REFUNDED', 'FAILED', 'UNSUPPORTED');--> statement-breakpoint
CREATE TYPE "public"."seller_debt_status" AS ENUM('OUTSTANDING', 'SETTLED', 'WAIVED');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'DISPUTE_EVIDENCE';--> statement-breakpoint
CREATE TABLE "animal_commission_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species_code" text NOT NULL,
	"seller_kind" "listing_seller_kind",
	"fixed_toman" bigint NOT NULL,
	"percent_bp" integer NOT NULL,
	"min_toman" bigint,
	"max_toman" bigint,
	"status" "commission_rule_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"note_fa" text,
	"created_by_account_id" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "animal_commission_rule_percent_range" CHECK ("animal_commission_rule"."percent_bp" >= 0 and "animal_commission_rule"."percent_bp" <= 10000),
	CONSTRAINT "animal_commission_rule_fixed_positive" CHECK ("animal_commission_rule"."fixed_toman" >= 0),
	CONSTRAINT "animal_commission_rule_bounds" CHECK ("animal_commission_rule"."min_toman" is null or "animal_commission_rule"."max_toman" is null or "animal_commission_rule"."max_toman" >= "animal_commission_rule"."min_toman")
);
--> statement-breakpoint
CREATE TABLE "deal_cancellation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"requested_by_party" text NOT NULL,
	"reason" "deal_cancellation_reason" NOT NULL,
	"statement_fa" text,
	"outcome" "deal_cancellation_outcome" NOT NULL,
	"policy_version" text,
	"deposit_amount_toman" bigint NOT NULL,
	"buyer_penalty_bp" integer,
	"penalty_amount_toman" bigint DEFAULT 0 NOT NULL,
	"refund_amount_toman" bigint DEFAULT 0 NOT NULL,
	"decided_by_account_id" uuid,
	"decision_reason_fa" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_cancellation_party" CHECK ("deal_cancellation"."requested_by_party" in ('BUYER','SELLER')),
	CONSTRAINT "deal_cancellation_amounts" CHECK ("deal_cancellation"."penalty_amount_toman" >= 0 and "deal_cancellation"."refund_amount_toman" >= 0
          and "deal_cancellation"."penalty_amount_toman" + "deal_cancellation"."refund_amount_toman" <= "deal_cancellation"."deposit_amount_toman")
);
--> statement-breakpoint
CREATE TABLE "deal_dispute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"cancellation_id" uuid,
	"opened_by_account_id" uuid NOT NULL,
	"opened_by_party" text NOT NULL,
	"scope" "dispute_scope" NOT NULL,
	"claim_fa" text NOT NULL,
	"status" "dispute_status" DEFAULT 'OPEN' NOT NULL,
	"decision" "dispute_decision",
	"decision_reason_fa" text,
	"refund_amount_toman" bigint,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_dispute_party" CHECK ("deal_dispute"."opened_by_party" in ('BUYER','SELLER')),
	CONSTRAINT "deal_dispute_decided" CHECK ("deal_dispute"."status" <> 'RESOLVED' or ("deal_dispute"."decision" is not null and "deal_dispute"."decision_reason_fa" is not null))
);
--> statement-breakpoint
CREATE TABLE "deposit_refund_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"request_ref" text NOT NULL,
	"outcome" "refund_attempt_outcome" NOT NULL,
	"provider_refund_ref" text,
	"error_fa" text,
	"started_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposit_refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"cancellation_id" uuid,
	"payment_batch_id" uuid NOT NULL,
	"recipient_account_id" uuid NOT NULL,
	"amount_toman" bigint NOT NULL,
	"status" "deposit_refund_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_fa" text,
	"provider_refund_ref" text,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_refund_amount_positive" CHECK ("deposit_refund"."amount_toman" > 0),
	CONSTRAINT "deposit_refund_paid_needs_ref" CHECK ("deposit_refund"."status" <> 'PAID' or ("deposit_refund"."provider_refund_ref" is not null and "deposit_refund"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "dispute_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"added_by_account_id" uuid NOT NULL,
	"file_id" uuid,
	"note_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_evidence_has_content" CHECK ("dispute_evidence"."file_id" is not null or "dispute_evidence"."note_fa" is not null)
);
--> statement-breakpoint
CREATE TABLE "seller_debt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"inquiry_id" uuid,
	"cancellation_id" uuid,
	"amount_toman" bigint NOT NULL,
	"status" "seller_debt_status" DEFAULT 'OUTSTANDING' NOT NULL,
	"reason_fa" text NOT NULL,
	"settled_by_account_id" uuid,
	"settled_at" timestamp with time zone,
	"settlement_note_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_debt_amount_positive" CHECK ("seller_debt"."amount_toman" > 0)
);
--> statement-breakpoint
-- PROMPT-006 names the service ANIMAL_SALE_DEPOSIT. Renaming the value keeps
-- every existing payment row pointing at the same service: dropping and
-- recreating the type (which is what the generator proposed) would fail the
-- cast on any batch already recorded as ANIMAL_DEPOSIT, and a migration must
-- not destroy a verified payment's own record of what it paid for.
ALTER TYPE "public"."payment_service" RENAME VALUE 'ANIMAL_DEPOSIT' TO 'ANIMAL_SALE_DEPOSIT';--> statement-breakpoint
ALTER TABLE "listing_inquiry" ADD COLUMN "commission_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "listing_inquiry" ADD COLUMN "buyer_penalty_bp" integer;--> statement-breakpoint
ALTER TABLE "listing_inquiry" ADD COLUMN "seller_penalty_toman" bigint;--> statement-breakpoint
ALTER TABLE "listing_inquiry" ADD COLUMN "seller_restriction_days" integer;--> statement-breakpoint
ALTER TABLE "animal_commission_rule" ADD CONSTRAINT "animal_commission_rule_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_commission_rule" ADD CONSTRAINT "animal_commission_rule_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_cancellation" ADD CONSTRAINT "deal_cancellation_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_cancellation" ADD CONSTRAINT "deal_cancellation_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_cancellation" ADD CONSTRAINT "deal_cancellation_requested_by_account_id_account_id_fk" FOREIGN KEY ("requested_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_cancellation" ADD CONSTRAINT "deal_cancellation_decided_by_account_id_account_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_dispute" ADD CONSTRAINT "deal_dispute_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_dispute" ADD CONSTRAINT "deal_dispute_cancellation_id_deal_cancellation_id_fk" FOREIGN KEY ("cancellation_id") REFERENCES "public"."deal_cancellation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_dispute" ADD CONSTRAINT "deal_dispute_opened_by_account_id_account_id_fk" FOREIGN KEY ("opened_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_dispute" ADD CONSTRAINT "deal_dispute_decided_by_account_id_account_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_refund_attempt" ADD CONSTRAINT "deposit_refund_attempt_refund_id_deposit_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."deposit_refund"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_refund_attempt" ADD CONSTRAINT "deposit_refund_attempt_started_by_account_id_account_id_fk" FOREIGN KEY ("started_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_refund" ADD CONSTRAINT "deposit_refund_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_refund" ADD CONSTRAINT "deposit_refund_cancellation_id_deal_cancellation_id_fk" FOREIGN KEY ("cancellation_id") REFERENCES "public"."deal_cancellation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_refund" ADD CONSTRAINT "deposit_refund_recipient_account_id_account_id_fk" FOREIGN KEY ("recipient_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_deal_dispute_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."deal_dispute"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_added_by_account_id_account_id_fk" FOREIGN KEY ("added_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_debt" ADD CONSTRAINT "seller_debt_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_debt" ADD CONSTRAINT "seller_debt_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_debt" ADD CONSTRAINT "seller_debt_cancellation_id_deal_cancellation_id_fk" FOREIGN KEY ("cancellation_id") REFERENCES "public"."deal_cancellation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_debt" ADD CONSTRAINT "seller_debt_settled_by_account_id_account_id_fk" FOREIGN KEY ("settled_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animal_commission_rule_live_key" ON "animal_commission_rule" USING btree ("species_code","seller_kind") WHERE "animal_commission_rule"."status" = 'PUBLISHED' and "animal_commission_rule"."seller_kind" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "animal_commission_rule_live_any_key" ON "animal_commission_rule" USING btree ("species_code") WHERE "animal_commission_rule"."status" = 'PUBLISHED' and "animal_commission_rule"."seller_kind" is null;--> statement-breakpoint
CREATE INDEX "animal_commission_rule_scope_idx" ON "animal_commission_rule" USING btree ("species_code","status");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_cancellation_one_key" ON "deal_cancellation" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "deal_cancellation_listing_idx" ON "deal_cancellation" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_dispute_one_live_key" ON "deal_dispute" USING btree ("inquiry_id") WHERE "deal_dispute"."status" in ('OPEN','UNDER_REVIEW');--> statement-breakpoint
CREATE INDEX "deal_dispute_queue_idx" ON "deal_dispute" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_refund_attempt_ref_key" ON "deposit_refund_attempt" USING btree ("request_ref");--> statement-breakpoint
CREATE INDEX "deposit_refund_attempt_refund_idx" ON "deposit_refund_attempt" USING btree ("refund_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_refund_one_key" ON "deposit_refund" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "deposit_refund_queue_idx" ON "deposit_refund" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "dispute_evidence_dispute_idx" ON "dispute_evidence" USING btree ("dispute_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_debt_cancellation_key" ON "seller_debt" USING btree ("cancellation_id");--> statement-breakpoint
CREATE INDEX "seller_debt_account_idx" ON "seller_debt" USING btree ("account_id","status");