CREATE TYPE "public"."discount_kind" AS ENUM('SELLER_DISCOUNT', 'SELLER_CODE', 'PLATFORM_CODE', 'CATEGORY_CAMPAIGN', 'FREE_SHIPPING');--> statement-breakpoint
CREATE TYPE "public"."discount_status" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."follow_subject" AS ENUM('COMMERCE_SELLER', 'KENNEL');--> statement-breakpoint
CREATE TYPE "public"."loyalty_kind" AS ENUM('EARN', 'REDEEM', 'EXPIRE', 'ADJUST');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('PENDING', 'PUBLISHED', 'REJECTED', 'ANSWERED');--> statement-breakpoint
CREATE TYPE "public"."question_subject" AS ENUM('SELLER', 'PRODUCT');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('PUBLISHED', 'HIDDEN', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."review_subject" AS ENUM('ANIMAL_DEAL', 'COMMERCE_SUBORDER');--> statement-breakpoint
CREATE TYPE "public"."saved_subject" AS ENUM('ANIMAL_LISTING', 'COMMERCE_PRODUCT');--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'REVIEW';--> statement-breakpoint
ALTER TYPE "public"."report_target_kind" ADD VALUE 'QUESTION';--> statement-breakpoint
CREATE TABLE "account_preference" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"recommendations_off" boolean DEFAULT false NOT NULL,
	"history_off" boolean DEFAULT false NOT NULL,
	"price_alerts_off" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_follow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"subject" "follow_subject" NOT NULL,
	"seller_id" uuid,
	"kennel_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_follow_one_subject" CHECK (("account_follow"."seller_id" is not null)::int + ("account_follow"."kennel_id" is not null)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "commerce_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" "question_subject" NOT NULL,
	"seller_id" uuid,
	"product_id" uuid,
	"asked_by_account_id" uuid NOT NULL,
	"body_fa" text NOT NULL,
	"status" "question_status" DEFAULT 'PENDING' NOT NULL,
	"decision_reason_fa" text,
	"answer_fa" text,
	"answered_by_account_id" uuid,
	"answered_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_one_subject" CHECK (("commerce_question"."seller_id" is not null)::int + ("commerce_question"."product_id" is not null)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "recent_view" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"subject" "saved_subject" NOT NULL,
	"listing_id" uuid,
	"product_id" uuid,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_view_one_subject" CHECK (("recent_view"."listing_id" is not null)::int + ("recent_view"."product_id" is not null)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" "review_subject" NOT NULL,
	"inquiry_id" uuid,
	"suborder_id" uuid,
	"author_account_id" uuid NOT NULL,
	"seller_id" uuid,
	"seller_account_id" uuid,
	"product_id" uuid,
	"listing_id" uuid,
	"score_one" smallint NOT NULL,
	"score_two" smallint NOT NULL,
	"score_three" smallint NOT NULL,
	"body_fa" text,
	"status" "review_status" DEFAULT 'PUBLISHED' NOT NULL,
	"hidden_reason_fa" text,
	"hidden_by_account_id" uuid,
	"reply_fa" text,
	"replied_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_scores_in_range" CHECK ("review"."score_one" between 1 and 5 and "review"."score_two" between 1 and 5 and "review"."score_three" between 1 and 5),
	CONSTRAINT "review_one_subject" CHECK (("review"."inquiry_id" is not null)::int + ("review"."suborder_id" is not null)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "saved_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"subject" "saved_subject" NOT NULL,
	"listing_id" uuid,
	"product_id" uuid,
	"saved_price_toman" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_item_one_subject" CHECK (("saved_item"."listing_id" is not null)::int + ("saved_item"."product_id" is not null)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "discount_redemption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"suborder_id" uuid,
	"amount_toman" bigint NOT NULL,
	"borne_by_platform" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_redemption_amount_positive" CHECK ("discount_redemption"."amount_toman" > 0)
);
--> statement-breakpoint
CREATE TABLE "discount_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"label_fa" text NOT NULL,
	"code" text,
	"seller_id" uuid,
	"category_id" uuid,
	"product_id" uuid,
	"percent_bp" integer,
	"amount_toman" bigint,
	"max_discount_toman" bigint,
	"min_basket_toman" bigint,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"total_uses" integer,
	"uses_per_account" integer,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" "discount_status" DEFAULT 'DRAFT' NOT NULL,
	"note_fa" text,
	"created_by_account_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_rule_amount_sane" CHECK (("discount_rule"."percent_bp" is null or ("discount_rule"."percent_bp" > 0 and "discount_rule"."percent_bp" <= 10000)) and ("discount_rule"."amount_toman" is null or "discount_rule"."amount_toman" > 0)),
	CONSTRAINT "discount_rule_has_an_effect" CHECK ("discount_rule"."kind" = 'FREE_SHIPPING' or "discount_rule"."percent_bp" is not null or "discount_rule"."amount_toman" is not null),
	CONSTRAINT "discount_rule_code_matches_kind" CHECK (("discount_rule"."code" is not null) = ("discount_rule"."kind" in ('SELLER_CODE','PLATFORM_CODE'))),
	CONSTRAINT "discount_rule_owner_matches_kind" CHECK (("discount_rule"."seller_id" is not null) = ("discount_rule"."kind" in ('SELLER_DISCOUNT','SELLER_CODE'))
          or "discount_rule"."kind" = 'FREE_SHIPPING'),
	CONSTRAINT "discount_rule_window_ordered" CHECK ("discount_rule"."ends_at" is null or "discount_rule"."starts_at" is null or "discount_rule"."ends_at" > "discount_rule"."starts_at"),
	CONSTRAINT "discount_rule_limits_positive" CHECK (("discount_rule"."total_uses" is null or "discount_rule"."total_uses" > 0) and ("discount_rule"."uses_per_account" is null or "discount_rule"."uses_per_account" > 0))
);
--> statement-breakpoint
CREATE TABLE "loyalty_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "loyalty_kind" NOT NULL,
	"points" integer NOT NULL,
	"description_fa" text NOT NULL,
	"order_id" uuid,
	"expires_at" timestamp with time zone,
	"expired_entry_id" uuid,
	"actor_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_points_not_zero" CHECK ("loyalty_entry"."points" <> 0),
	CONSTRAINT "loyalty_sign_matches_kind" CHECK (("loyalty_entry"."kind" = 'EARN' and "loyalty_entry"."points" > 0)
          or ("loyalty_entry"."kind" in ('REDEEM','EXPIRE') and "loyalty_entry"."points" < 0)
          or "loyalty_entry"."kind" = 'ADJUST')
);
--> statement-breakpoint
CREATE TABLE "price_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"offer_sku_id" uuid NOT NULL,
	"price_toman" bigint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sku_price_point" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_sku_id" uuid NOT NULL,
	"price_toman" bigint NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sku_price_point_positive" CHECK ("sku_price_point"."price_toman" > 0)
);
--> statement-breakpoint
CREATE TABLE "discount_stacking_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"rules" jsonb NOT NULL,
	"body_fa" text NOT NULL,
	"published_by_account_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "review_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD COLUMN "question_id" uuid;--> statement-breakpoint
ALTER TABLE "account_preference" ADD CONSTRAINT "account_preference_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_follow" ADD CONSTRAINT "account_follow_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_follow" ADD CONSTRAINT "account_follow_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_follow" ADD CONSTRAINT "account_follow_kennel_id_kennel_id_fk" FOREIGN KEY ("kennel_id") REFERENCES "public"."kennel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_question" ADD CONSTRAINT "commerce_question_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_question" ADD CONSTRAINT "commerce_question_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_question" ADD CONSTRAINT "commerce_question_asked_by_account_id_account_id_fk" FOREIGN KEY ("asked_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_question" ADD CONSTRAINT "commerce_question_answered_by_account_id_account_id_fk" FOREIGN KEY ("answered_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_view" ADD CONSTRAINT "recent_view_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_view" ADD CONSTRAINT "recent_view_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_view" ADD CONSTRAINT "recent_view_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_inquiry_id_listing_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."listing_inquiry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_suborder_id_commerce_suborder_id_fk" FOREIGN KEY ("suborder_id") REFERENCES "public"."commerce_suborder"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_author_account_id_account_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_seller_account_id_account_id_fk" FOREIGN KEY ("seller_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_hidden_by_account_id_account_id_fk" FOREIGN KEY ("hidden_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemption" ADD CONSTRAINT "discount_redemption_rule_id_discount_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."discount_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemption" ADD CONSTRAINT "discount_redemption_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemption" ADD CONSTRAINT "discount_redemption_order_id_commerce_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commerce_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemption" ADD CONSTRAINT "discount_redemption_suborder_id_commerce_suborder_id_fk" FOREIGN KEY ("suborder_id") REFERENCES "public"."commerce_suborder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_seller_id_commerce_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."commerce_seller"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_category_id_product_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_product_id_commerce_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entry" ADD CONSTRAINT "loyalty_entry_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entry" ADD CONSTRAINT "loyalty_entry_order_id_commerce_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commerce_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entry" ADD CONSTRAINT "loyalty_entry_actor_account_id_account_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alert" ADD CONSTRAINT "price_alert_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alert" ADD CONSTRAINT "price_alert_offer_sku_id_offer_sku_id_fk" FOREIGN KEY ("offer_sku_id") REFERENCES "public"."offer_sku"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_price_point" ADD CONSTRAINT "sku_price_point_offer_sku_id_offer_sku_id_fk" FOREIGN KEY ("offer_sku_id") REFERENCES "public"."offer_sku"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_stacking_policy" ADD CONSTRAINT "discount_stacking_policy_published_by_account_id_account_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_follow_seller_key" ON "account_follow" USING btree ("account_id","seller_id") WHERE "account_follow"."seller_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "account_follow_kennel_key" ON "account_follow" USING btree ("account_id","kennel_id") WHERE "account_follow"."kennel_id" is not null;--> statement-breakpoint
CREATE INDEX "account_follow_subject_idx" ON "account_follow" USING btree ("subject","seller_id");--> statement-breakpoint
CREATE INDEX "question_product_idx" ON "commerce_question" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "question_seller_idx" ON "commerce_question" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "question_queue_idx" ON "commerce_question" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recent_view_listing_key" ON "recent_view" USING btree ("account_id","listing_id") WHERE "recent_view"."listing_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "recent_view_product_key" ON "recent_view" USING btree ("account_id","product_id") WHERE "recent_view"."product_id" is not null;--> statement-breakpoint
CREATE INDEX "recent_view_account_idx" ON "recent_view" USING btree ("account_id","viewed_at");--> statement-breakpoint
CREATE INDEX "recent_view_retention_idx" ON "recent_view" USING btree ("viewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_deal_key" ON "review" USING btree ("inquiry_id") WHERE "review"."inquiry_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "review_suborder_key" ON "review" USING btree ("suborder_id") WHERE "review"."suborder_id" is not null;--> statement-breakpoint
CREATE INDEX "review_product_idx" ON "review" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "review_seller_idx" ON "review" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "review_author_idx" ON "review" USING btree ("author_account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_item_listing_key" ON "saved_item" USING btree ("account_id","listing_id") WHERE "saved_item"."listing_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_item_product_key" ON "saved_item" USING btree ("account_id","product_id") WHERE "saved_item"."product_id" is not null;--> statement-breakpoint
CREATE INDEX "saved_item_account_idx" ON "saved_item" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_redemption_once_key" ON "discount_redemption" USING btree ("rule_id","order_id");--> statement-breakpoint
CREATE INDEX "discount_redemption_rule_idx" ON "discount_redemption" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "discount_redemption_account_idx" ON "discount_redemption" USING btree ("rule_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_rule_code_key" ON "discount_rule" USING btree ("code") WHERE "discount_rule"."code" is not null and "discount_rule"."status" in ('DRAFT','ACTIVE','PAUSED');--> statement-breakpoint
CREATE INDEX "discount_rule_kind_idx" ON "discount_rule" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "discount_rule_seller_idx" ON "discount_rule" USING btree ("seller_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_earn_once_key" ON "loyalty_entry" USING btree ("order_id","kind") WHERE "loyalty_entry"."order_id" is not null and "loyalty_entry"."kind" in ('EARN','REDEEM');--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_expiry_once_key" ON "loyalty_entry" USING btree ("expired_entry_id") WHERE "loyalty_entry"."expired_entry_id" is not null;--> statement-breakpoint
CREATE INDEX "loyalty_account_idx" ON "loyalty_entry" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_expiry_idx" ON "loyalty_entry" USING btree ("kind","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "price_alert_once_key" ON "price_alert" USING btree ("account_id","offer_sku_id","price_toman");--> statement-breakpoint
CREATE INDEX "sku_price_point_idx" ON "sku_price_point" USING btree ("offer_sku_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stacking_policy_version_key" ON "discount_stacking_policy" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "stacking_policy_live_key" ON "discount_stacking_policy" USING btree ("superseded_at") WHERE "discount_stacking_policy"."superseded_at" is null;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_question_id_commerce_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."commerce_question"("id") ON DELETE restrict ON UPDATE no action;