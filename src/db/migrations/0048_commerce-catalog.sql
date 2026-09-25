CREATE TYPE "public"."category_sale_policy" AS ENUM('ALLOWED', 'BLOCKED_PHARMACEUTICAL');--> statement-breakpoint
CREATE TYPE "public"."inventory_move_kind" AS ENUM('RECEIVE', 'ADJUST', 'RESERVE', 'RELEASE', 'SELL', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."offer_condition" AS ENUM('NEW', 'USED', 'REFURBISHED');--> statement-breakpoint
CREATE TYPE "public"."commerce_offer_status" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('SHARED', 'SELLER_EXCLUSIVE');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'MERGED');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'PRODUCT_IMAGE';--> statement-breakpoint
CREATE TABLE "commerce_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "product_kind" DEFAULT 'SELLER_EXCLUSIVE' NOT NULL,
	"owner_seller_id" uuid,
	"category_id" uuid NOT NULL,
	"brand_fa" text,
	"name_fa" text NOT NULL,
	"slug" text NOT NULL,
	"barcode" text,
	"description_fa" text,
	"specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "product_status" DEFAULT 'DRAFT' NOT NULL,
	"status_reason_fa" text,
	"merged_into_product_id" uuid,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_product_owner_rule" CHECK (("commerce_product"."kind" = 'SHARED') = ("commerce_product"."owner_seller_id" is null)),
	CONSTRAINT "commerce_product_merged_rule" CHECK (("commerce_product"."status" = 'MERGED') = ("commerce_product"."merged_into_product_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "inventory_move" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_sku_id" uuid NOT NULL,
	"kind" "inventory_move_kind" NOT NULL,
	"quantity" integer NOT NULL,
	"reason_fa" text,
	"actor_account_id" uuid,
	"ref_type" text,
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_move_quantity_not_zero" CHECK ("inventory_move"."quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "offer_sku" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"variant_id" uuid,
	"sku" text NOT NULL,
	"price_toman" bigint NOT NULL,
	"stock_on_hand" integer DEFAULT 0 NOT NULL,
	"stock_reserved" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_sku_price_positive" CHECK ("offer_sku"."price_toman" > 0),
	CONSTRAINT "offer_sku_stock_non_negative" CHECK ("offer_sku"."stock_on_hand" >= 0 and "offer_sku"."stock_reserved" >= 0),
	CONSTRAINT "offer_sku_reserved_within_stock" CHECK ("offer_sku"."stock_reserved" <= "offer_sku"."stock_on_hand")
);
--> statement-breakpoint
CREATE TABLE "product_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_fa" text NOT NULL,
	"parent_id" uuid,
	"attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sale_policy" "category_sale_policy" DEFAULT 'ALLOWED' NOT NULL,
	"policy_note_fa" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"alt_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"added_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_species" (
	"product_id" uuid NOT NULL,
	"species_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variant_key" text NOT NULL,
	"label_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"condition" "offer_condition" DEFAULT 'NEW' NOT NULL,
	"ships_to_whole_country" boolean DEFAULT false NOT NULL,
	"shipping_note_fa" text,
	"status" "commerce_offer_status" DEFAULT 'DRAFT' NOT NULL,
	"status_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_sku_id" uuid NOT NULL,
	"holder_account_id" uuid NOT NULL,
	"hold_ref" text NOT NULL,
	"quantity" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_reservation_quantity_positive" CHECK ("stock_reservation"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "commerce_product" ADD CONSTRAINT "commerce_product_owner_seller_id_commerce_seller_id_fk" FOREIGN KEY ("owner_seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_product" ADD CONSTRAINT "commerce_product_category_id_product_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_product" ADD CONSTRAINT "commerce_product_merged_into_product_id_commerce_product_id_fk" FOREIGN KEY ("merged_into_product_id") REFERENCES "public"."commerce_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_product" ADD CONSTRAINT "commerce_product_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_product" ADD CONSTRAINT "commerce_product_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_move" ADD CONSTRAINT "inventory_move_offer_sku_id_offer_sku_id_fk" FOREIGN KEY ("offer_sku_id") REFERENCES "public"."offer_sku"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_move" ADD CONSTRAINT "inventory_move_actor_account_id_account_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_sku" ADD CONSTRAINT "offer_sku_offer_id_seller_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."seller_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_sku" ADD CONSTRAINT "offer_sku_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_parent_id_product_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_added_by_account_id_account_id_fk" FOREIGN KEY ("added_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_species" ADD CONSTRAINT "product_species_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_species" ADD CONSTRAINT "product_species_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_offer" ADD CONSTRAINT "seller_offer_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_offer" ADD CONSTRAINT "seller_offer_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_offer_sku_id_offer_sku_id_fk" FOREIGN KEY ("offer_sku_id") REFERENCES "public"."offer_sku"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_holder_account_id_account_id_fk" FOREIGN KEY ("holder_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_product_slug_key" ON "commerce_product" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "commerce_product_category_idx" ON "commerce_product" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "commerce_product_owner_idx" ON "commerce_product" USING btree ("owner_seller_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_product_barcode_key" ON "commerce_product" USING btree ("barcode") WHERE "commerce_product"."barcode" is not null and "commerce_product"."status" not in ('MERGED','REJECTED');--> statement-breakpoint
CREATE INDEX "inventory_move_sku_idx" ON "inventory_move" USING btree ("offer_sku_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_sku_variant_key" ON "offer_sku" USING btree ("offer_id","variant_id");--> statement-breakpoint
CREATE INDEX "offer_sku_offer_idx" ON "offer_sku" USING btree ("offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_category_code_key" ON "product_category" USING btree ("code");--> statement-breakpoint
CREATE INDEX "product_category_parent_idx" ON "product_category" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "product_media_product_idx" ON "product_media" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_species_key" ON "product_species" USING btree ("product_id","species_code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variant_key" ON "product_variant" USING btree ("product_id","variant_key");--> statement-breakpoint
CREATE INDEX "product_variant_product_idx" ON "product_variant" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_offer_key" ON "seller_offer" USING btree ("seller_id","product_id");--> statement-breakpoint
CREATE INDEX "seller_offer_product_idx" ON "seller_offer" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "seller_offer_seller_idx" ON "seller_offer" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "stock_reservation_sku_idx" ON "stock_reservation" USING btree ("offer_sku_id","status");--> statement-breakpoint
CREATE INDEX "stock_reservation_expiry_idx" ON "stock_reservation" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_reservation_hold_key" ON "stock_reservation" USING btree ("offer_sku_id","hold_ref") WHERE "stock_reservation"."status" = 'ACTIVE';