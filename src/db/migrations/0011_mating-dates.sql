CREATE TYPE "public"."mating_date_status" AS ENUM('PROPOSED', 'CONFIRMED', 'SUPERSEDED', 'CONFLICTED');--> statement-breakpoint
CREATE TABLE "mating_date_declaration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"permit_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"mated_on" text NOT NULL,
	"status" "mating_date_status" DEFAULT 'PROPOSED' NOT NULL,
	"declared_by_account_id" uuid NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by_account_id" uuid,
	"confirmed_at" timestamp with time zone,
	"replaces_version" integer,
	"conflicts_with_id" uuid,
	"note_fa" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mating_date_declaration" ADD CONSTRAINT "mating_date_declaration_permit_id_mating_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."mating_permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_date_declaration" ADD CONSTRAINT "mating_date_declaration_declared_by_account_id_account_id_fk" FOREIGN KEY ("declared_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mating_date_declaration" ADD CONSTRAINT "mating_date_declaration_confirmed_by_account_id_account_id_fk" FOREIGN KEY ("confirmed_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mating_date_version_key" ON "mating_date_declaration" USING btree ("permit_id","version");--> statement-breakpoint
CREATE INDEX "mating_date_permit_idx" ON "mating_date_declaration" USING btree ("permit_id","status");