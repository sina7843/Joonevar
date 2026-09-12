/**
 * Normalised geography — Requirements-Phase-2 §2 (provinces and cities), §7, §15.
 *
 * Phase 1 stores province and city as free text on locations, kennels,
 * residences and postal requests. That text stays as it is — it is history —
 * and records gain an optional link to these tables where a directory needs to
 * filter by place (DEC-0163). The directory of PROMPT-006 is the first consumer;
 * PROMPT-015 adds local pages and the remaining records.
 */
import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const now = sql`now()`;

/** The provinces of Iran, seeded by migration and keyed by a stable latin code. */
export const provinces = pgTable(
  'province',
  {
    code: text('code').primaryKey(),
    nameFa: text('name_fa').notNull(),
    nameEn: text('name_en').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('province_name_fa_key').on(t.nameFa)],
);

/** Cities within a province. The provincial capitals are seeded; others are added as data. */
export const cities = pgTable(
  'city',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provinceCode: text('province_code')
      .notNull()
      .references(() => provinces.code, { onDelete: 'restrict' }),
    nameFa: text('name_fa').notNull(),
    /**
     * The address a local page is published at (§19, PROMPT-015).
     *
     * Derived from the Persian name rather than from an invented latin one: no
     * romanised city list exists in the sources, and guessing one would put a
     * made-up name in a permanent URL. A province keeps its own latin `code`.
     */
    slug: text('slug'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('city_province_name_key').on(t.provinceCode, t.nameFa),
    uniqueIndex('city_province_slug_key').on(t.provinceCode, t.slug),
  ],
);
