CREATE TYPE "public"."animal_origin" AS ENUM('G0', 'INTERNAL_G1PLUS', 'FOREIGN_PEDIGREE');--> statement-breakpoint
CREATE TYPE "public"."animal_sex" AS ENUM('MALE', 'FEMALE');--> statement-breakpoint
CREATE TYPE "public"."animal_status" AS ENUM('DRAFT', 'REGISTERED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."foreign_pedigree_status" AS ENUM('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'NEEDS_CORRECTION', 'REJECTED');--> statement-breakpoint
CREATE TABLE "animal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"status" "animal_status" DEFAULT 'DRAFT' NOT NULL,
	"name" text,
	"species" text DEFAULT 'DOG' NOT NULL,
	"breed_id" uuid,
	"sex" "animal_sex",
	"birth_date" date,
	"birth_date_approximate" boolean DEFAULT false NOT NULL,
	"color" text,
	"markings" text,
	"photo_file_id" uuid,
	"declared_microchip_number" text,
	"origin" "animal_origin" DEFAULT 'G0' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"sire_animal_id" uuid,
	"dam_animal_id" uuid,
	"pedigree_code" text,
	"pet_id" text,
	"draft_step" integer DEFAULT 1 NOT NULL,
	"draft_data" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"registered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "foreign_pedigree_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"status" "foreign_pedigree_status" DEFAULT 'DRAFT' NOT NULL,
	"issuer_id" uuid,
	"document_code" text,
	"front_file_id" uuid,
	"back_file_id" uuid,
	"extracted_generation" integer,
	"reason_fa" text,
	"submitted_at" timestamp with time zone,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_breed_id_reference_breed_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."reference_breed"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_photo_file_id_stored_file_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_sire_animal_id_animal_id_fk" FOREIGN KEY ("sire_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_dam_animal_id_animal_id_fk" FOREIGN KEY ("dam_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreign_pedigree_case" ADD CONSTRAINT "foreign_pedigree_case_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreign_pedigree_case" ADD CONSTRAINT "foreign_pedigree_case_issuer_id_pedigree_issuer_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."pedigree_issuer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreign_pedigree_case" ADD CONSTRAINT "foreign_pedigree_case_front_file_id_stored_file_id_fk" FOREIGN KEY ("front_file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreign_pedigree_case" ADD CONSTRAINT "foreign_pedigree_case_back_file_id_stored_file_id_fk" FOREIGN KEY ("back_file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreign_pedigree_case" ADD CONSTRAINT "foreign_pedigree_case_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animal_owner_idx" ON "animal" USING btree ("owner_account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "animal_pedigree_code_key" ON "animal" USING btree ("pedigree_code");--> statement-breakpoint
CREATE UNIQUE INDEX "animal_pet_id_key" ON "animal" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "animal_sire_idx" ON "animal" USING btree ("sire_animal_id");--> statement-breakpoint
CREATE INDEX "animal_dam_idx" ON "animal" USING btree ("dam_animal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foreign_pedigree_animal_key" ON "foreign_pedigree_case" USING btree ("animal_id");--> statement-breakpoint
CREATE INDEX "foreign_pedigree_status_idx" ON "foreign_pedigree_case" USING btree ("status","submitted_at");