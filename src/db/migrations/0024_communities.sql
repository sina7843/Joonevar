CREATE TYPE "public"."community_event_status" AS ENUM('DRAFT', 'PUBLISHED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."community_kind" AS ENUM('ASSOCIATION', 'CLUB');--> statement-breakpoint
CREATE TYPE "public"."community_manager_status" AS ENUM('INVITED', 'ACCEPTED', 'DECLINED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."community_scope" AS ENUM('NATIONAL', 'PROVINCIAL', 'CITY', 'BREED', 'SPORT', 'OTHER');--> statement-breakpoint
CREATE TABLE "community" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "community_kind" NOT NULL,
	"owner_account_id" uuid,
	"display_name_fa" text NOT NULL,
	"about_fa" text,
	"scope" "community_scope" DEFAULT 'OTHER' NOT NULL,
	"province_code" text,
	"city_id" uuid,
	"registration_number" text,
	"licence_status" "licence_status" DEFAULT 'NONE' NOT NULL,
	"licence_verified_at" timestamp with time zone,
	"membership_info_fa" text,
	"membership_url" text,
	"contact_phone" text,
	"website_url" text,
	"can_publish_posts" boolean DEFAULT false NOT NULL,
	"public_slug" text,
	"public_status" "vet_public_status" DEFAULT 'DRAFT' NOT NULL,
	"public_published_at" timestamp with time zone,
	"hidden_by_review" boolean DEFAULT false NOT NULL,
	"source_fa" text,
	"claimed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_breed" (
	"community_id" uuid NOT NULL,
	"breed_id" uuid NOT NULL,
	CONSTRAINT "community_breed_community_id_breed_id_pk" PRIMARY KEY("community_id","breed_id")
);
--> statement-breakpoint
CREATE TABLE "community_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"title_fa" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"city_id" uuid,
	"place_fa" text,
	"description_fa" text,
	"registration_url" text,
	"status" "community_event_status" DEFAULT 'DRAFT' NOT NULL,
	"cancel_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_manager" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role_fa" text,
	"status" "community_manager_status" DEFAULT 'INVITED' NOT NULL,
	"invited_by_account_id" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_species" (
	"community_id" uuid NOT NULL,
	"species_code" text NOT NULL,
	CONSTRAINT "community_species_community_id_species_code_pk" PRIMARY KEY("community_id","species_code")
);
--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "community_id" uuid;--> statement-breakpoint
ALTER TABLE "community" ADD CONSTRAINT "community_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community" ADD CONSTRAINT "community_province_code_province_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."province"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community" ADD CONSTRAINT "community_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_breed" ADD CONSTRAINT "community_breed_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_breed" ADD CONSTRAINT "community_breed_breed_id_reference_breed_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."reference_breed"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_event" ADD CONSTRAINT "community_event_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_event" ADD CONSTRAINT "community_event_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_manager" ADD CONSTRAINT "community_manager_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_manager" ADD CONSTRAINT "community_manager_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_manager" ADD CONSTRAINT "community_manager_invited_by_account_id_account_id_fk" FOREIGN KEY ("invited_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_species" ADD CONSTRAINT "community_species_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_species" ADD CONSTRAINT "community_species_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_public_slug_key" ON "community" USING btree ("public_slug");--> statement-breakpoint
CREATE INDEX "community_kind_status_idx" ON "community" USING btree ("kind","public_status");--> statement-breakpoint
CREATE INDEX "community_owner_idx" ON "community" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "community_event_idx" ON "community_event" USING btree ("community_id","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "community_manager_unique_key" ON "community_manager" USING btree ("community_id","account_id");--> statement-breakpoint
CREATE INDEX "community_manager_account_idx" ON "community_manager" USING btree ("account_id","status");--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;