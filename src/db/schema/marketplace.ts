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
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  animalListingStatus,
  listingDeliveryMethod,
  listingDisclosure,
  listingMediaKind,
  listingPriceMode,
  listingPromotionStatus,
  listingSellerKind,
  marketplaceMarket,
} from './enums.ts';
import { accounts, species, storedFiles } from './core.ts';
import { paymentBatches } from './billing.ts';
import { animals } from './animals.ts';
import { kennels } from './kennels.ts';
import { cities, provinces } from './geography.ts';

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

/**
 * One animal offered for sale — PROMPT-003.
 *
 * Deliberately thin. Date of birth, sex, breed, identifiers and the current
 * owner are **not** stored here: they live on the animal record, which is the
 * only thing that may be believed about an animal's identity (§10). Copying
 * them would create a second version of the truth that a later correction never
 * reaches, so every read joins instead.
 *
 * What is stored is what only the seller knows: the price and how it is set,
 * why the animal is being sold, where it is, and the disclosures Hamzist cannot
 * verify. Those are labelled as the seller's own statements wherever shown.
 */
export const animalListings = pgTable(
  'animal_listing',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    sellerAccountId: uuid('seller_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** Decided by the server from real facts at create, and re-decided at publish. */
    sellerKind: listingSellerKind('seller_kind').notNull(),
    /** Set only when the seller is selling as a kennel. */
    kennelId: uuid('kennel_id').references(() => kennels.id, { onDelete: 'restrict' }),
    status: animalListingStatus('status').notNull().default('DRAFT'),

    priceMode: listingPriceMode('price_mode'),
    /** Null for a negotiable listing; the final figure is locked during negotiation (PROMPT-005). */
    priceToman: bigint('price_toman', { mode: 'bigint' }),

    descriptionFa: text('description_fa'),
    reasonForSaleFa: text('reason_for_sale_fa'),

    provinceCode: text('province_code').references(() => provinces.code, { onDelete: 'restrict' }),
    cityId: uuid('city_id').references(() => cities.id, { onDelete: 'restrict' }),

    /** Seller statements. Hamzist holds no vaccination or neutering record. */
    vaccinationStatus: listingDisclosure('vaccination_status'),
    neuterStatus: listingDisclosure('neuter_status'),
    healthNoteFa: text('health_note_fa'),

    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** The duration setting and its version, frozen at publication (§22). */
    durationDays: integer('duration_days'),
    durationSettingVersion: integer('duration_setting_version'),

    /** Why the listing is in its current state, when a person put it there. */
    statusReasonFa: text('status_reason_fa'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    statusChangedByAccountId: uuid('status_changed_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    /*
     * One live listing per animal. The same animal cannot be offered twice at
     * once, and a suspended listing still occupies its animal so a seller
     * cannot escape a moderator's hold by starting again. SOLD, EXPIRED and
     * REMOVED release the animal for a later sale by its new owner.
     */
    uniqueIndex('animal_listing_live_key')
      .on(t.animalId)
      .where(sql`${t.status} in ('DRAFT','PUBLISHED','PAUSED','RESERVED','SUSPENDED')`),
    index('animal_listing_seller_idx').on(t.sellerAccountId, t.status),
    index('animal_listing_public_idx').on(t.status, t.publishedAt),
    index('animal_listing_expiry_idx').on(t.status, t.expiresAt),
    check('animal_listing_exact_price', sql`${t.priceMode} is distinct from 'EXACT' or ${t.priceToman} > 0`),
    check('animal_listing_kennel_kind', sql`${t.sellerKind} is distinct from 'KENNEL' or ${t.kennelId} is not null`),
  ],
);

/** The delivery options this seller offers; the buyer chooses one (PRODUCT_DECISIONS §6). */
export const animalListingDeliveries = pgTable(
  'animal_listing_delivery',
  {
    listingId: uuid('listing_id')
      .notNull()
      .references(() => animalListings.id, { onDelete: 'cascade' }),
    method: listingDeliveryMethod('method').notNull(),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.method] })],
);

/**
 * Photos and the optional video.
 *
 * The bytes stay in private storage exactly as every other upload does, and are
 * served through `/media/[id]` only while the listing is published — the same
 * rule DEC-0160 set for content images. Pausing, suspending or removing a
 * listing takes its pictures down with it.
 */
export const animalListingMedia = pgTable(
  'animal_listing_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => animalListings.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => storedFiles.id, { onDelete: 'restrict' }),
    kind: listingMediaKind('kind').notNull(),
    altFa: text('alt_fa').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('animal_listing_media_file_key').on(t.fileId),
    index('animal_listing_media_listing_idx').on(t.listingId, t.kind, t.sortOrder),
    // At most one video per listing; photos are unlimited above the minimum.
    uniqueIndex('animal_listing_single_video_key').on(t.listingId).where(sql`${t.kind} = 'VIDEO'`),
  ],
);

/**
 * Revision history — what the listing said, and when.
 *
 * A buyer decides on what a listing claimed at the moment they read it, and a
 * dispute about «آگهی نوشته بود…» is only answerable if that version still
 * exists. Every create, edit and state change appends one row; nothing here is
 * ever updated or deleted.
 */
export const animalListingRevisions = pgTable(
  'animal_listing_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => animalListings.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    action: text('action').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    reasonFa: text('reason_fa'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('animal_listing_revision_number_key').on(t.listingId, t.number)],
);

/**
 * A purchasable promotion of one advert — PROMPT-004.
 *
 * Deliberately its own pair of tables rather than a fourth target type on the
 * Phase 2 advertising subscription. An advert is promoted for a handful of days
 * and disappears when it sells; a veterinary profile is promoted for a tier
 * across a season. Sharing the table would have meant one row shape that is
 * half empty in both directions, and one ranking rule that has to know which
 * half it is looking at.
 *
 * The price is a managed setting key, never a figure stored here, so changing a
 * price is one audited settings edit and a purchase keeps what it froze.
 */
export const listingPromotionPackages = pgTable(
  'listing_promotion_package',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    labelFa: text('label_fa').notNull(),
    durationDays: integer('duration_days').notNull(),
    priceSettingKey: text('price_setting_key').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('listing_promotion_package_code_key').on(t.code)],
);

/**
 * One purchase of one package for one advert.
 *
 * A promotion buys placement among adverts that already match the search, and
 * it is labelled «تبلیغ» wherever it is shown. It never touches the seller's
 * reputation and it never changes what an advert says. It ends on its own date,
 * read at request time rather than swept by a job.
 */
export const listingPromotions = pgTable(
  'listing_promotion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => animalListings.id, { onDelete: 'restrict' }),
    packageId: uuid('package_id')
      .notNull()
      .references(() => listingPromotionPackages.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: listingPromotionStatus('status').notNull().default('PENDING_PAYMENT'),
    /** Written only when the payment is verified; a pending intent has neither. */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    durationDays: integer('duration_days'),
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReasonFa: text('cancel_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('listing_promotion_listing_idx').on(t.listingId, t.status),
    index('listing_promotion_window_idx').on(t.status, t.endsAt),
    uniqueIndex('listing_promotion_batch_key').on(t.paymentBatchId),
    // One live promotion per advert: a second purchase waits for the first to end.
    uniqueIndex('listing_promotion_live_key')
      .on(t.listingId)
      .where(sql`${t.status} in ('PENDING_PAYMENT','ACTIVE')`),
  ],
);
