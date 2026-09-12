ALTER TABLE "city" ADD COLUMN "slug" text;--> statement-breakpoint
-- Backfill: the Persian name with its word breaks turned into hyphens, the same
-- rule `citySlug()` applies in code. No romanised city list exists in the
-- sources, so no latin name is invented for a permanent URL (DEC-0175).
UPDATE "city"
SET "slug" = regexp_replace(
  replace(btrim("name_fa"), U&'\200C', '-'),
  '[[:space:]]+', '-', 'g'
)
WHERE "slug" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "city_province_slug_key" ON "city" USING btree ("province_code","slug");