CREATE TYPE "public"."cart_status" AS ENUM('ACTIVE', 'CHECKED_OUT', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."commerce_order_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."commerce_suborder_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'ACCEPTED_BY_SELLER', 'PREPARING', 'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'CANCELLED', 'REFUNDED', 'DISPUTED');--> statement-breakpoint
ALTER TYPE "public"."payment_service" ADD VALUE 'COMMERCE_ORDER';--> statement-breakpoint
CREATE TABLE "cart_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"offer_sku_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_item_quantity_positive" CHECK ("cart_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "commerce_order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suborder_id" uuid NOT NULL,
	"offer_sku_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"reservation_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price_toman" bigint NOT NULL,
	"discount_toman" bigint NOT NULL,
	"line_total_toman" bigint NOT NULL,
	"product_name_fa" text NOT NULL,
	"brand_fa" text,
	"variant_label_fa" text,
	"sku_code" text NOT NULL,
	"condition_code" text NOT NULL,
	"seller_name_fa" text NOT NULL,
	"image_file_id" uuid,
	"returned_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_order_item_quantity_positive" CHECK ("commerce_order_item"."quantity" > 0),
	CONSTRAINT "commerce_order_item_returned_within_quantity" CHECK ("commerce_order_item"."returned_quantity" >= 0 and "commerce_order_item"."returned_quantity" <= "commerce_order_item"."quantity"),
	CONSTRAINT "commerce_order_item_line_adds_up" CHECK ("commerce_order_item"."line_total_toman" = "commerce_order_item"."unit_price_toman" * "commerce_order_item"."quantity" - "commerce_order_item"."discount_toman")
);
--> statement-breakpoint
CREATE TABLE "commerce_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_account_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"status" "commerce_order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_batch_id" uuid,
	"items_total_toman" bigint NOT NULL,
	"discount_total_toman" bigint NOT NULL,
	"shipping_total_toman" bigint NOT NULL,
	"grand_total_toman" bigint NOT NULL,
	"recipient_name_fa" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"province_fa" text,
	"city_fa" text,
	"address_fa" text NOT NULL,
	"postal_code" text,
	"note_fa" text,
	"holds_expire_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_order_totals_non_negative" CHECK ("commerce_order"."items_total_toman" >= 0 and "commerce_order"."discount_total_toman" >= 0 and "commerce_order"."shipping_total_toman" >= 0 and "commerce_order"."grand_total_toman" > 0),
	CONSTRAINT "commerce_order_total_adds_up" CHECK ("commerce_order"."grand_total_toman" = "commerce_order"."items_total_toman" - "commerce_order"."discount_total_toman" + "commerce_order"."shipping_total_toman")
);
--> statement-breakpoint
CREATE TABLE "commerce_suborder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"status" "commerce_suborder_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"items_total_toman" bigint NOT NULL,
	"discount_toman" bigint NOT NULL,
	"shipping_toman" bigint NOT NULL,
	"buyer_total_toman" bigint NOT NULL,
	"subscription_id" uuid,
	"commission_percent_bp" integer NOT NULL,
	"commission_toman" bigint NOT NULL,
	"payout_toman" bigint NOT NULL,
	"shipping_waived" boolean DEFAULT false NOT NULL,
	"acceptance_due_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"tracking_code" text,
	"status_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_suborder_money_non_negative" CHECK ("commerce_suborder"."items_total_toman" >= 0 and "commerce_suborder"."discount_toman" >= 0 and "commerce_suborder"."shipping_toman" >= 0 and "commerce_suborder"."buyer_total_toman" > 0 and "commerce_suborder"."commission_toman" >= 0 and "commerce_suborder"."payout_toman" >= 0),
	CONSTRAINT "commerce_suborder_total_adds_up" CHECK ("commerce_suborder"."buyer_total_toman" = "commerce_suborder"."items_total_toman" - "commerce_suborder"."discount_toman" + "commerce_suborder"."shipping_toman"),
	CONSTRAINT "commerce_suborder_shares_add_up" CHECK ("commerce_suborder"."commission_toman" + "commerce_suborder"."payout_toman" = "commerce_suborder"."buyer_total_toman"),
	CONSTRAINT "commerce_suborder_percent_range" CHECK ("commerce_suborder"."commission_percent_bp" >= 0 and "commerce_suborder"."commission_percent_bp" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "shopping_cart" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "cart_status" DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_suborder_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suborder_id" uuid NOT NULL,
	"from_status" "commerce_suborder_status",
	"to_status" "commerce_suborder_status" NOT NULL,
	"actor_account_id" uuid,
	"reason_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "deposit_refund_one_key";--> statement-breakpoint
ALTER TABLE "deposit_refund" ALTER COLUMN "inquiry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deposit_refund" ADD COLUMN "suborder_id" uuid;--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD COLUMN "shipping_fee_toman" bigint;--> statement-breakpoint
ALTER TABLE "commerce_seller" ADD COLUMN "free_shipping_threshold_toman" bigint;--> statement-breakpoint
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_cart_id_shopping_cart_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."shopping_cart"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_offer_sku_id_offer_sku_id_fk" FOREIGN KEY ("offer_sku_id") REFERENCES "public"."offer_sku"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_item" ADD CONSTRAINT "commerce_order_item_suborder_id_commerce_suborder_id_fk" FOREIGN KEY ("suborder_id") REFERENCES "public"."commerce_suborder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_item" ADD CONSTRAINT "commerce_order_item_offer_sku_id_offer_sku_id_fk" FOREIGN KEY ("offer_sku_id") REFERENCES "public"."offer_sku"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_item" ADD CONSTRAINT "commerce_order_item_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_item" ADD CONSTRAINT "commerce_order_item_reservation_id_stock_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stock_reservation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_item" ADD CONSTRAINT "commerce_order_item_image_file_id_stored_file_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order" ADD CONSTRAINT "commerce_order_buyer_account_id_account_id_fk" FOREIGN KEY ("buyer_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order" ADD CONSTRAINT "commerce_order_payment_batch_id_payment_batch_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."payment_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD CONSTRAINT "commerce_suborder_order_id_commerce_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commerce_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD CONSTRAINT "commerce_suborder_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_suborder" ADD CONSTRAINT "commerce_suborder_subscription_id_seller_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."seller_subscription"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_cart" ADD CONSTRAINT "shopping_cart_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_suborder_event" ADD CONSTRAINT "commerce_suborder_event_suborder_id_commerce_suborder_id_fk" FOREIGN KEY ("suborder_id") REFERENCES "public"."commerce_suborder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_suborder_event" ADD CONSTRAINT "commerce_suborder_event_actor_account_id_account_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_item_line_key" ON "cart_item" USING btree ("cart_id","offer_sku_id");--> statement-breakpoint
CREATE INDEX "cart_item_cart_idx" ON "cart_item" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "commerce_order_item_suborder_idx" ON "commerce_order_item" USING btree ("suborder_id");--> statement-breakpoint
CREATE INDEX "commerce_order_item_sku_idx" ON "commerce_order_item" USING btree ("offer_sku_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_order_reference_key" ON "commerce_order" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_order_batch_key" ON "commerce_order" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE INDEX "commerce_order_buyer_idx" ON "commerce_order" USING btree ("buyer_account_id","created_at");--> statement-breakpoint
CREATE INDEX "commerce_order_status_idx" ON "commerce_order" USING btree ("status","holds_expire_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_suborder_reference_key" ON "commerce_suborder" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_suborder_seller_key" ON "commerce_suborder" USING btree ("order_id","seller_id");--> statement-breakpoint
CREATE INDEX "commerce_suborder_seller_idx" ON "commerce_suborder" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "commerce_suborder_due_idx" ON "commerce_suborder" USING btree ("status","acceptance_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_cart_open_key" ON "shopping_cart" USING btree ("account_id") WHERE "shopping_cart"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "shopping_cart_account_idx" ON "shopping_cart" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "commerce_suborder_event_idx" ON "commerce_suborder_event" USING btree ("suborder_id","created_at");--> statement-breakpoint
ALTER TABLE "deposit_refund" ADD CONSTRAINT "deposit_refund_suborder_id_commerce_suborder_id_fk" FOREIGN KEY ("suborder_id") REFERENCES "public"."commerce_suborder"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_refund_suborder_key" ON "deposit_refund" USING btree ("suborder_id") WHERE "deposit_refund"."suborder_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_refund_one_key" ON "deposit_refund" USING btree ("inquiry_id") WHERE "deposit_refund"."inquiry_id" is not null;--> statement-breakpoint
ALTER TABLE "deposit_refund" ADD CONSTRAINT "deposit_refund_one_subject" CHECK (("deposit_refund"."inquiry_id" is not null)::int + ("deposit_refund"."suborder_id" is not null)::int = 1);