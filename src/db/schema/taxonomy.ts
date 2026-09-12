/**
 * Installed taxonomy generations — Requirements-Phase-2 §23.
 *
 * §23 asks that taxonomies have a versioned seed. The rows themselves already
 * live in their own tables (species, breed_group, province, city,
 * vet_specialty, centre_type, centre_service, centre_facility); what was
 * missing is an answer to "which generation of that catalogue does this
 * database hold". Migrations 0017, 0020 and 0022 installed the first
 * generation, but a migration is a one-time event: nothing could add an entry
 * afterwards without another migration, and nothing recorded what had been
 * installed.
 *
 * One row per taxonomy, so catalogues advance independently — adding a species
 * must not claim the centre facilities were reviewed too.
 *
 * This is deliberately not a `product_setting`: those rows are operator-facing
 * and carry a permission group, a label and an audited version of their own.
 * The installed generation is internal bookkeeping the operator never edits,
 * so putting it there would both lie to the settings screen and widen the
 * permission surface.
 */
import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

const now = sql`now()`;

export const taxonomySeeds = pgTable('taxonomy_seed', {
  /** The catalogue name, matching TAXONOMY_CATALOGUES in src/db/seed/taxonomy.ts. */
  name: text('name').primaryKey(),
  version: integer('version').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().default(now),
});
