CREATE TYPE "public"."breed_claim_kind" AS ENUM('HEALTH_NOTE', 'PREDISPOSED_CONDITION', 'SUGGESTED_GENETIC_TEST');--> statement-breakpoint
CREATE TYPE "public"."breed_coat" AS ENUM('HAIRLESS', 'SHORT', 'MEDIUM', 'LONG', 'WIRE', 'CURLY');--> statement-breakpoint
CREATE TYPE "public"."breed_level" AS ENUM('LOW', 'MODERATE', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."breed_profile_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."breed_size" AS ENUM('TOY', 'SMALL', 'MEDIUM', 'LARGE', 'GIANT');--> statement-breakpoint
CREATE TABLE "breed_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species_code" text NOT NULL,
	"fci_group" integer NOT NULL,
	"name_fa" text NOT NULL,
	"name_en" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breed_medical_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"breed_id" uuid NOT NULL,
	"kind" "breed_claim_kind" NOT NULL,
	"title_fa" text NOT NULL,
	"note_fa" text,
	"source_title" text NOT NULL,
	"source_url" text,
	"reviewed_on" date NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breed_slug_redirect" (
	"slug" text PRIMARY KEY NOT NULL,
	"breed_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species" (
	"code" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Taxonomy seed (DEC-0154): the one species Phase 1 already stores, and the ten FCI groups.
INSERT INTO "species" ("code", "name_fa", "name_en", "sort_order") VALUES ('DOG', 'سگ', 'Dog', 0);--> statement-breakpoint
INSERT INTO "breed_group" ("species_code", "fci_group", "name_fa", "name_en") VALUES
  ('DOG', 1, 'سگ‌های گله و دام (به‌جز سگ‌های دام سوئیسی)', 'Sheepdogs and Cattledogs (except Swiss Cattledogs)'),
  ('DOG', 2, 'پینشر و شناوزر، مولوسوئیدها و سگ‌های کوهستان و دام سوئیسی', 'Pinscher and Schnauzer - Molossoid and Swiss Mountain and Cattledogs'),
  ('DOG', 3, 'تریرها', 'Terriers'),
  ('DOG', 4, 'داکسهوندها', 'Dachshunds'),
  ('DOG', 5, 'اشپیتز و نژادهای ابتدایی', 'Spitz and primitive types'),
  ('DOG', 6, 'سگ‌های شکاری ردیاب و نژادهای وابسته', 'Scent hounds and related breeds'),
  ('DOG', 7, 'سگ‌های شکاری نشانگر', 'Pointing Dogs'),
  ('DOG', 8, 'رتریورها، سگ‌های بیرون‌ران و سگ‌های آبی', 'Retrievers - Flushing Dogs - Water Dogs'),
  ('DOG', 9, 'سگ‌های همراه و اسباب‌بازی', 'Companion and Toy Dogs'),
  ('DOG', 10, 'سگ‌های تازی', 'Sighthounds');--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "species_code" text DEFAULT 'DOG' NOT NULL;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "slug" text;--> statement-breakpoint
-- Existing breeds get an address from their latin name; a collision or an empty result takes the id prefix.
UPDATE "reference_breed" SET "slug" = trim(both '-' from regexp_replace(lower("name_en"), '[^a-z0-9]+', '-', 'g'));--> statement-breakpoint
UPDATE "reference_breed" AS b SET "slug" = concat_ws('-', nullif(b."slug", ''), left(b."id"::text, 8))
  WHERE b."slug" = '' OR EXISTS (SELECT 1 FROM "reference_breed" AS o WHERE o."slug" = b."slug" AND o."id" < b."id");--> statement-breakpoint
ALTER TABLE "reference_breed" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "alt_names" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "origin_country" text;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "size" "breed_size";--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "coat" "breed_coat";--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "energy" "breed_level";--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "trainability" "breed_level";--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "care_need" "breed_level";--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "with_children" "breed_level";--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "with_other_animals" "breed_level";--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "history_fa" text;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "standard_fa" text;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "standard_url" text;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "profile_status" "breed_profile_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "merged_into_breed_id" uuid;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "breed_group" ADD CONSTRAINT "breed_group_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breed_medical_claim" ADD CONSTRAINT "breed_medical_claim_breed_id_reference_breed_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."reference_breed"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breed_medical_claim" ADD CONSTRAINT "breed_medical_claim_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breed_slug_redirect" ADD CONSTRAINT "breed_slug_redirect_breed_id_reference_breed_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."reference_breed"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "breed_group_fci_key" ON "breed_group" USING btree ("species_code","fci_group");--> statement-breakpoint
CREATE INDEX "breed_medical_claim_breed_idx" ON "breed_medical_claim" USING btree ("breed_id");--> statement-breakpoint
ALTER TABLE "reference_breed" ADD CONSTRAINT "reference_breed_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD CONSTRAINT "reference_breed_group_id_breed_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."breed_group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD CONSTRAINT "reference_breed_merged_into_breed_id_reference_breed_id_fk" FOREIGN KEY ("merged_into_breed_id") REFERENCES "public"."reference_breed"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_species_species_code_fk" FOREIGN KEY ("species") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reference_breed_slug_key" ON "reference_breed" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "reference_breed_profile_status_idx" ON "reference_breed" USING btree ("profile_status");--> statement-breakpoint
ALTER TABLE "reference_breed" ADD CONSTRAINT "reference_breed_origin_country_check" CHECK ("reference_breed"."origin_country" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "reference_breed" ADD CONSTRAINT "reference_breed_slug_check" CHECK ("reference_breed"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "reference_breed" ADD CONSTRAINT "reference_breed_not_merged_into_itself" CHECK ("reference_breed"."merged_into_breed_id" <> "reference_breed"."id");