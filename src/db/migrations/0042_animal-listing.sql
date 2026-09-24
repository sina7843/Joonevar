CREATE TYPE "public"."animal_listing_status" AS ENUM('DRAFT', 'PUBLISHED', 'PAUSED', 'RESERVED', 'SOLD', 'EXPIRED', 'SUSPENDED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."listing_delivery_method" AS ENUM('IN_PERSON', 'SELLER_LOCATION', 'VET_CLINIC');--> statement-breakpoint
CREATE TYPE "public"."listing_disclosure" AS ENUM('YES', 'NO', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."listing_media_kind" AS ENUM('IMAGE', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."listing_price_mode" AS ENUM('EXACT', 'NEGOTIABLE');--> statement-breakpoint
CREATE TYPE "public"."listing_seller_kind" AS ENUM('OWNER', 'KENNEL');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'ANIMAL_LISTING_IMAGE';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'ANIMAL_LISTING_VIDEO';--> statement-breakpoint
CREATE TABLE "animal_listing_delivery" (
	"listing_id" uuid NOT NULL,
	"method" "listing_delivery_method" NOT NULL,
	CONSTRAINT "animal_listing_delivery_listing_id_method_pk" PRIMARY KEY("listing_id","method")
);
--> statement-breakpoint
CREATE TABLE "animal_listing_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "listing_media_kind" NOT NULL,
	"alt_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animal_listing_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason_fa" text,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animal_listing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"seller_account_id" uuid NOT NULL,
	"seller_kind" "listing_seller_kind" NOT NULL,
	"kennel_id" uuid,
	"status" "animal_listing_status" DEFAULT 'DRAFT' NOT NULL,
	"price_mode" "listing_price_mode",
	"price_toman" bigint,
	"description_fa" text,
	"reason_for_sale_fa" text,
	"province_code" text,
	"city_id" uuid,
	"vaccination_status" "listing_disclosure",
	"neuter_status" "listing_disclosure",
	"health_note_fa" text,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"duration_days" integer,
	"duration_setting_version" integer,
	"status_reason_fa" text,
	"status_changed_at" timestamp with time zone,
	"status_changed_by_account_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "animal_listing_exact_price" CHECK ("animal_listing"."price_mode" is distinct from 'EXACT' or "animal_listing"."price_toman" > 0),
	CONSTRAINT "animal_listing_kennel_kind" CHECK ("animal_listing"."seller_kind" is distinct from 'KENNEL' or "animal_listing"."kennel_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "animal_listing_delivery" ADD CONSTRAINT "animal_listing_delivery_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing_media" ADD CONSTRAINT "animal_listing_media_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing_media" ADD CONSTRAINT "animal_listing_media_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing_revision" ADD CONSTRAINT "animal_listing_revision_listing_id_animal_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animal_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing_revision" ADD CONSTRAINT "animal_listing_revision_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing" ADD CONSTRAINT "animal_listing_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing" ADD CONSTRAINT "animal_listing_seller_account_id_account_id_fk" FOREIGN KEY ("seller_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing" ADD CONSTRAINT "animal_listing_kennel_id_kennel_id_fk" FOREIGN KEY ("kennel_id") REFERENCES "public"."kennel"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing" ADD CONSTRAINT "animal_listing_province_code_province_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."province"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing" ADD CONSTRAINT "animal_listing_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_listing" ADD CONSTRAINT "animal_listing_status_changed_by_account_id_account_id_fk" FOREIGN KEY ("status_changed_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animal_listing_media_file_key" ON "animal_listing_media" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "animal_listing_media_listing_idx" ON "animal_listing_media" USING btree ("listing_id","kind","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "animal_listing_single_video_key" ON "animal_listing_media" USING btree ("listing_id") WHERE "animal_listing_media"."kind" = 'VIDEO';--> statement-breakpoint
CREATE UNIQUE INDEX "animal_listing_revision_number_key" ON "animal_listing_revision" USING btree ("listing_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "animal_listing_live_key" ON "animal_listing" USING btree ("animal_id") WHERE "animal_listing"."status" in ('DRAFT','PUBLISHED','PAUSED','RESERVED','SUSPENDED');--> statement-breakpoint
CREATE INDEX "animal_listing_seller_idx" ON "animal_listing" USING btree ("seller_account_id","status");--> statement-breakpoint
CREATE INDEX "animal_listing_public_idx" ON "animal_listing" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "animal_listing_expiry_idx" ON "animal_listing" USING btree ("status","expires_at");