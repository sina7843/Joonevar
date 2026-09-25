CREATE TYPE "public"."seller_ledger_bucket" AS ENUM('PENDING', 'HELD', 'AVAILABLE', 'DEBT');--> statement-breakpoint
CREATE TYPE "public"."seller_ledger_kind" AS ENUM('SALE', 'COMMISSION', 'REFUND', 'PROMOTION_CHARGE', 'PENALTY', 'ADJUSTMENT', 'RELEASE', 'PAYOUT', 'DEBT_RECOVERY');--> statement-breakpoint
CREATE TYPE "public"."return_rule_kind" AS ENUM('STANDARD', 'SEALED_ONLY', 'NOT_RETURNABLE');--> statement-breakpoint
CREATE TYPE "public"."order_return_status" AS ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'SHIPPED_BACK', 'RECEIVED', 'REFUNDED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."returned_condition" AS ENUM('AS_SOLD', 'OPENED', 'DAMAGED', 'NOT_AS_DESCRIBED', 'MISSING');--> statement-breakpoint
CREATE TYPE "public"."settlement_batch_status" AS ENUM('DRAFT', 'READY', 'PAID', 'RECONCILED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."settlement_cadence" AS ENUM('WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."shipping_coverage_kind" AS ENUM('WHOLE_COUNTRY', 'PROVINCES');--> statement-breakpoint
CREATE TYPE "public"."shipping_method_kind" AS ENUM('COURIER', 'POST', 'PICKUP');--> statement-breakpoint
CREATE TYPE "public"."shipping_pricing_kind" AS ENUM('FIXED', 'WEIGHT_BASED');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'RETURN_EVIDENCE';--> statement-breakpoint
CREATE TABLE "category_return_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"rule" "return_rule_kind" NOT NULL,
	"window_days" integer,
	"reason_fa" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_return_window_sane" CHECK ("category_return_rule"."window_days" is null or ("category_return_rule"."window_days" >= 0 and "category_return_rule"."window_days" <= 365))
);
--> statement-breakpoint
CREATE TABLE "order_return_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"reason_fa" text NOT NULL,
	"line_refund_toman" bigint NOT NULL,
	CONSTRAINT "order_return_item_quantity_positive" CHECK ("order_return_item"."quantity" > 0),
	CONSTRAINT "order_return_item_refund_non_negative" CHECK ("order_return_item"."line_refund_toman" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_return" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suborder_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"status" "order_return_status" DEFAULT 'REQUESTED' NOT NULL,
	"reason_fa" text NOT NULL,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note_fa" text,
	"return_tracking_code" text,
	"shipped_back_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"received_condition" "returned_condition",
	"received_note_fa" text,
	"refund_amount_toman" bigint,
	"refund_id" uuid,
	"disputed" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_return_refund_non_negative" CHECK ("order_return"."refund_amount_toman" is null or "order_return"."refund_amount_toman" >= 0),
	CONSTRAINT "order_return_received_needs_condition" CHECK ("order_return"."received_at" is null or "order_return"."received_condition" is not null)
);
--> statement-breakpoint
CREATE TABLE "order_return_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"added_by_account_id" uuid NOT NULL,
	"file_id" uuid,
	"note_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_policy_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"window_days" integer NOT NULL,
	"body_fa" text NOT NULL,
	"published_by_account_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_policy_window_sane" CHECK ("return_policy_version"."window_days" >= 0 and "return_policy_version"."window_days" <= 365)
);
--> statement-breakpoint
CREATE TABLE "seller_ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"balanced" boolean NOT NULL,
	"bucket" "seller_ledger_bucket" NOT NULL,
	"kind" "seller_ledger_kind" NOT NULL,
	"amount_toman" bigint NOT NULL,
	"description_fa" text NOT NULL,
	"suborder_id" uuid,
	"return_id" uuid,
	"settlement_batch_id" uuid,
	"actor_account_id" uuid,
	"clears_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_ledger_amount_not_zero" CHECK ("seller_ledger_entry"."amount_toman" <> 0)
);
--> statement-breakpoint
CREATE TABLE "settlement_batch_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"amount_toman" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"status" "settlement_batch_status" DEFAULT 'DRAFT' NOT NULL,
	"cadence" "settlement_cadence" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"total_toman" bigint NOT NULL,
	"iban_snapshot" text NOT NULL,
	"holder_name_snapshot" text NOT NULL,
	"paid_by_account_id" uuid,
	"paid_at" timestamp with time zone,
	"bank_reference" text,
	"reconciled_by_account_id" uuid,
	"reconciled_at" timestamp with time zone,
	"failure_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_batch_total_positive" CHECK ("settlement_batch"."total_toman" > 0),
	CONSTRAINT "settlement_batch_period_ordered" CHECK ("settlement_batch"."period_end" > "settlement_batch"."period_start"),
	CONSTRAINT "settlement_batch_paid_needs_reference" CHECK ("settlement_batch"."status" not in ('PAID','RECONCILED') or ("settlement_batch"."bank_reference" is not null and "settlement_batch"."paid_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "seller_shipping_method" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"label_fa" text NOT NULL,
	"kind" "shipping_method_kind" NOT NULL,
	"coverage_kind" "shipping_coverage_kind" DEFAULT 'WHOLE_COUNTRY' NOT NULL,
	"province_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_kind" "shipping_pricing_kind" DEFAULT 'FIXED' NOT NULL,
	"base_fee_toman" bigint NOT NULL,
	"per_kg_toman" bigint,
	"included_grams" integer,
	"free_threshold_toman" bigint,
	"preparation_days" integer NOT NULL,
	"note_fa" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_method_money_non_negative" CHECK ("seller_shipping_method"."base_fee_toman" >= 0 and ("seller_shipping_method"."per_kg_toman" is null or "seller_shipping_method"."per_kg_toman" >= 0) and ("seller_shipping_method"."free_threshold_toman" is null or "seller_shipping_method"."free_threshold_toman" >= 0)),
	CONSTRAINT "shipping_method_days_sane" CHECK ("seller_shipping_method"."preparation_days" >= 0 and "seller_shipping_method"."preparation_days" <= 30),
	CONSTRAINT "shipping_method_weight_needs_rate" CHECK ("seller_shipping_method"."pricing_kind" <> 'WEIGHT_BASED' or ("seller_shipping_method"."per_kg_toman" is not null and "seller_shipping_method"."included_grams" is not null)),
	CONSTRAINT "shipping_method_provinces_needed" CHECK ("seller_shipping_method"."coverage_kind" <> 'PROVINCES' or jsonb_array_length("seller_shipping_method"."province_codes") > 0)
);
--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD COLUMN "settlement_cadence" "settlement_cadence";--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD COLUMN "requested_cadence" "settlement_cadence";--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD COLUMN "cadence_effective_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offer_sku" ADD COLUMN "weight_grams" integer;--> statement-breakpoint
ALTER TABLE "commerce_order_item" ADD COLUMN "return_policy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "commerce_order_item" ADD COLUMN "return_rule_code" text;--> statement-breakpoint
ALTER TABLE "commerce_order_item" ADD COLUMN "return_rule_reason_fa" text;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD COLUMN "shipping_method_id" uuid;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD COLUMN "shipping_method_label_fa" text;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD COLUMN "shipping_method_kind_code" text;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD COLUMN "preparation_days" integer;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD COLUMN "preparation_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD COLUMN "delivery_confirmed_by" text;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD COLUMN "delivery_evidence_note_fa" text;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD COLUMN "return_window_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "category_return_rule" ADD CONSTRAINT "category_return_rule_policy_version_id_return_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."return_policy_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_return_rule" ADD CONSTRAINT "category_return_rule_category_id_product_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_item" ADD CONSTRAINT "order_return_item_return_id_order_return_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_return"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_item" ADD CONSTRAINT "order_return_item_order_item_id_commerce_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."commerce_order_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return" ADD CONSTRAINT "order_return_suborder_id_commerce_suborder_id_fk" FOREIGN KEY ("suborder_id") REFERENCES "public"."commerce_suborder"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return" ADD CONSTRAINT "order_return_requested_by_account_id_account_id_fk" FOREIGN KEY ("requested_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return" ADD CONSTRAINT "order_return_decided_by_account_id_account_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_evidence" ADD CONSTRAINT "order_return_evidence_return_id_order_return_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_return"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_evidence" ADD CONSTRAINT "order_return_evidence_added_by_account_id_account_id_fk" FOREIGN KEY ("added_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_evidence" ADD CONSTRAINT "order_return_evidence_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_policy_version" ADD CONSTRAINT "return_policy_version_published_by_account_id_account_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_ledger_entry" ADD CONSTRAINT "seller_ledger_entry_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_ledger_entry" ADD CONSTRAINT "seller_ledger_entry_suborder_id_commerce_suborder_id_fk" FOREIGN KEY ("suborder_id") REFERENCES "public"."commerce_suborder"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_ledger_entry" ADD CONSTRAINT "seller_ledger_entry_return_id_order_return_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_return"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_ledger_entry" ADD CONSTRAINT "seller_ledger_entry_actor_account_id_account_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batch_line" ADD CONSTRAINT "settlement_batch_line_batch_id_settlement_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."settlement_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batch_line" ADD CONSTRAINT "settlement_batch_line_ledger_entry_id_seller_ledger_entry_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."seller_ledger_entry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batch" ADD CONSTRAINT "settlement_batch_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batch" ADD CONSTRAINT "settlement_batch_paid_by_account_id_account_id_fk" FOREIGN KEY ("paid_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batch" ADD CONSTRAINT "settlement_batch_reconciled_by_account_id_account_id_fk" FOREIGN KEY ("reconciled_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_shipping_method" ADD CONSTRAINT "seller_shipping_method_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_return_rule_key" ON "category_return_rule" USING btree ("policy_version_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_return_item_key" ON "order_return_item" USING btree ("return_id","order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_return_reference_key" ON "order_return" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "order_return_suborder_idx" ON "order_return" USING btree ("suborder_id","status");--> statement-breakpoint
CREATE INDEX "order_return_queue_idx" ON "order_return" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "order_return_evidence_idx" ON "order_return_evidence" USING btree ("return_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "return_policy_version_key" ON "return_policy_version" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "return_policy_live_key" ON "return_policy_version" USING btree ("superseded_at") WHERE "return_policy_version"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "seller_ledger_seller_idx" ON "seller_ledger_entry" USING btree ("seller_id","bucket","created_at");--> statement-breakpoint
CREATE INDEX "seller_ledger_group_idx" ON "seller_ledger_entry" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "seller_ledger_clears_idx" ON "seller_ledger_entry" USING btree ("bucket","clears_at");--> statement-breakpoint
CREATE INDEX "seller_ledger_suborder_idx" ON "seller_ledger_entry" USING btree ("suborder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_ledger_sale_key" ON "seller_ledger_entry" USING btree ("suborder_id","kind") WHERE "seller_ledger_entry"."kind" in ('SALE','COMMISSION');--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_batch_line_entry_key" ON "settlement_batch_line" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE INDEX "settlement_batch_line_batch_idx" ON "settlement_batch_line" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_batch_reference_key" ON "settlement_batch" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_batch_open_key" ON "settlement_batch" USING btree ("seller_id") WHERE "settlement_batch"."status" in ('DRAFT','READY','PAID');--> statement-breakpoint
CREATE INDEX "settlement_batch_seller_idx" ON "settlement_batch" USING btree ("seller_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_method_label_key" ON "seller_shipping_method" USING btree ("seller_id","label_fa") WHERE "seller_shipping_method"."is_active";--> statement-breakpoint
CREATE INDEX "shipping_method_seller_idx" ON "seller_shipping_method" USING btree ("seller_id","is_active");--> statement-breakpoint
ALTER TABLE "offer_sku" ADD CONSTRAINT "offer_sku_weight_positive" CHECK ("offer_sku"."weight_grams" is null or "offer_sku"."weight_grams" > 0);
