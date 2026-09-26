CREATE TABLE "finder_favorite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_match_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_search_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finder_saved_search" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name_fa" text NOT NULL,
	"filters" jsonb NOT NULL,
	"for_animal_id" uuid,
	"notify" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finder_favorite" ADD CONSTRAINT "finder_favorite_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_favorite" ADD CONSTRAINT "finder_favorite_profile_id_mating_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."mating_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_match_notice" ADD CONSTRAINT "finder_match_notice_saved_search_id_finder_saved_search_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."finder_saved_search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_match_notice" ADD CONSTRAINT "finder_match_notice_profile_id_mating_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."mating_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_saved_search" ADD CONSTRAINT "finder_saved_search_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finder_saved_search" ADD CONSTRAINT "finder_saved_search_for_animal_id_animal_id_fk" FOREIGN KEY ("for_animal_id") REFERENCES "public"."animal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finder_favorite_key" ON "finder_favorite" USING btree ("account_id","profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finder_match_notice_key" ON "finder_match_notice" USING btree ("saved_search_id","profile_id");--> statement-breakpoint
CREATE INDEX "finder_saved_search_account_idx" ON "finder_saved_search" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "finder_saved_search_notify_idx" ON "finder_saved_search" USING btree ("notify");--> statement-breakpoint
CREATE INDEX "animal_finder_idx" ON "animal" USING btree ("species","breed_id","sex");