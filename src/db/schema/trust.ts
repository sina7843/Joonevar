/**
 * What buyers say, ask and keep — PROMPT-012.
 *
 * A review can only exist behind a transaction that finished: an animal deal
 * that completed, or a shop sub-order that was delivered. That is not a rule
 * the screens enforce, it is the shape of the table — a review names the deal
 * or the sub-order it came out of, and the unique index means one purchase
 * yields one review. There is no path here for somebody who never bought
 * anything, and none for a seller to buy a better score.
 *
 * Nothing in this file knows about paid placement, and that is deliberate.
 * Reputation is computed from reviews and from nothing else, so no amount of
 * money can move it; a promotion buys a position in a list, never a rating.
 */
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  followSubject,
  questionStatus,
  questionSubject,
  reviewStatus,
  reviewSubject,
  savedSubject,
} from './enums.ts';
import { accounts } from './core.ts';
import { commerceSellers } from './commerce.ts';
import { commerceProducts } from './catalog.ts';
import { commerceSubOrders } from './orders.ts';
import { animalListings } from './marketplace.ts';
import { listingInquiries } from './inquiry.ts';
import { kennels } from './kennels.ts';

const now = sql`now()`;

/**
 * One review, behind one finished transaction.
 *
 * The three scores differ by subject — an animal deal is judged on whether
 * the advert was accurate, how the seller behaved and how the handover went;
 * a shop order on the goods, the packing and the delivery — so they are three
 * columns with subject-specific meaning rather than five columns half of
 * which are always null.
 */
export const reviews = pgTable(
  'review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subject: reviewSubject('subject').notNull(),
    /** Exactly one of these, and it is what makes the review a purchase. */
    inquiryId: uuid('inquiry_id').references(() => listingInquiries.id, { onDelete: 'restrict' }),
    subOrderId: uuid('suborder_id').references(() => commerceSubOrders.id, { onDelete: 'restrict' }),

    authorAccountId: uuid('author_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** Who is being reviewed, so a shop's score can be read without the orders. */
    sellerId: uuid('seller_id').references(() => commerceSellers.id, { onDelete: 'restrict' }),
    sellerAccountId: uuid('seller_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    /** The goods, so a product carries its own score across every shop selling it. */
    productId: uuid('product_id').references(() => commerceProducts.id, { onDelete: 'restrict' }),
    listingId: uuid('listing_id').references(() => animalListings.id, { onDelete: 'restrict' }),

    /** 1–5. For an animal: accuracy, behaviour, handover. For goods: product, packing, delivery. */
    scoreOne: smallint('score_one').notNull(),
    scoreTwo: smallint('score_two').notNull(),
    scoreThree: smallint('score_three').notNull(),
    bodyFa: text('body_fa'),

    status: reviewStatus('status').notNull().default('PUBLISHED'),
    hiddenReasonFa: text('hidden_reason_fa'),
    hiddenByAccountId: uuid('hidden_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** The shop's public answer. It never changes the score. */
    replyFa: text('reply_fa'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One purchase, one review. A second would be the same buyer counted twice.
    uniqueIndex('review_deal_key').on(t.inquiryId).where(sql`${t.inquiryId} is not null`),
    uniqueIndex('review_suborder_key').on(t.subOrderId).where(sql`${t.subOrderId} is not null`),
    index('review_product_idx').on(t.productId, t.status),
    index('review_seller_idx').on(t.sellerId, t.status),
    index('review_author_idx').on(t.authorAccountId, t.createdAt),
    check(
      'review_scores_in_range',
      sql`${t.scoreOne} between 1 and 5 and ${t.scoreTwo} between 1 and 5 and ${t.scoreThree} between 1 and 5`,
    ),
    // A review is about one transaction. Neither both nor neither.
    check(
      'review_one_subject',
      sql`(${t.inquiryId} is not null)::int + (${t.subOrderId} is not null)::int = 1`,
    ),
  ],
);

/**
 * A question somebody asked, and the answer if one came.
 *
 * Asked publicly and shown only once a moderator has looked, because a
 * question is a place where a telephone number goes to be seen by strangers.
 */
export const questions = pgTable(
  'commerce_question',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subject: questionSubject('subject').notNull(),
    sellerId: uuid('seller_id').references(() => commerceSellers.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => commerceProducts.id, { onDelete: 'cascade' }),
    askedByAccountId: uuid('asked_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    bodyFa: text('body_fa').notNull(),
    status: questionStatus('status').notNull().default('PENDING'),
    decisionReasonFa: text('decision_reason_fa'),
    answerFa: text('answer_fa'),
    answeredByAccountId: uuid('answered_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('question_product_idx').on(t.productId, t.status),
    index('question_seller_idx').on(t.sellerId, t.status),
    index('question_queue_idx').on(t.status, t.createdAt),
    check(
      'question_one_subject',
      sql`(${t.sellerId} is not null)::int + (${t.productId} is not null)::int = 1`,
    ),
  ],
);

/** Something kept for later: one advert, or one product. */
export const savedItems = pgTable(
  'saved_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    subject: savedSubject('subject').notNull(),
    listingId: uuid('listing_id').references(() => animalListings.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => commerceProducts.id, { onDelete: 'cascade' }),
    /**
     * What it cost when it was saved, so a drop is measured against what this
     * person actually saw rather than against whatever it happened to be.
     */
    savedPriceToman: bigint('saved_price_toman', { mode: 'bigint' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('saved_item_listing_key')
      .on(t.accountId, t.listingId)
      .where(sql`${t.listingId} is not null`),
    uniqueIndex('saved_item_product_key')
      .on(t.accountId, t.productId)
      .where(sql`${t.productId} is not null`),
    index('saved_item_account_idx').on(t.accountId, t.createdAt),
    check(
      'saved_item_one_subject',
      sql`(${t.listingId} is not null)::int + (${t.productId} is not null)::int = 1`,
    ),
  ],
);

/** Following a shop or a kennel, so its new things reach the follower. */
export const follows = pgTable(
  'account_follow',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    subject: followSubject('subject').notNull(),
    sellerId: uuid('seller_id').references(() => commerceSellers.id, { onDelete: 'cascade' }),
    kennelId: uuid('kennel_id').references(() => kennels.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('account_follow_seller_key')
      .on(t.accountId, t.sellerId)
      .where(sql`${t.sellerId} is not null`),
    uniqueIndex('account_follow_kennel_key')
      .on(t.accountId, t.kennelId)
      .where(sql`${t.kennelId} is not null`),
    index('account_follow_subject_idx').on(t.subject, t.sellerId),
    check(
      'account_follow_one_subject',
      sql`(${t.sellerId} is not null)::int + (${t.kennelId} is not null)::int = 1`,
    ),
  ],
);

/**
 * What somebody looked at lately.
 *
 * Kept only as long as the configured retention says, and only for a signed-in
 * person who has not turned it off — a browsing history is the most personal
 * thing a shop holds, so it is the one thing here with a deletion date and a
 * switch. One row per person per thing, moved forward rather than appended, so
 * the history never becomes a log of when somebody was awake.
 */
export const recentViews = pgTable(
  'recent_view',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    subject: savedSubject('subject').notNull(),
    listingId: uuid('listing_id').references(() => animalListings.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => commerceProducts.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('recent_view_listing_key')
      .on(t.accountId, t.listingId)
      .where(sql`${t.listingId} is not null`),
    uniqueIndex('recent_view_product_key')
      .on(t.accountId, t.productId)
      .where(sql`${t.productId} is not null`),
    index('recent_view_account_idx').on(t.accountId, t.viewedAt),
    index('recent_view_retention_idx').on(t.viewedAt),
    check(
      'recent_view_one_subject',
      sql`(${t.listingId} is not null)::int + (${t.productId} is not null)::int = 1`,
    ),
  ],
);

/**
 * What this person has turned off.
 *
 * One row per account, made when they first choose something. Absence means
 * the ordinary defaults, so nobody has to be given a row to be treated
 * properly.
 */
export const accountPreferences = pgTable('account_preference', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  /** Recommendations stop, and so does the history they would have been built from. */
  recommendationsOff: boolean('recommendations_off').notNull().default(false),
  historyOff: boolean('history_off').notNull().default(false),
  priceAlertsOff: boolean('price_alerts_off').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
});
