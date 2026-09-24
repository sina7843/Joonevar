ALTER TYPE "public"."vet_case_status" ADD VALUE 'TRUSTED_APPROVED_AWAITING_PAYMENT';--> statement-breakpoint
ALTER TYPE "public"."vet_case_type" ADD VALUE 'TRUSTED';--> statement-breakpoint
CREATE TABLE "vet_trusted_declaration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"submission_version" integer NOT NULL,
	"terms_version" text NOT NULL,
	"declaration_version" text NOT NULL,
	"microchip_reader_declared" boolean NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vet_trusted_declaration_reader_declared" CHECK ("vet_trusted_declaration"."microchip_reader_declared" = true)
);
--> statement-breakpoint
ALTER TABLE "vet_trusted_declaration" ADD CONSTRAINT "vet_trusted_declaration_case_id_vet_professional_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."vet_professional_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vet_trusted_declaration_version_key" ON "vet_trusted_declaration" USING btree ("case_id","submission_version");--> statement-breakpoint
-- Hand-written (PHASE-2.5 PROMPT-010). What somebody accepted and declared is evidence of that
-- moment: it is never edited or removed, exactly like a submission.
CREATE OR REPLACE FUNCTION vet_trusted_declaration_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vet_trusted_declaration is append-only' USING ERRCODE = '23001';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER vet_trusted_declaration_immutable BEFORE UPDATE OR DELETE ON "vet_trusted_declaration"
  FOR EACH ROW EXECUTE FUNCTION vet_trusted_declaration_guard();
