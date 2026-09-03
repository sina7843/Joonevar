ALTER TABLE "animal" ADD COLUMN "identity_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "identity_verified_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "identity_verified_request_id" uuid;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_identity_verified_by_account_id_account_id_fk" FOREIGN KEY ("identity_verified_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;