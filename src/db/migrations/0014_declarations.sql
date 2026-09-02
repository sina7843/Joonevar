CREATE TYPE "public"."declaration_status" AS ENUM('PENDING_COUNTERPARTY_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."personal_note_kind" AS ENUM('MATING_DATE', 'PREGNANCY', 'BIRTH');--> statement-breakpoint
CREATE TABLE "personal_declaration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiator_account_id" uuid NOT NULL,
	"initiator_animal_id" uuid NOT NULL,
	"counterparty_animal_id" uuid NOT NULL,
	"counterparty_account_id" uuid NOT NULL,
	"invited_mobile" text NOT NULL,
	"status" "declaration_status" DEFAULT 'PENDING_COUNTERPARTY_CONFIRMATION' NOT NULL,
	"responded_at" timestamp with time zone,
	"reason_fa" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"declaration_id" uuid NOT NULL,
	"kind" "personal_note_kind" NOT NULL,
	"note_date" text,
	"note_fa" text,
	"recorded_by_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_declaration" ADD CONSTRAINT "personal_declaration_initiator_account_id_account_id_fk" FOREIGN KEY ("initiator_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_declaration" ADD CONSTRAINT "personal_declaration_initiator_animal_id_animal_id_fk" FOREIGN KEY ("initiator_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_declaration" ADD CONSTRAINT "personal_declaration_counterparty_animal_id_animal_id_fk" FOREIGN KEY ("counterparty_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_declaration" ADD CONSTRAINT "personal_declaration_counterparty_account_id_account_id_fk" FOREIGN KEY ("counterparty_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_note" ADD CONSTRAINT "personal_note_declaration_id_personal_declaration_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."personal_declaration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_note" ADD CONSTRAINT "personal_note_recorded_by_account_id_account_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_declaration_initiator_idx" ON "personal_declaration" USING btree ("initiator_account_id","status");--> statement-breakpoint
CREATE INDEX "personal_declaration_counterparty_idx" ON "personal_declaration" USING btree ("counterparty_account_id","status");--> statement-breakpoint
CREATE INDEX "personal_note_declaration_idx" ON "personal_note" USING btree ("declaration_id","kind");