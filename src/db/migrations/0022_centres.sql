CREATE TYPE "public"."centre_member_status" AS ENUM('INVITED', 'ACCEPTED', 'DECLINED', 'REMOVED');--> statement-breakpoint
CREATE TABLE "centre_facility" (
	"code" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centre_facility_link" (
	"centre_id" uuid NOT NULL,
	"facility_code" text NOT NULL,
	CONSTRAINT "centre_facility_link_centre_id_facility_code_pk" PRIMARY KEY("centre_id","facility_code")
);
--> statement-breakpoint
CREATE TABLE "centre_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"vet_profile_id" uuid NOT NULL,
	"role_fa" text,
	"status" "centre_member_status" DEFAULT 'INVITED' NOT NULL,
	"invited_by_account_id" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centre_service_link" (
	"centre_id" uuid NOT NULL,
	"service_code" text NOT NULL,
	CONSTRAINT "centre_service_link_centre_id_service_code_pk" PRIMARY KEY("centre_id","service_code")
);
--> statement-breakpoint
CREATE TABLE "centre_service" (
	"code" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centre_species" (
	"centre_id" uuid NOT NULL,
	"species_code" text NOT NULL,
	CONSTRAINT "centre_species_centre_id_species_code_pk" PRIMARY KEY("centre_id","species_code")
);
--> statement-breakpoint
CREATE TABLE "centre_type" (
	"code" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid,
	"type_code" text NOT NULL,
	"display_name_fa" text NOT NULL,
	"about_fa" text,
	"phone" text,
	"website_url" text,
	"licence_number" text,
	"licence_status" "licence_status" DEFAULT 'NONE' NOT NULL,
	"licence_verified_at" timestamp with time zone,
	"public_slug" text,
	"public_status" "vet_public_status" DEFAULT 'DRAFT' NOT NULL,
	"public_published_at" timestamp with time zone,
	"hidden_by_review" boolean DEFAULT false NOT NULL,
	"listed_city_id" uuid,
	"listed_contact_fa" text,
	"source_fa" text,
	"claimed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"opens_at" text NOT NULL,
	"closes_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vet_location" ALTER COLUMN "vet_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vet_location" ADD COLUMN "centre_id" uuid;--> statement-breakpoint
ALTER TABLE "vet_location" ADD COLUMN "is_open_24h" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "centre_facility_link" ADD CONSTRAINT "centre_facility_link_centre_id_centre_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_facility_link" ADD CONSTRAINT "centre_facility_link_facility_code_centre_facility_code_fk" FOREIGN KEY ("facility_code") REFERENCES "public"."centre_facility"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_member" ADD CONSTRAINT "centre_member_centre_id_centre_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_member" ADD CONSTRAINT "centre_member_vet_profile_id_vet_profile_id_fk" FOREIGN KEY ("vet_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_member" ADD CONSTRAINT "centre_member_invited_by_account_id_account_id_fk" FOREIGN KEY ("invited_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_service_link" ADD CONSTRAINT "centre_service_link_centre_id_centre_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_service_link" ADD CONSTRAINT "centre_service_link_service_code_centre_service_code_fk" FOREIGN KEY ("service_code") REFERENCES "public"."centre_service"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_species" ADD CONSTRAINT "centre_species_centre_id_centre_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_species" ADD CONSTRAINT "centre_species_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre" ADD CONSTRAINT "centre_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre" ADD CONSTRAINT "centre_type_code_centre_type_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."centre_type"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre" ADD CONSTRAINT "centre_listed_city_id_city_id_fk" FOREIGN KEY ("listed_city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_hours" ADD CONSTRAINT "location_hours_location_id_vet_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."vet_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "centre_facility_name_fa_key" ON "centre_facility" USING btree ("name_fa");--> statement-breakpoint
CREATE UNIQUE INDEX "centre_member_unique_key" ON "centre_member" USING btree ("centre_id","vet_profile_id");--> statement-breakpoint
CREATE INDEX "centre_member_vet_idx" ON "centre_member" USING btree ("vet_profile_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "centre_service_name_fa_key" ON "centre_service" USING btree ("name_fa");--> statement-breakpoint
CREATE UNIQUE INDEX "centre_type_name_fa_key" ON "centre_type" USING btree ("name_fa");--> statement-breakpoint
CREATE UNIQUE INDEX "centre_public_slug_key" ON "centre" USING btree ("public_slug");--> statement-breakpoint
CREATE INDEX "centre_status_idx" ON "centre" USING btree ("public_status");--> statement-breakpoint
CREATE INDEX "centre_owner_idx" ON "centre" USING btree ("owner_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_hours_day_key" ON "location_hours" USING btree ("location_id","weekday");--> statement-breakpoint
ALTER TABLE "vet_location" ADD CONSTRAINT "vet_location_centre_id_centre_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vet_location_centre_idx" ON "vet_location" USING btree ("centre_id");

-- Seed data: versioned with this migration (Requirements-Phase-2 §9, §23; DEC-0167).
-- Centre kinds, the services a centre may state it offers, and plain amenities.
INSERT INTO "centre_type" ("code", "name_fa", "sort_order") VALUES
  ('HOSPITAL', 'بیمارستان دامپزشکی', 1),
  ('CLINIC', 'کلینیک دامپزشکی', 2),
  ('POLYCLINIC', 'درمانگاه دامپزشکی', 3),
  ('OFFICE', 'مطب دامپزشکی', 4),
  ('LABORATORY', 'آزمایشگاه دامپزشکی', 5),
  ('IMAGING', 'مرکز تصویربرداری', 6),
  ('PHARMACY', 'داروخانه دامپزشکی', 7),
  ('GENETICS', 'مرکز ژنتیک', 8),
  ('REHABILITATION', 'مرکز توان‌بخشی', 9),
  ('OTHER', 'سایر مراکز', 10);--> statement-breakpoint
INSERT INTO "centre_service" ("code", "name_fa", "sort_order") VALUES
  ('EXAMINATION', 'ویزیت و معاینه', 1),
  ('VACCINATION', 'واکسیناسیون', 2),
  ('SURGERY', 'جراحی', 3),
  ('DENTISTRY', 'دندان‌پزشکی', 4),
  ('HOSPITALIZATION', 'بستری', 5),
  ('EMERGENCY', 'اورژانس', 6),
  ('LABORATORY', 'آزمایشگاه', 7),
  ('IMAGING', 'تصویربرداری', 8),
  ('PHARMACY', 'داروخانه', 9),
  ('MICROCHIP', 'کاشت میکروچیپ', 10),
  ('SAMPLING', 'نمونه‌گیری', 11),
  ('PHYSIOTHERAPY', 'فیزیوتراپی', 12),
  ('NUTRITION_COUNSELLING', 'مشاوره تغذیه', 13),
  ('GROOMING', 'آرایش و بهداشت', 14);--> statement-breakpoint
INSERT INTO "centre_facility" ("code", "name_fa", "sort_order") VALUES
  ('PARKING', 'پارکینگ', 1),
  ('HOSPITALIZATION_WARD', 'بخش بستری', 2),
  ('ISOLATION', 'بخش ایزوله', 3),
  ('AMBULANCE', 'آمبولانس', 4),
  ('WHEELCHAIR_ACCESS', 'دسترسی بدون پله', 5),
  ('WAITING_ROOM', 'اتاق انتظار', 6),
  ('CARD_PAYMENT', 'پرداخت کارتی', 7),
  ('IN_HOUSE_LAB', 'آزمایشگاه داخلی', 8),
  ('IN_HOUSE_IMAGING', 'تصویربرداری داخلی', 9),
  ('IN_HOUSE_PHARMACY', 'داروخانه داخلی', 10);
