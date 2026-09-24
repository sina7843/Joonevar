/**
 * Phase 3 marketplace foundations — PROMPT-002.
 *
 * Only one table lives here. Everything else the prompt asks for — durations,
 * limits, fees, windows, commission inputs, settlement cadence, shipping
 * bounds, promotion stacking, loyalty and the kill switches — is a managed
 * product setting, because `product_setting` already gives versioning, an audit
 * row per change, per-group permissions and an admin surface. A second
 * mechanism beside it would be a second thing to keep honest (DEC-0204).
 *
 * Species enablement cannot be a setting: it is one row per species per market
 * with a real foreign key to the species taxonomy, and each row is switched on
 * its own with its own version and its own audit trail.
 */
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { marketplaceMarket } from './enums.ts';
import { accounts, species } from './core.ts';

const now = sql`now()`;

/**
 * Which species each market is open for.
 *
 * The architecture is species-neutral and the launch is not: only the dog is
 * open for animal sale, while the shop is open for every species from the start
 * (PRODUCT_DECISIONS §1, §7). Opening another species for animal sale is a
 * legal decision somebody has to take and record here with a reason — it is
 * never a side effect of adding a species to the taxonomy, which is why a new
 * row starts closed unless the seed says otherwise.
 */
export const marketplaceSpecies = pgTable(
  'marketplace_species',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    market: marketplaceMarket('market').notNull(),
    speciesCode: text('species_code')
      .notNull()
      .references(() => species.code, { onDelete: 'restrict' }),
    enabled: boolean('enabled').notNull().default(false),
    /** Why it was last switched. Kept on the row so the current state explains itself. */
    reasonFa: text('reason_fa'),
    version: integer('version').notNull().default(1),
    updatedByAccountId: uuid('updated_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('marketplace_species_key').on(t.market, t.speciesCode),
    index('marketplace_species_enabled_idx').on(t.market, t.enabled),
  ],
);
