ALTER TABLE "community" ADD COLUMN "merged_into_community_id" uuid;--> statement-breakpoint
ALTER TABLE "centre" ADD COLUMN "merged_into_centre_id" uuid;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD COLUMN "merged_into_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "community" ADD CONSTRAINT "community_merged_into_community_id_community_id_fk" FOREIGN KEY ("merged_into_community_id") REFERENCES "public"."community"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre" ADD CONSTRAINT "centre_merged_into_centre_id_centre_id_fk" FOREIGN KEY ("merged_into_centre_id") REFERENCES "public"."centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_merged_into_profile_id_vet_profile_id_fk" FOREIGN KEY ("merged_into_profile_id") REFERENCES "public"."vet_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community" ADD CONSTRAINT "community_not_merged_into_itself" CHECK ("community"."merged_into_community_id" is null or "community"."merged_into_community_id" <> "community"."id");--> statement-breakpoint
ALTER TABLE "centre" ADD CONSTRAINT "centre_not_merged_into_itself" CHECK ("centre"."merged_into_centre_id" is null or "centre"."merged_into_centre_id" <> "centre"."id");--> statement-breakpoint
ALTER TABLE "vet_profile" ADD CONSTRAINT "vet_profile_not_merged_into_itself" CHECK ("vet_profile"."merged_into_profile_id" is null or "vet_profile"."merged_into_profile_id" <> "vet_profile"."id");