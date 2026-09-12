CREATE TABLE "taxonomy_seed" (
	"name" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
