CREATE TYPE "public"."finder_personal_mating_status" AS ENUM('ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "finder_downstream_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_number" integer NOT NULL,
	"route" "mating_route" NOT NULL,
	"permit_id" uuid,
	"personal_mating_id" uuid,
	"linked_by_account_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detached_at" timestamp with time zone,
	"detached_reason_fa" text,
	CONSTRAINT "finder_downstream_route_check" CHECK (("finder_downstream_link"."route"::text = 'OFFICIAL' and "finder_downstream_link"."permit_id" is not null and "finder_downstream_link"."personal_mating_id" is null) or ("finder_downstream_link"."route"::text = 'PERSONAL' and "finder_downstream_link"."personal_mating_id" is not null and "finder_downstream_link"."permit_id" is null))
);
--> statement-breakpoint
CREATE TABLE "finder_personal_mating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"sire_animal_id" uuid NOT NULL,
	"dam_animal_id" uuid NOT NULL,
	"sire_account_id" uuid NOT NULL,
	"dam_account_id" uuid NOT NULL,
	"status" "finder_personal_mating_status" DEFAULT 'ACTIVE' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finder_personal_mating_two_animals_check" CHECK ("finder_personal_mating"."sire_animal_id" <> "finder_personal_mating"."dam_animal_id")
);
--> statement-breakpoint
ALTER TABLE "mating_date_declaration" ALTER COLUMN "permit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mating_date_declaration" ADD COLUMN "personal_mating_id" uuid;--> statement-breakpoint
ALTER TABLE "finder_downstream_link" ADD CONSTRAINT "finder_downstream_link_contract_id_finder_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."finder_contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_downstream_link" ADD CONSTRAINT "finder_downstream_link_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_downstream_link" ADD CONSTRAINT "finder_downstream_link_personal_mating_id_finder_personal_mating_id_fk" FOREIGN KEY ("personal_mating_id") REFERENCES "public"."finder_personal_mating"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_downstream_link" ADD CONSTRAINT "finder_downstream_link_linked_by_account_id_account_id_fk" FOREIGN KEY ("linked_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_personal_mating" ADD CONSTRAINT "finder_personal_mating_contract_id_finder_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."finder_contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_personal_mating" ADD CONSTRAINT "finder_personal_mating_request_id_mating_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mating_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_personal_mating" ADD CONSTRAINT "finder_personal_mating_sire_animal_id_animal_id_fk" FOREIGN KEY ("sire_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_personal_mating" ADD CONSTRAINT "finder_personal_mating_dam_animal_id_animal_id_fk" FOREIGN KEY ("dam_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_personal_mating" ADD CONSTRAINT "finder_personal_mating_sire_account_id_account_id_fk" FOREIGN KEY ("sire_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_personal_mating" ADD CONSTRAINT "finder_personal_mating_dam_account_id_account_id_fk" FOREIGN KEY ("dam_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finder_downstream_contract_key" ON "finder_downstream_link" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_downstream_permit_key" ON "finder_downstream_link" USING btree ("permit_id") WHERE "finder_downstream_link"."permit_id" is not null and "finder_downstream_link"."detached_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "finder_personal_mating_contract_key" ON "finder_personal_mating" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "finder_personal_mating_sire_idx" ON "finder_personal_mating" USING btree ("sire_animal_id");--> statement-breakpoint
CREATE INDEX "finder_personal_mating_dam_idx" ON "finder_personal_mating" USING btree ("dam_animal_id");--> statement-breakpoint
ALTER TABLE "mating_date_declaration" ADD CONSTRAINT "mating_date_declaration_personal_mating_id_finder_personal_mating_id_fk" FOREIGN KEY ("personal_mating_id") REFERENCES "public"."finder_personal_mating"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mating_date_personal_version_key" ON "mating_date_declaration" USING btree ("personal_mating_id","version") WHERE "mating_date_declaration"."personal_mating_id" is not null;--> statement-breakpoint
ALTER TABLE "mating_date_declaration" ADD CONSTRAINT "mating_date_one_subject_check" CHECK (num_nonnulls("mating_date_declaration"."permit_id", "mating_date_declaration"."personal_mating_id") = 1);