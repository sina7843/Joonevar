/**
 * An account's own payments — Phase 2.5 §9 (PROMPT-015).
 *
 * Every payment screen so far answered "what is this one batch", which is what
 * a flow needs and not what a person needs: there was no way to see what you
 * had paid for, when, and whether it went through. This is that list, and the
 * receipt behind one line of it.
 *
 * The authority is the same everywhere: a batch belongs to one account, and a
 * request for somebody else's is not found rather than refused, so the list
 * cannot be used to learn that a payment exists.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { paymentAttempts, paymentBatches, paymentItems } from '../db/schema/billing.ts';
import { notFound } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page, type PageRequest } from '../domain/pagination.ts';
import { toman } from '../domain/money.ts';
import type { Actor } from '../authz/actor.ts';
import type { PaymentService } from './payments.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What each paid service is called where a person reads it. */
export const PAYMENT_SERVICE_FA: Record<PaymentService, string> = {
  MEMBERSHIP: 'عضویت انجمن',
  REGISTRATION_SHEET: 'برگه ثبتی',
  PEDIGREE: 'شجره‌نامه',
  MATING_PERMIT: 'مجوز جفت‌گیری',
  KENNEL_REGISTRATION: 'ثبت کنل',
  PUPPY_CARD: 'کارت توله',
  ADVERTISING_PACKAGE: 'بسته تبلیغاتی',
  VET_LICENSE_ACTIVATION: 'فعال‌سازی پروانه فعالیت',
  VET_LICENSE_RENEWAL: 'تمدید پروانه فعالیت',
  TRUSTED_VET_ACTIVATION: 'فعال‌سازی دامپزشک معتمد',
  TRUSTED_VET_RENEWAL: 'تمدید دامپزشک معتمد',
  CLUB_MEMBERSHIP: 'حق عضویت کلاب',
};

export const PAYMENT_STATUS_FA: Record<string, string> = {
  DRAFT: 'آماده پرداخت',
  AWAITING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  FAILED: 'ناموفق',
  CANCELLED: 'لغوشده',
};

export interface ReceiptLine {
  readonly batchId: string;
  readonly service: PaymentService;
  readonly serviceFa: string;
  readonly status: string;
  readonly statusFa: string;
  readonly totalToman: bigint;
  readonly items: number;
  readonly createdAt: Date;
  /** Where the flow this payment belongs to continues. */
  readonly originRoute: string;
  readonly providerRef: string | null;
  readonly paidAt: Date | null;
}

/** The account's payments, newest first. Only its own: the filter is the account id. */
export async function myPayments(database: DbClient, actor: Actor, request: PageRequest): Promise<Page<ReceiptLine>> {
  const rows = await database
    .select()
    .from(paymentBatches)
    .where(eq(paymentBatches.accountId, actor.accountId))
    .orderBy(desc(paymentBatches.createdAt))
    .limit(request.pageSize)
    .offset(offsetOf(request));
  const all = await database
    .select({ id: paymentBatches.id })
    .from(paymentBatches)
    .where(eq(paymentBatches.accountId, actor.accountId));
  if (rows.length === 0) return pageOf([], all.length, request);

  const ids = rows.map((row) => row.id);
  const [items, attempts] = await Promise.all([
    database.select().from(paymentItems).where(inArray(paymentItems.batchId, ids)),
    database
      .select()
      .from(paymentAttempts)
      .where(inArray(paymentAttempts.batchId, ids))
      .orderBy(desc(paymentAttempts.startedAt)),
  ]);

  const lines: ReceiptLine[] = rows.map((batch) => {
    const mine = items.filter((item) => item.batchId === batch.id);
    const verified = attempts.find((attempt) => attempt.batchId === batch.id && attempt.status === 'VERIFIED');
    const resume = batch.resumeContext as { originRoute?: string };
    return {
      batchId: batch.id,
      service: batch.service as PaymentService,
      serviceFa: PAYMENT_SERVICE_FA[batch.service as PaymentService] ?? batch.service,
      status: batch.status,
      statusFa: PAYMENT_STATUS_FA[batch.status] ?? batch.status,
      totalToman: mine.reduce((total, item) => total + toman(item.amountToman), 0n),
      items: mine.length,
      createdAt: batch.createdAt,
      originRoute: typeof resume.originRoute === 'string' ? resume.originRoute : '/dashboard',
      providerRef: verified?.providerRef ?? null,
      paidAt: verified?.settledAt ?? null,
    };
  });
  return pageOf(lines, all.length, request);
}

export interface ReceiptDetail extends ReceiptLine {
  readonly lines: ReadonlyArray<{ targetType: string; targetId: string; amountToman: bigint; priceSource: string }>;
  readonly attempts: ReadonlyArray<{ provider: string; status: string; startedAt: Date; failureReason: string | null }>;
}

/** One receipt. Somebody else's batch is not found, which is also the answer for an unknown id. */
export async function myReceipt(database: DbClient, actor: Actor, batchId: string): Promise<ReceiptDetail> {
  if (!UUID.test(batchId)) throw notFound('پرداخت پیدا نشد.');
  const [batch] = await database
    .select()
    .from(paymentBatches)
    .where(and(eq(paymentBatches.id, batchId), eq(paymentBatches.accountId, actor.accountId)))
    .limit(1);
  if (!batch) throw notFound('پرداخت پیدا نشد.');

  const [items, attempts] = await Promise.all([
    database.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id)),
    database.select().from(paymentAttempts).where(eq(paymentAttempts.batchId, batch.id)).orderBy(desc(paymentAttempts.startedAt)),
  ]);
  const verified = attempts.find((attempt) => attempt.status === 'VERIFIED');
  const resume = batch.resumeContext as { originRoute?: string };

  return {
    batchId: batch.id,
    service: batch.service as PaymentService,
    serviceFa: PAYMENT_SERVICE_FA[batch.service as PaymentService] ?? batch.service,
    status: batch.status,
    statusFa: PAYMENT_STATUS_FA[batch.status] ?? batch.status,
    totalToman: items.reduce((total, item) => total + toman(item.amountToman), 0n),
    items: items.length,
    createdAt: batch.createdAt,
    originRoute: typeof resume.originRoute === 'string' ? resume.originRoute : '/dashboard',
    providerRef: verified?.providerRef ?? null,
    paidAt: verified?.settledAt ?? null,
    lines: items.map((item) => ({
      targetType: item.targetType,
      targetId: item.targetId,
      amountToman: toman(item.amountToman),
      priceSource: item.priceSource,
    })),
    // The provider's name and the reason it gave; no key, no payload.
    attempts: attempts.map((attempt) => ({
      provider: attempt.provider,
      status: attempt.status,
      startedAt: attempt.startedAt,
      failureReason: attempt.failureReason,
    })),
  };
}
