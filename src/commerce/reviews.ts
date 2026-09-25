/**
 * What buyers say, and only buyers — PROMPT-012.
 *
 * A review exists because a transaction finished: an animal deal that
 * completed, or a shop sub-order that was delivered. The eligibility is read
 * from those records rather than from anything the reviewer claims, and the
 * unique index means one purchase yields one review.
 *
 * Reputation is computed from published reviews and from nothing else. No
 * function here takes a promotion, a plan or a spend, so there is no argument
 * through which money could move a score — a promotion buys a place in a
 * list, never a rating.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { reviews } from '../db/schema/trust.ts';
import { commerceOrderItems, commerceOrders, commerceSubOrders } from '../db/schema/orders.ts';
import { listingInquiries } from '../db/schema/inquiry.ts';
import { animalListings } from '../db/schema/marketplace.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt } from '../settings/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { assertMarketplaceCapability } from '../marketplace/model.ts';
import type { Actor } from '../authz/actor.ts';
import { assertSellerCapability, membershipOf } from './sellers.ts';
import { assertWithinLimit } from '../security/rate-limit.ts';
import {
  aggregateOf,
  reviewBlockers,
  REVIEW_BLOCKER_FA,
  REVIEW_DIMENSIONS,
  type Aggregate,
  type ReviewBlocker,
  type ReviewSubject,
} from './trust-model.ts';

export type ReviewRow = typeof reviews.$inferSelect;

export const REVIEW_WINDOW_KEY = 'market.shop.review_window_days';

interface Eligibility {
  readonly blockers: readonly ReviewBlocker[];
  readonly subject: ReviewSubject;
  readonly sellerId: string | null;
  readonly sellerAccountId: string | null;
  readonly productId: string | null;
  readonly listingId: string | null;
}

/**
 * Whether this person may review this purchase, and what it is a purchase of.
 *
 * Both paths answer the same question from their own record: a deal is
 * reviewable once it says COMPLETED, a sub-order once it says DELIVERED.
 * Neither asks anything about the reviewer beyond whether they are the buyer.
 */
export async function reviewEligibility(
  database: DbClient,
  actor: Actor,
  input: { inquiryId?: string; subOrderId?: string },
  now: Date = new Date(),
): Promise<Eligibility> {
  const windowDays = await readInt(database, REVIEW_WINDOW_KEY).catch(() => null);

  if (input.inquiryId) {
    const [row] = await database
      .select({
        inquiry: listingInquiries,
        listingId: animalListings.id,
        sellerAccountId: animalListings.sellerAccountId,
      })
      .from(listingInquiries)
      .innerJoin(animalListings, eq(animalListings.id, listingInquiries.listingId))
      .where(eq(listingInquiries.id, input.inquiryId))
      .limit(1);
    if (!row) throw notFound('این معامله پیدا نشد.');
    const existing = await database
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.inquiryId, input.inquiryId))
      .limit(1);
    return {
      subject: 'ANIMAL_DEAL',
      blockers: reviewBlockers({
        isBuyer: row.inquiry.buyerAccountId === actor.accountId,
        finished: row.inquiry.status === 'COMPLETED',
        alreadyReviewed: existing.length > 0,
        finishedAt: row.inquiry.updatedAt,
        windowDays,
        now,
      }),
      sellerId: null,
      sellerAccountId: row.sellerAccountId,
      productId: null,
      listingId: row.listingId,
    };
  }

  if (!input.subOrderId) throw validation('موضوع نظر مشخص نیست.');
  const [row] = await database
    .select({ subOrder: commerceSubOrders, buyerAccountId: commerceOrders.buyerAccountId })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .where(eq(commerceSubOrders.id, input.subOrderId))
    .limit(1);
  if (!row) throw notFound('این زیرسفارش پیدا نشد.');
  const existing = await database
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.subOrderId, input.subOrderId))
    .limit(1);
  return {
    subject: 'COMMERCE_SUBORDER',
    blockers: reviewBlockers({
      isBuyer: row.buyerAccountId === actor.accountId,
      // Delivered, or delivered and then partly returned: the goods arrived
      // either way, and somebody who sent one of three things back has as
      // much standing to say so as anybody.
      finished: ['DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'].includes(row.subOrder.status),
      alreadyReviewed: existing.length > 0,
      finishedAt: row.subOrder.deliveredAt,
      windowDays,
      now,
    }),
    sellerId: row.subOrder.sellerId,
    sellerAccountId: null,
    productId: null,
    listingId: null,
  };
}

export interface ReviewInput {
  readonly inquiryId?: string;
  readonly subOrderId?: string;
  /** Which product of the sub-order this is about; the whole order if omitted. */
  readonly productId?: string | null;
  readonly scoreOne: number;
  readonly scoreTwo: number;
  readonly scoreThree: number;
  readonly bodyFa: string | null;
}

/** Leave a review, if the purchase behind it says one may be left. */
export async function leaveReview(
  database: Database,
  actor: Actor,
  input: ReviewInput,
): Promise<ReviewRow> {
  if (!actor.accountId) throw forbidden('برای ثبت نظر باید وارد حساب شوید.');
  for (const score of [input.scoreOne, input.scoreTwo, input.scoreThree]) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw validation('هر امتیاز باید عددی بین ۱ تا ۵ باشد.');
    }
  }
  const bodyFa = (input.bodyFa ?? '').trim();
  if (bodyFa.length > 0 && bodyFa.length < 5) throw validation('متن نظر را کامل‌تر بنویسید یا خالی بگذارید.');

  await assertWithinLimit(database, { action: 'REVIEW_SUBMIT', actor });

  const eligibility = await reviewEligibility(database, actor, {
    inquiryId: input.inquiryId,
    subOrderId: input.subOrderId,
  });
  if (eligibility.blockers.length > 0) {
    throw conflict(REVIEW_BLOCKER_FA[eligibility.blockers[0]!], { blockers: eligibility.blockers });
  }

  // The product this is about, checked against the sub-order it came from so
  // nobody can attach a review to goods they did not buy. A sub-order of one
  // product needs no choosing: reviewing an order of one thing is reviewing
  // that thing.
  let productId: string | null = null;
  if (input.subOrderId && !input.productId) {
    const distinct = await database
      .selectDistinct({ productId: commerceOrderItems.productId })
      .from(commerceOrderItems)
      .where(eq(commerceOrderItems.subOrderId, input.subOrderId));
    if (distinct.length === 1) productId = distinct[0]!.productId;
  }
  if (input.subOrderId && input.productId) {
    const [item] = await database
      .select({ productId: commerceOrderItems.productId })
      .from(commerceOrderItems)
      .where(
        and(
          eq(commerceOrderItems.subOrderId, input.subOrderId),
          eq(commerceOrderItems.productId, input.productId),
        ),
      )
      .limit(1);
    if (!item) throw conflict('این کالا در این زیرسفارش نبوده است.');
    productId = item.productId;
  }

  const [row] = await database
    .insert(reviews)
    .values({
      subject: eligibility.subject,
      inquiryId: input.inquiryId ?? null,
      subOrderId: input.subOrderId ?? null,
      authorAccountId: actor.accountId,
      sellerId: eligibility.sellerId,
      sellerAccountId: eligibility.sellerAccountId,
      productId,
      listingId: eligibility.listingId,
      scoreOne: input.scoreOne,
      scoreTwo: input.scoreTwo,
      scoreThree: input.scoreThree,
      bodyFa: bodyFa || null,
    })
    .returning();

  await recordAudit(database, actor, {
    action: 'COMMERCE_REVIEW_LEFT',
    targetType: eligibility.subject === 'ANIMAL_DEAL' ? 'LISTING_INQUIRY' : 'COMMERCE_SUBORDER',
    targetId: (input.inquiryId ?? input.subOrderId)!,
    after: {
      reviewId: row!.id,
      scores: [input.scoreOne, input.scoreTwo, input.scoreThree],
      hasBody: bodyFa.length > 0,
    },
  });
  return row!;
}

/** The shop's public answer. It never changes the score, and says so by not touching it. */
export async function replyToReview(
  database: Database,
  actor: Actor,
  input: { reviewId: string; replyFa: string },
): Promise<ReviewRow> {
  const row = await loadReview(database, input.reviewId);
  const replyFa = input.replyFa.trim();
  if (replyFa.length < 5) throw validation('پاسخ را کامل‌تر بنویسید.');
  if (row.sellerId !== null) {
    await assertSellerCapability(database, actor, row.sellerId, 'STORE_OPERATE');
  } else if (row.sellerAccountId !== actor.accountId) {
    throw notFound('این نظر پیدا نشد.');
  }
  if (row.replyFa !== null) throw conflict('برای این نظر یک پاسخ ثبت شده است.');

  const [updated] = await database
    .update(reviews)
    .set({ replyFa, repliedAt: new Date(), version: row.version + 1, updatedAt: new Date() })
    .where(and(eq(reviews.id, row.id), eq(reviews.version, row.version)))
    .returning();
  if (!updated) throw conflict('این نظر در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await createNotification(database, {
    recipientAccountId: row.authorAccountId,
    kind: 'COMMERCE_REVIEW_REPLIED',
    titleFa: 'به نظر شما پاسخ داده شد',
    bodyFa: replyFa.slice(0, 120),
    resume: {
      entity: { type: 'COMMERCE_REVIEW', id: row.id },
      step: 'REPLY',
      originRoute: '/account/reviews',
    },
  });
  return updated;
}

/**
 * Hide a review, with a reason.
 *
 * Hiding takes it out of the average, which is why only a moderator may do it
 * and why the reason is required: a shop that could quietly remove what it
 * did not like would have a rating that means nothing.
 */
export async function moderateReview(
  database: Database,
  actor: Actor,
  input: { reviewId: string; to: 'PUBLISHED' | 'HIDDEN' | 'REMOVED'; reasonFa: string },
): Promise<ReviewRow> {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa.length < 5) throw validation('دلیل این تصمیم را بنویسید.');
  const row = await loadReview(database, input.reviewId);

  const [updated] = await database
    .update(reviews)
    .set({
      status: input.to,
      hiddenReasonFa: input.to === 'PUBLISHED' ? null : reasonFa,
      hiddenByAccountId: input.to === 'PUBLISHED' ? null : actor.accountId,
      version: row.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(reviews.id, row.id), eq(reviews.version, row.version)))
    .returning();
  if (!updated) throw conflict('این نظر در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'COMMERCE_REVIEW_MODERATED',
    targetType: 'COMMERCE_REVIEW',
    targetId: row.id,
    targetVersion: row.version + 1,
    before: { status: row.status },
    after: { status: input.to, reasonFa },
  });
  return updated;
}

export async function loadReview(database: DbClient, reviewId: string): Promise<ReviewRow> {
  const [row] = await database.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
  if (!row) throw notFound('این نظر پیدا نشد.');
  return row;
}

/**
 * One product's reputation, from its published reviews.
 *
 * The query takes no argument that money could influence. That is the whole
 * guarantee: not a rule that promotions are ignored, but no place to put one.
 */
export async function productAggregate(database: DbClient, productId: string): Promise<Aggregate> {
  const rows = await database
    .select({ one: reviews.scoreOne, two: reviews.scoreTwo, three: reviews.scoreThree })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, 'PUBLISHED')));
  return aggregateOf(rows);
}

export async function sellerAggregate(database: DbClient, sellerId: string): Promise<Aggregate> {
  const rows = await database
    .select({ one: reviews.scoreOne, two: reviews.scoreTwo, three: reviews.scoreThree })
    .from(reviews)
    .where(and(eq(reviews.sellerId, sellerId), eq(reviews.status, 'PUBLISHED')));
  return aggregateOf(rows);
}

/** Several products' reputations at once, for a list that shows stars. */
export async function productAggregates(
  database: DbClient,
  productIds: readonly string[],
): Promise<Map<string, Aggregate>> {
  const unique = [...new Set(productIds)];
  if (unique.length === 0) return new Map();
  const rows = await database
    .select({
      productId: reviews.productId,
      one: reviews.scoreOne,
      two: reviews.scoreTwo,
      three: reviews.scoreThree,
    })
    .from(reviews)
    .where(and(inArray(reviews.productId, unique), eq(reviews.status, 'PUBLISHED')));

  const byProduct = new Map<string, { one: number; two: number; three: number }[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId!) ?? [];
    list.push({ one: row.one, two: row.two, three: row.three });
    byProduct.set(row.productId!, list);
  }
  return new Map([...byProduct].map(([productId, scores]) => [productId, aggregateOf(scores)]));
}

export interface ReviewView {
  readonly row: ReviewRow;
  readonly dimensionsFa: readonly [string, string, string];
}

const viewOf = (row: ReviewRow): ReviewView => ({
  row,
  dimensionsFa: REVIEW_DIMENSIONS[row.subject as ReviewSubject],
});

/** What the public reads under one product. */
export async function reviewsOfProduct(database: DbClient, productId: string) {
  const rows = await database
    .select()
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, 'PUBLISHED')))
    .orderBy(desc(reviews.createdAt))
    .limit(50);
  return rows.map(viewOf);
}

/** What one shop has been told, including what it has already answered. */
export async function reviewsOfSeller(database: Database, actor: Actor, sellerId: string) {
  await assertSellerCapability(database, actor, sellerId, 'STORE_VIEW');
  const rows = await database
    .select()
    .from(reviews)
    .where(eq(reviews.sellerId, sellerId))
    .orderBy(desc(reviews.createdAt))
    .limit(50);
  return rows.map(viewOf);
}

/** This person's own reviews. */
export async function myReviews(database: Database, actor: Actor) {
  if (!actor.accountId) throw forbidden('برای دیدن نظرها باید وارد حساب شوید.');
  const rows = await database
    .select()
    .from(reviews)
    .where(eq(reviews.authorAccountId, actor.accountId))
    .orderBy(desc(reviews.createdAt))
    .limit(50);
  return rows.map(viewOf);
}

/** Everything a moderator may look at, newest first. */
export async function reviewQueue(database: Database, actor: Actor) {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');
  const rows = await database
    .select({ review: reviews, sellerNameFa: commerceSellers.displayNameFa })
    .from(reviews)
    .leftJoin(commerceSellers, eq(commerceSellers.id, reviews.sellerId))
    .orderBy(desc(reviews.createdAt))
    .limit(100);
  return rows.map((row) => ({ ...viewOf(row.review), sellerNameFa: row.sellerNameFa ?? null }));
}

/**
 * The purchases this person could still review.
 *
 * Read from the transactions themselves, so the list is the eligibility
 * rather than a copy of it that could fall out of step.
 */
export async function reviewablePurchases(database: Database, actor: Actor) {
  if (!actor.accountId) throw forbidden('برای دیدن خریدها باید وارد حساب شوید.');
  const subOrders = await database
    .select({
      subOrderId: commerceSubOrders.id,
      reference: commerceSubOrders.reference,
      sellerNameFa: commerceSellers.displayNameFa,
      deliveredAt: commerceSubOrders.deliveredAt,
      reviewId: reviews.id,
    })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .innerJoin(commerceSellers, eq(commerceSellers.id, commerceSubOrders.sellerId))
    .leftJoin(reviews, eq(reviews.subOrderId, commerceSubOrders.id))
    .where(
      and(
        eq(commerceOrders.buyerAccountId, actor.accountId),
        sql`${commerceSubOrders.status} in ('DELIVERED','RETURN_REQUESTED','RETURNED','REFUNDED')`,
      ),
    )
    .orderBy(desc(commerceSubOrders.deliveredAt))
    .limit(50);

  return subOrders
    .filter((row) => row.reviewId === null)
    .map((row) => ({
      subOrderId: row.subOrderId,
      reference: row.reference,
      sellerNameFa: row.sellerNameFa ?? 'فروشگاه',
      deliveredAt: row.deliveredAt,
    }));
}
