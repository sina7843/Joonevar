/**
 * Forgetting on time, and handing somebody their own record — PROMPT-013.
 *
 * Two obligations that look opposite and are the same one: a person should be
 * able to see what is held about them, and what is held about them should
 * stop being held when it stops being needed.
 *
 * Every sweep here is read-time and idempotent, like the rest of this phase.
 * Nothing runs on a timer, and an unconfigured retention period deletes
 * nothing — a period nobody entered is not a licence to delete, and it is not
 * a licence to keep for ever either, which is why the screens say when a
 * period is missing.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { commerceOrders, commerceSubOrders } from '../db/schema/orders.ts';
import { listingInquiries } from '../db/schema/inquiry.ts';
import { reviews, savedItems } from '../db/schema/trust.ts';
import { loyaltyEntries } from '../db/schema/promotions.ts';
import { auditEvents } from '../db/schema/core.ts';
import { forbidden, notFound } from '../domain/errors.ts';
import { recordAudit } from '../audit/service.ts';
import type { Actor } from '../authz/actor.ts';
import { purgeOldViews } from '../commerce/saved.ts';
import { purgeOldWindows } from './rate-limit.ts';
import { maskTail } from './redaction.ts';

export interface SweepOutcome {
  readonly recentViews: number;
  readonly rateLimitWindows: number;
}

/**
 * Forget what the retention periods say to forget.
 *
 * Both of these are things the product keeps only to do a job that is over:
 * a browsing history past its period, and a rate-limit counter whose window
 * closed. Neither is evidence of anything and neither is anybody's record.
 */
export async function runRetentionSweeps(database: Database, now: Date = new Date()): Promise<SweepOutcome> {
  return {
    recentViews: await purgeOldViews(database, now),
    rateLimitWindows: await purgeOldWindows(database, now),
  };
}

export interface AccountExport {
  readonly accountId: string;
  readonly maskedMobile: string;
  readonly exportedAt: string;
  readonly orders: readonly {
    reference: string;
    status: string;
    grandTotalToman: string;
    placedAt: string;
  }[];
  readonly animalDeals: readonly { status: string; createdAt: string }[];
  readonly reviews: readonly { subject: string; scores: readonly number[]; bodyFa: string | null; createdAt: string }[];
  readonly savedItems: readonly { productId: string | null; listingId: string | null; createdAt: string }[];
  readonly loyalty: readonly { kind: string; points: number; descriptionFa: string; createdAt: string }[];
  readonly noteFa: string;
}

/**
 * What Hamzist holds about one person, as they may take it.
 *
 * Their own records, in the shape they already see on their own screens. Two
 * things are deliberately not here: anything about somebody else that happens
 * to sit on the same row — a seller's name on an order is fine, a seller's
 * telephone number is not — and the account's own mobile in full, because an
 * export is a file that travels and the person reading it already knows their
 * own number.
 *
 * An operator may take it on somebody's behalf, and that is audited; nobody
 * may take anybody else's.
 */
export async function exportAccount(
  database: Database,
  actor: Actor,
  accountId: string,
): Promise<AccountExport> {
  const own = actor.accountId === accountId;
  if (!own) {
    // Somebody else's record is only reachable by the capability support
    // actually holds, and taking it is audited below.
    const { hasMarketplaceCapability } = await import('../marketplace/model.ts');
    if (!hasMarketplaceCapability(actor, 'ORDER_VIEW')) {
      throw forbidden('خروجی داده فقط برای خود فرد یا با اختیار پشتیبانی ممکن است.');
    }
  }

  const [account] = await database
    .select({ id: accounts.id, mobile: accounts.mobile })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) throw notFound('این حساب پیدا نشد.');

  const orders = await database
    .select({
      reference: commerceOrders.reference,
      status: commerceOrders.status,
      grandTotalToman: commerceOrders.grandTotalToman,
      placedAt: commerceOrders.createdAt,
    })
    .from(commerceOrders)
    .where(eq(commerceOrders.buyerAccountId, accountId))
    .orderBy(desc(commerceOrders.createdAt))
    .limit(500);

  const deals = await database
    .select({ status: listingInquiries.status, createdAt: listingInquiries.createdAt })
    .from(listingInquiries)
    .where(eq(listingInquiries.buyerAccountId, accountId))
    .orderBy(desc(listingInquiries.createdAt))
    .limit(500);

  const written = await database
    .select({
      subject: reviews.subject,
      one: reviews.scoreOne,
      two: reviews.scoreTwo,
      three: reviews.scoreThree,
      bodyFa: reviews.bodyFa,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(eq(reviews.authorAccountId, accountId))
    .limit(500);

  const saved = await database
    .select({
      productId: savedItems.productId,
      listingId: savedItems.listingId,
      createdAt: savedItems.createdAt,
    })
    .from(savedItems)
    .where(eq(savedItems.accountId, accountId))
    .limit(500);

  const points = await database
    .select({
      kind: loyaltyEntries.kind,
      points: loyaltyEntries.points,
      descriptionFa: loyaltyEntries.descriptionFa,
      createdAt: loyaltyEntries.createdAt,
    })
    .from(loyaltyEntries)
    .where(eq(loyaltyEntries.accountId, accountId))
    .orderBy(desc(loyaltyEntries.createdAt))
    .limit(500);

  if (!own) {
    await recordAudit(database, actor, {
      action: 'ACCOUNT_DATA_EXPORTED',
      targetType: 'ACCOUNT',
      targetId: accountId,
      after: { onBehalf: true, orders: orders.length, deals: deals.length },
    });
  }

  return {
    accountId,
    maskedMobile: maskTail(account.mobile),
    exportedAt: new Date().toISOString(),
    orders: orders.map((row) => ({
      reference: row.reference,
      status: row.status,
      grandTotalToman: row.grandTotalToman.toString(),
      placedAt: row.placedAt.toISOString(),
    })),
    animalDeals: deals.map((row) => ({ status: row.status, createdAt: row.createdAt.toISOString() })),
    reviews: written.map((row) => ({
      subject: row.subject,
      scores: [row.one, row.two, row.three],
      bodyFa: row.bodyFa,
      createdAt: row.createdAt.toISOString(),
    })),
    savedItems: saved.map((row) => ({
      productId: row.productId,
      listingId: row.listingId,
      createdAt: row.createdAt.toISOString(),
    })),
    loyalty: points.map((row) => ({
      kind: row.kind,
      points: row.points,
      descriptionFa: row.descriptionFa,
      createdAt: row.createdAt.toISOString(),
    })),
    noteFa:
      'این خروجی، رکوردهای خود شماست. اطلاعات شخصی دیگران و مدارک خصوصی در آن نیست و شماره تماس شما به‌صورت کامل نوشته نشده است.',
  };
}

/**
 * How many audit rows one record has, so an operator can see that a decision
 * was written down without reading what it said.
 */
export async function auditDepth(database: Database, targetType: string, targetId: string): Promise<number> {
  const rows = await database
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetType, targetType), eq(auditEvents.targetId, targetId)));
  return rows.length;
}
