CREATE TYPE "public"."verification_outcome" AS ENUM('VALID', 'REPLACED', 'NOT_FOUND', 'RATE_LIMITED');--> statement-breakpoint
CREATE TABLE "verification_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_key" text NOT NULL,
	"code" text NOT NULL,
	"outcome" "verification_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "verification_attempt_client_idx" ON "verification_attempt" USING btree ("client_key","created_at");