CREATE TYPE "public"."rate_limit_action" AS ENUM('LISTING_INQUIRY_CREATE', 'QUESTION_ASK', 'REPORT_SUBMIT', 'DISCOUNT_CODE_TRY', 'REVIEW_SUBMIT', 'SEARCH_QUERY');--> statement-breakpoint
CREATE TABLE "rate_limit_hit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" "rate_limit_action" NOT NULL,
	"account_id" uuid,
	"subject_hash" text,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_count_positive" CHECK ("rate_limit_hit"."count" > 0),
	CONSTRAINT "rate_limit_one_subject" CHECK (("rate_limit_hit"."account_id" is not null)::int + ("rate_limit_hit"."subject_hash" is not null)::int = 1)
);
--> statement-breakpoint
ALTER TABLE "rate_limit_hit" ADD CONSTRAINT "rate_limit_hit_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_account_key" ON "rate_limit_hit" USING btree ("action","account_id","window_started_at") WHERE "rate_limit_hit"."account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_subject_key" ON "rate_limit_hit" USING btree ("action","subject_hash","window_started_at") WHERE "rate_limit_hit"."subject_hash" is not null;--> statement-breakpoint
CREATE INDEX "rate_limit_sweep_idx" ON "rate_limit_hit" USING btree ("window_started_at");