ALTER TYPE "public"."file_purpose" ADD VALUE 'BREED_IMAGE';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'CENTRE_IMAGE';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'VET_PROFILE_IMAGE';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'COMMUNITY_IMAGE';--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD COLUMN "image_alt_fa" text;--> statement-breakpoint
ALTER TABLE "community" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "community" ADD COLUMN "image_alt_fa" text;--> statement-breakpoint
ALTER TABLE "centre" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "centre" ADD COLUMN "image_alt_fa" text;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "image_alt_fa" text;--> statement-breakpoint
ALTER TABLE "reference_breed" ADD CONSTRAINT "reference_breed_image_file_id_stored_file_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community" ADD CONSTRAINT "community_image_file_id_stored_file_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre" ADD CONSTRAINT "centre_image_file_id_stored_file_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_image_file_id_stored_file_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."stored_file"("id") ON DELETE set null ON UPDATE no action;