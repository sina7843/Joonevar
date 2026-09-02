CREATE TYPE "public"."birth_event_kind" AS ENUM('INITIAL', 'CORRECTION');--> statement-breakpoint
CREATE TYPE "public"."puppy_status" AS ENUM('ALIVE', 'DECEASED', 'WITHDRAWN');--> statement-breakpoint
CREATE TABLE "birth_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"permit_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" "birth_event_kind" DEFAULT 'INITIAL' NOT NULL,
	"born_on" text NOT NULL,
	"live_count" integer NOT NULL,
	"dead_count" integer NOT NULL,
	"reason_fa" text,
	"note_fa" text,
	"declared_by_account_id" uuid NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaces_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "litter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"permit_id" uuid NOT NULL,
	"born_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregnancy_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"permit_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregnancy_declaration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"permit_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"pregnant" boolean NOT NULL,
	"expected_count" integer,
	"note_fa" text,
	"reason_fa" text,
	"declared_by_account_id" uuid NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaces_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puppy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"litter_id" uuid NOT NULL,
	"permit_id" uuid NOT NULL,
	"temp_code" text NOT NULL,
	"name_fa" text,
	"status" "puppy_status" DEFAULT 'ALIVE' NOT NULL,
	"created_by_version" integer NOT NULL,
	"died_on" text,
	"death_reason_fa" text,
	"death_recorded_by_account_id" uuid,
	"death_recorded_at" timestamp with time zone,
	"withdrawn_by_version" integer,
	"withdrawn_reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_pregnancy_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"pregnant" boolean NOT NULL,
	"expected_count" integer,
	"note_fa" text,
	"reason_fa" text,
	"vet_account_id" uuid NOT NULL,
	"vet_name_fa" text NOT NULL,
	"council_code" text NOT NULL,
	"location_id" uuid NOT NULL,
	"examined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaces_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "birth_event" ADD CONSTRAINT "birth_event_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "birth_event" ADD CONSTRAINT "birth_event_declared_by_account_id_account_id_fk" FOREIGN KEY ("declared_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litter" ADD CONSTRAINT "litter_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_request_id_vet_visit_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."vet_visit_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_requested_by_account_id_account_id_fk" FOREIGN KEY ("requested_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_declaration" ADD CONSTRAINT "pregnancy_declaration_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_declaration" ADD CONSTRAINT "pregnancy_declaration_declared_by_account_id_account_id_fk" FOREIGN KEY ("declared_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy" ADD CONSTRAINT "puppy_litter_id_litter_id_fk" FOREIGN KEY ("litter_id") REFERENCES "public"."litter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy" ADD CONSTRAINT "puppy_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puppy" ADD CONSTRAINT "puppy_death_recorded_by_account_id_account_id_fk" FOREIGN KEY ("death_recorded_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_pregnancy_result" ADD CONSTRAINT "vet_pregnancy_result_check_id_pregnancy_check_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."pregnancy_check"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_pregnancy_result" ADD CONSTRAINT "vet_pregnancy_result_vet_account_id_account_id_fk" FOREIGN KEY ("vet_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_pregnancy_result" ADD CONSTRAINT "vet_pregnancy_result_location_id_vet_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."vet_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "birth_event_version_key" ON "birth_event" USING btree ("permit_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "litter_permit_key" ON "litter" USING btree ("permit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pregnancy_check_request_key" ON "pregnancy_check" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "pregnancy_check_permit_idx" ON "pregnancy_check" USING btree ("permit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pregnancy_declaration_version_key" ON "pregnancy_declaration" USING btree ("permit_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "puppy_temp_code_key" ON "puppy" USING btree ("temp_code");--> statement-breakpoint
CREATE INDEX "puppy_litter_idx" ON "puppy" USING btree ("litter_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "vet_pregnancy_result_version_key" ON "vet_pregnancy_result" USING btree ("check_id","version");