CREATE TYPE "public"."content_kind" AS ENUM('ARTICLE', 'NEWS', 'ANNOUNCEMENT', 'CLUB_POST');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED', 'DELETED');--> statement-breakpoint
ALTER TYPE "public"."account_role_name" ADD VALUE 'AUTHOR';--> statement-breakpoint
ALTER TYPE "public"."account_role_name" ADD VALUE 'CONTENT_ADMIN';--> statement-breakpoint
ALTER TYPE "public"."actor_context" ADD VALUE 'AUTHOR';--> statement-breakpoint
ALTER TYPE "public"."actor_context" ADD VALUE 'CONTENT_ADMIN';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'CONTENT_IMAGE';--> statement-breakpoint
CREATE TABLE "content_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "content_kind" NOT NULL,
	"slug" text NOT NULL,
	"name_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "content_kind" NOT NULL,
	"slug" text NOT NULL,
	"status" "content_status" DEFAULT 'DRAFT' NOT NULL,
	"author_account_id" uuid NOT NULL,
	"category_id" uuid,
	"species_code" text,
	"breed_id" uuid,
	"title_fa" text NOT NULL,
	"summary_fa" text DEFAULT '' NOT NULL,
	"body_fa" text DEFAULT '' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"image_file_id" uuid,
	"image_alt_fa" text,
	"seo_title" text,
	"seo_description" text,
	"reviewed_on" date,
	"publish_at" timestamp with time zone,
	"first_published_at" timestamp with time zone,
	"moderation_note" text,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_slug_redirect" (
	"kind" "content_kind" NOT NULL,
	"slug" text NOT NULL,
	"content_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_slug_redirect_kind_slug_pk" PRIMARY KEY("kind","slug")
);
--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_author_account_id_account_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_category_id_content_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."content_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_breed_id_reference_breed_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."reference_breed"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_image_file_id_stored_file_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_content_id_content_item_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_slug_redirect" ADD CONSTRAINT "content_slug_redirect_content_id_content_item_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_category_kind_slug_key" ON "content_category" USING btree ("kind","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_category_kind_name_key" ON "content_category" USING btree ("kind","name_fa");--> statement-breakpoint
CREATE UNIQUE INDEX "content_item_kind_slug_key" ON "content_item" USING btree ("kind","slug");--> statement-breakpoint
CREATE INDEX "content_item_public_idx" ON "content_item" USING btree ("kind","status","publish_at");--> statement-breakpoint
CREATE INDEX "content_item_author_idx" ON "content_item" USING btree ("author_account_id");--> statement-breakpoint
CREATE INDEX "content_item_breed_idx" ON "content_item" USING btree ("breed_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_revision_number_key" ON "content_revision" USING btree ("content_id","number");