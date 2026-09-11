CREATE TYPE "public"."vet_public_status" AS ENUM('DRAFT', 'PUBLISHED', 'HIDDEN');--> statement-breakpoint
CREATE TABLE "city" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"province_code" text NOT NULL,
	"name_fa" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "province" (
	"code" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_profile_specialty" (
	"vet_profile_id" uuid NOT NULL,
	"specialty_code" text NOT NULL,
	CONSTRAINT "vet_profile_specialty_vet_profile_id_specialty_code_pk" PRIMARY KEY("vet_profile_id","specialty_code")
);
--> statement-breakpoint
CREATE TABLE "vet_profile_species" (
	"vet_profile_id" uuid NOT NULL,
	"species_code" text NOT NULL,
	CONSTRAINT "vet_profile_species_vet_profile_id_species_code_pk" PRIMARY KEY("vet_profile_id","species_code")
);
--> statement-breakpoint
CREATE TABLE "vet_specialty" (
	"code" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vet_location" ADD COLUMN "province_code" text;--> statement-breakpoint
ALTER TABLE "vet_location" ADD COLUMN "city_id" uuid;--> statement-breakpoint
ALTER TABLE "vet_location" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vet_location" ADD COLUMN "hours_note_fa" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "public_slug" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "public_status" "vet_public_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "public_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "headline_fa" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "experience_fa" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "show_council_code" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "show_phone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "city" ADD CONSTRAINT "city_province_code_province_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."province"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_specialty" ADD CONSTRAINT "vet_profile_specialty_vet_profile_id_vet_profile_id_fk" FOREIGN KEY ("vet_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_specialty" ADD CONSTRAINT "vet_profile_specialty_specialty_code_vet_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."vet_specialty"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_species" ADD CONSTRAINT "vet_profile_species_vet_profile_id_vet_profile_id_fk" FOREIGN KEY ("vet_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile_species" ADD CONSTRAINT "vet_profile_species_species_code_species_code_fk" FOREIGN KEY ("species_code") REFERENCES "public"."species"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "city_province_name_key" ON "city" USING btree ("province_code","name_fa");--> statement-breakpoint
CREATE UNIQUE INDEX "province_name_fa_key" ON "province" USING btree ("name_fa");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_specialty_name_fa_key" ON "vet_specialty" USING btree ("name_fa");--> statement-breakpoint
ALTER TABLE "vet_location" ADD CONSTRAINT "vet_location_province_code_province_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."province"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_location" ADD CONSTRAINT "vet_location_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vet_location_city_idx" ON "vet_location" USING btree ("city_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_profile_public_slug_key" ON "vet_profile" USING btree ("public_slug");

-- Seed data: versioned with this migration (Requirements-Phase-2 §23, DEC-0163/DEC-0164).
-- CAT joins the species taxonomy so the directory filter covers more than one species;
-- the breed bank stays dog-only (P2-D01).
INSERT INTO "species" ("code", "name_fa", "name_en", "sort_order") VALUES ('CAT', 'گربه', 'Cat', 1);--> statement-breakpoint
INSERT INTO "province" ("code", "name_fa", "name_en", "sort_order") VALUES
  ('east-azerbaijan', 'آذربایجان شرقی', 'East Azerbaijan', 1),
  ('west-azerbaijan', 'آذربایجان غربی', 'West Azerbaijan', 2),
  ('ardabil', 'اردبیل', 'Ardabil', 3),
  ('isfahan', 'اصفهان', 'Isfahan', 4),
  ('alborz', 'البرز', 'Alborz', 5),
  ('ilam', 'ایلام', 'Ilam', 6),
  ('bushehr', 'بوشهر', 'Bushehr', 7),
  ('tehran', 'تهران', 'Tehran', 8),
  ('chaharmahal-bakhtiari', 'چهارمحال و بختیاری', 'Chaharmahal and Bakhtiari', 9),
  ('south-khorasan', 'خراسان جنوبی', 'South Khorasan', 10),
  ('razavi-khorasan', 'خراسان رضوی', 'Razavi Khorasan', 11),
  ('north-khorasan', 'خراسان شمالی', 'North Khorasan', 12),
  ('khuzestan', 'خوزستان', 'Khuzestan', 13),
  ('zanjan', 'زنجان', 'Zanjan', 14),
  ('semnan', 'سمنان', 'Semnan', 15),
  ('sistan-baluchestan', 'سیستان و بلوچستان', 'Sistan and Baluchestan', 16),
  ('fars', 'فارس', 'Fars', 17),
  ('qazvin', 'قزوین', 'Qazvin', 18),
  ('qom', 'قم', 'Qom', 19),
  ('kurdistan', 'کردستان', 'Kurdistan', 20),
  ('kerman', 'کرمان', 'Kerman', 21),
  ('kermanshah', 'کرمانشاه', 'Kermanshah', 22),
  ('kohgiluyeh-boyer-ahmad', 'کهگیلویه و بویراحمد', 'Kohgiluyeh and Boyer-Ahmad', 23),
  ('golestan', 'گلستان', 'Golestan', 24),
  ('gilan', 'گیلان', 'Gilan', 25),
  ('lorestan', 'لرستان', 'Lorestan', 26),
  ('mazandaran', 'مازندران', 'Mazandaran', 27),
  ('markazi', 'مرکزی', 'Markazi', 28),
  ('hormozgan', 'هرمزگان', 'Hormozgan', 29),
  ('hamadan', 'همدان', 'Hamadan', 30),
  ('yazd', 'یزد', 'Yazd', 31);--> statement-breakpoint
-- The provincial capitals; other cities are added by the superadmin as data.
INSERT INTO "city" ("province_code", "name_fa") VALUES
  ('east-azerbaijan', 'تبریز'),
  ('west-azerbaijan', 'ارومیه'),
  ('ardabil', 'اردبیل'),
  ('isfahan', 'اصفهان'),
  ('alborz', 'کرج'),
  ('ilam', 'ایلام'),
  ('bushehr', 'بوشهر'),
  ('tehran', 'تهران'),
  ('chaharmahal-bakhtiari', 'شهرکرد'),
  ('south-khorasan', 'بیرجند'),
  ('razavi-khorasan', 'مشهد'),
  ('north-khorasan', 'بجنورد'),
  ('khuzestan', 'اهواز'),
  ('zanjan', 'زنجان'),
  ('semnan', 'سمنان'),
  ('sistan-baluchestan', 'زاهدان'),
  ('fars', 'شیراز'),
  ('qazvin', 'قزوین'),
  ('qom', 'قم'),
  ('kurdistan', 'سنندج'),
  ('kerman', 'کرمان'),
  ('kermanshah', 'کرمانشاه'),
  ('kohgiluyeh-boyer-ahmad', 'یاسوج'),
  ('golestan', 'گرگان'),
  ('gilan', 'رشت'),
  ('lorestan', 'خرم‌آباد'),
  ('mazandaran', 'ساری'),
  ('markazi', 'اراک'),
  ('hormozgan', 'بندرعباس'),
  ('hamadan', 'همدان'),
  ('yazd', 'یزد');--> statement-breakpoint
-- Areas of practice a profile may list; a listing is the profile's statement, not a certification.
INSERT INTO "vet_specialty" ("code", "name_fa", "sort_order") VALUES
  ('SMALL_ANIMAL_MEDICINE', 'داخلی حیوانات کوچک', 1),
  ('SURGERY', 'جراحی', 2),
  ('ORTHOPEDICS', 'ارتوپدی', 3),
  ('DERMATOLOGY', 'پوست', 4),
  ('DENTISTRY', 'دندان‌پزشکی', 5),
  ('OPHTHALMOLOGY', 'چشم‌پزشکی', 6),
  ('CARDIOLOGY', 'قلب', 7),
  ('DIAGNOSTIC_IMAGING', 'تصویربرداری تشخیصی', 8),
  ('ANESTHESIA', 'بیهوشی', 9),
  ('EMERGENCY_CRITICAL_CARE', 'اورژانس و مراقبت‌های ویژه', 10),
  ('REPRODUCTION', 'مامایی و تولیدمثل', 11),
  ('ONCOLOGY', 'سرطان‌شناسی', 12),
  ('NUTRITION', 'تغذیه', 13),
  ('BEHAVIOR', 'رفتارشناسی', 14),
  ('LABORATORY_PATHOLOGY', 'آزمایشگاه و آسیب‌شناسی', 15);--> statement-breakpoint
-- Backfill: link existing locations whose free-text province/city matches; the text stays as history.
UPDATE "vet_location" AS l SET "province_code" = p."code" FROM "province" AS p WHERE l."province_code" IS NULL AND btrim(replace(replace(l."province_fa", chr(1610), chr(1740)), chr(1603), chr(1705))) = p."name_fa";--> statement-breakpoint
UPDATE "vet_location" AS l SET "city_id" = c."id", "province_code" = c."province_code" FROM "city" AS c WHERE l."city_id" IS NULL AND btrim(replace(replace(l."city_fa", chr(1610), chr(1740)), chr(1603), chr(1705))) = c."name_fa" AND (l."province_code" IS NULL OR l."province_code" = c."province_code") AND (SELECT count(*) FROM "city" AS d WHERE d."name_fa" = c."name_fa") = 1;
