/**
 * Sending the deposit back — PROMPT-006.
 *
 * A refund here is a record, not an action that happens because somebody
 * pressed a button. It is created owed, attempted against the gateway, and
 * ends up paid, failed or needing a person — and every one of those attempts
 * leaves a row saying which provider answered and what it said.
 *
 * Three rules this module keeps:
 *
 *  - **Nothing is assumed.** `PAID` requires a provider reference from an
 *    attempt that actually returned one. A gateway with no refund support here
 *    produces `MANUAL_REQUIRED`, which is the truth: the money is owed and a
 *    finance operator has to send it.
 *  - **Retrying is safe.** Each attempt carries its own idempotency key and the
 *    record moves through `PROCESSING` under a version guard, so two operators
 *    pressing retry together produce one attempt, not two refunds.
 *  - **Failure is kept.** A failed attempt keeps its error in the words the
 *    operator will read, and the record stays retryable until it has been tried
 *    enough times to need a human instead of a loop.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Database, DbClient } from '../db/client.ts';
import { depositRefundAttempts, depositRefunds } from '../db/schema/deals.ts';
import { listingInquiries } from '../db/schema/inquiry.ts';
import { accounts } from '../db/schema/core.ts';
import { animals } from '../db/schema/animals.ts';
import { animalListings } from '../db/schema/marketplace.ts';
import { latestAttempt } from '../billing/payments.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { tomanToRial } from '../domain/money.ts';
import { resumeContext, type ResumeContext } from '../domain/resume-context.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import type { PaymentGateway } from '../adapters/registry.ts';
import { assertMarketplaceCapability } from './model.ts';
import { MAX_AUTOMATIC_REFUND_ATTEMPTS, refundRetryable } from './cancellation-model.ts';

export type RefundRow = typeof depositRefunds.$inferSelect;

export interface OpenRefundInput {
  /** The animal deal this money came out of, when that is what it was. */
  readonly inquiryId: string | null;
  /** The shop sub-order it came out of, when that is what it was (PROMPT-010). */
  readonly subOrderId?: string | null;
  readonly cancellationId: string | null;
  readonly paymentBatchId: string;
  readonly recipientAccountId: string;
  readonly amountToman: bigint;
}

/**
 * Record that money is owed.
 *
 * Called from inside the transaction that decided it — a cancellation or a
 * dispute — so a decision and the debt it creates are one event. Executing it
 * is a separate step on purpose.
 */
export async function openRefund(tx: DbClient, input: OpenRefundInput): Promise<string> {
  if (input.amountToman <= 0n) throw validation('مبلغ استرداد باید بزرگ‌تر از صفر باشد.');
  const subOrderId = input.subOrderId ?? null;
  // One subject, always: the database enforces it, and saying so here means a
  // caller finds out at the call rather than through a constraint name.
  if ((input.inquiryId === null) === (subOrderId === null)) {
    throw validation('هر استرداد دقیقاً به یک معامله یا یک زیرسفارش تعلق دارد.');
  }
  const [row] = await tx
    .insert(depositRefunds)
    .values({
      inquiryId: input.inquiryId,
      subOrderId,
      cancellationId: input.cancellationId,
      paymentBatchId: input.paymentBatchId,
      recipientAccountId: input.recipientAccountId,
      amountToman: input.amountToman,
    })
    .returning({ id: depositRefunds.id });

  await recordAudit(tx, null, {
    action: subOrderId === null ? 'ANIMAL_DEPOSIT_REFUND_OPENED' : 'COMMERCE_ORDER_REFUND_OPENED',
    targetType: 'DEPOSIT_REFUND',
    targetId: row!.id,
    after: {
      inquiryId: input.inquiryId,
      subOrderId,
      cancellationId: input.cancellationId,
      amountToman: input.amountToman.toString(),
    },
  });
  return row!.id;
}

/**
 * Where this money came from, in the words and the address of that place.
 *
 * The record is shared between the animal deposit and the shop order, so the
 * one thing that must not be shared is the sentence the recipient reads: being
 * told a deposit came back when it was an order would be worse than saying
 * nothing.
 */
function refundSubject(refund: RefundRow): { titleFa: string; bodyFa: string; resume: ResumeContext } {
  if (refund.subOrderId !== null) {
    return {
      titleFa: 'مبلغ بخشی از سفارش شما بازگردانده شد',
      bodyFa:
        'مبلغ ' +
        refund.amountToman.toLocaleString('fa-IR') +
        ' تومان بابت زیرسفارشی که انجام نشد، به همان روش پرداخت بازگردانده شد.',
      resume: resumeContext({
        entity: { type: 'COMMERCE_SUBORDER', id: refund.subOrderId },
        step: 'REFUNDED',
        originRoute: '/account/orders',
      }),
    };
  }
  return {
    titleFa: 'بیعانه شما برگشت خورد',
    bodyFa:
      'مبلغ ' +
      refund.amountToman.toLocaleString('fa-IR') +
      ' تومان به همان روشی که پرداخت شده بود بازگردانده شد.',
    resume: resumeContext({
      entity: { type: 'LISTING_INQUIRY', id: refund.inquiryId! },
      step: 'DEPOSIT_REFUNDED',
      originRoute: '/account/purchases/' + refund.inquiryId,
    }),
  };
}

export interface RefundExecution {
  readonly refund: RefundRow;
  readonly performed: boolean;
}

/**
 * Try to send one refund back through the gateway.
 *
 * The amount comes from the record, the payment reference from the verified
 * attempt that took the money, and the decision about what happened comes from
 * the provider. This function never decides that a refund succeeded.
 */
export async function executeRefund(
  database: Database,
  actor: Actor,
  refundId: string,
  gateway: PaymentGateway,
  providerName: string,
): Promise<RefundExecution> {
  assertMarketplaceCapability(actor, 'REFUND_ISSUE');

  const refund = await loadRefund(database, refundId);
  if (refund.status === 'PAID') return { refund, performed: false };
  if (refund.status === 'CANCELLED') throw conflict('این استرداد لغو شده است.');
  if (!refundRetryable(refund.status, refund.attempts)) {
    if (refund.status === 'PROCESSING') throw conflict('این استرداد همین حالا در حال اجراست.');
    throw conflict(
      'این استرداد ' +
        refund.attempts.toLocaleString('fa-IR') +
        ' بار تلاش شده و با اقدام خودکار پیش نمی‌رود؛ باید دستی پیگیری و ثبت شود.',
    );
  }

  // Claim the record first. A second operator pressing retry at the same moment
  // finds the version already moved and gets a conflict instead of a second
  // transfer to the same person.
  const claimed = await database
    .update(depositRefunds)
    .set({ status: 'PROCESSING', version: refund.version + 1, updatedAt: new Date() })
    .where(and(eq(depositRefunds.id, refund.id), eq(depositRefunds.version, refund.version)))
    .returning({ id: depositRefunds.id });
  if (claimed.length === 0) throw conflict('این استرداد در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  const attempt = await latestAttempt(database, refund.paymentBatchId);
  if (!attempt) {
    return finish(database, actor, refund, {
      status: 'MANUAL_REQUIRED',
      errorFa: 'برای این پرداخت هیچ تلاش ثبت‌شده‌ای پیدا نشد؛ استرداد باید دستی پیگیری شود.',
      outcome: 'UNSUPPORTED',
      provider: providerName,
      requestRef: newRequestRef(),
    });
  }

  const requestRef = newRequestRef();
  if (typeof gateway.refund !== 'function') {
    // Honest state: this gateway cannot refund from here at all.
    return finish(database, actor, refund, {
      status: 'MANUAL_REQUIRED',
      errorFa: 'درگاه پرداخت فعلی استرداد خودکار ندارد؛ بازگرداندن مبلغ باید بیرون از سامانه انجام و اینجا ثبت شود.',
      outcome: 'UNSUPPORTED',
      provider: providerName,
      requestRef,
    });
  }

  let result;
  try {
    result = await gateway.refund({
      reference: attempt.reference,
      providerRef: attempt.providerRef ?? '',
      amountRial: tomanToRial(refund.amountToman),
      requestRef,
    });
  } catch (error) {
    // A provider that threw is a failed attempt, not an unknown state that
    // quietly disappears: it is written down and stays retryable.
    return finish(database, actor, refund, {
      status: 'FAILED',
      errorFa: 'ارتباط با درگاه برای استرداد ناموفق بود: ' + String((error as Error)?.message ?? error).slice(0, 200),
      outcome: 'FAILED',
      provider: providerName,
      requestRef,
    });
  }

  if (result.state === 'REFUNDED') {
    return finish(database, actor, refund, {
      status: 'PAID',
      providerRefundRef: result.providerRefundRef,
      outcome: 'REFUNDED',
      provider: providerName,
      requestRef,
    });
  }
  if (result.state === 'UNSUPPORTED') {
    return finish(database, actor, refund, {
      status: 'MANUAL_REQUIRED',
      errorFa: result.reasonFa,
      outcome: 'UNSUPPORTED',
      provider: providerName,
      requestRef,
    });
  }
  return finish(database, actor, refund, {
    status: 'FAILED',
    errorFa: result.reasonFa,
    outcome: 'FAILED',
    provider: providerName,
    requestRef,
  });
}

const newRequestRef = () => 'HZR-' + randomBytes(9).toString('base64url');

interface FinishInput {
  readonly status: 'PAID' | 'FAILED' | 'MANUAL_REQUIRED';
  readonly providerRefundRef?: string;
  readonly errorFa?: string;
  readonly outcome: 'REFUNDED' | 'FAILED' | 'UNSUPPORTED';
  readonly provider: string;
  readonly requestRef: string;
}

/** Write the attempt and the new state of the record in one transaction. */
async function finish(
  database: Database,
  actor: Actor,
  refund: RefundRow,
  input: FinishInput,
): Promise<RefundExecution> {
  const now = new Date();
  return database.transaction(async (tx) => {
    await tx.insert(depositRefundAttempts).values({
      refundId: refund.id,
      provider: input.provider,
      requestRef: input.requestRef,
      outcome: input.outcome,
      providerRefundRef: input.providerRefundRef ?? null,
      errorFa: input.errorFa ?? null,
      startedByAccountId: actor.accountId,
    });

    const [updated] = await tx
      .update(depositRefunds)
      .set({
        status: input.status,
        attempts: refund.attempts + 1,
        lastErrorFa: input.errorFa ?? null,
        providerRefundRef: input.providerRefundRef ?? refund.providerRefundRef,
        completedAt: input.status === 'PAID' ? now : null,
        version: refund.version + 2,
        updatedAt: now,
      })
      .where(eq(depositRefunds.id, refund.id))
      .returning();

    await recordAudit(tx, actor, {
      action: 'ANIMAL_DEPOSIT_REFUND_ATTEMPTED',
      targetType: 'DEPOSIT_REFUND',
      targetId: refund.id,
      before: { status: refund.status, attempts: refund.attempts },
      after: {
        status: input.status,
        outcome: input.outcome,
        provider: input.provider,
        amountToman: refund.amountToman.toString(),
        providerRefundRef: input.providerRefundRef ?? null,
      },
      reason: input.errorFa ?? null,
    });

    if (input.status === 'PAID') {
      const subject = refundSubject(refund);
      await createNotification(tx, {
        recipientAccountId: refund.recipientAccountId,
        kind: 'ANIMAL_DEPOSIT_REFUNDED',
        titleFa: subject.titleFa,
        bodyFa: subject.bodyFa,
        resume: subject.resume,
      });
    }

    return { refund: updated!, performed: true };
  });
}

/**
 * Record a refund somebody sent outside the product.
 *
 * The only way a `MANUAL_REQUIRED` refund becomes paid. It needs the bank
 * reference, because "we sent it" without one is exactly the claim this module
 * exists to avoid.
 */
export async function recordManualRefund(
  database: Database,
  actor: Actor,
  input: { refundId: string; bankReference: string; noteFa: string },
): Promise<RefundRow> {
  assertMarketplaceCapability(actor, 'REFUND_ISSUE');
  const bankReference = input.bankReference.trim();
  const noteFa = input.noteFa.trim();
  if (bankReference === '') throw validation('شماره پیگیری بانکی را وارد کنید؛ بدون آن، استرداد ثبت نمی‌شود.');
  if (noteFa === '') throw validation('توضیح این اقدام را بنویسید؛ در تاریخچه ثبت می‌شود.');

  const refund = await loadRefund(database, input.refundId);
  if (refund.status === 'PAID') throw conflict('این استرداد قبلاً پرداخت‌شده ثبت شده است.');

  const now = new Date();
  return database.transaction(async (tx) => {
    await tx.insert(depositRefundAttempts).values({
      refundId: refund.id,
      provider: 'manual',
      requestRef: newRequestRef(),
      outcome: 'REFUNDED',
      providerRefundRef: bankReference,
      errorFa: null,
      startedByAccountId: actor.accountId,
    });

    const [updated] = await tx
      .update(depositRefunds)
      .set({
        status: 'PAID',
        attempts: refund.attempts + 1,
        providerRefundRef: bankReference,
        lastErrorFa: null,
        completedAt: now,
        version: refund.version + 1,
        updatedAt: now,
      })
      .where(and(eq(depositRefunds.id, refund.id), eq(depositRefunds.version, refund.version)))
      .returning();
    if (!updated) throw conflict('این استرداد در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_DEPOSIT_REFUND_RECORDED_MANUALLY',
      targetType: 'DEPOSIT_REFUND',
      targetId: refund.id,
      before: { status: refund.status },
      after: { status: 'PAID', bankReference, amountToman: refund.amountToman.toString() },
      reason: noteFa,
    });
    const subject = refundSubject(refund);
    await createNotification(tx, {
      recipientAccountId: refund.recipientAccountId,
      kind: 'ANIMAL_DEPOSIT_REFUNDED',
      titleFa: subject.titleFa,
      bodyFa: 'این استرداد بیرون از درگاه انجام و با شماره پیگیری ثبت شد.',
      resume: subject.resume,
    });
    return updated;
  });
}

export async function loadRefund(database: DbClient, refundId: string): Promise<RefundRow> {
  const [row] = await database.select().from(depositRefunds).where(eq(depositRefunds.id, refundId)).limit(1);
  if (!row) throw notFound('این استرداد پیدا نشد.');
  return row;
}

export async function refundOfDeal(database: DbClient, inquiryId: string): Promise<RefundRow | null> {
  const [row] = await database
    .select()
    .from(depositRefunds)
    .where(eq(depositRefunds.inquiryId, inquiryId))
    .limit(1);
  return row ?? null;
}

export interface RefundQueueEntry {
  readonly id: string;
  readonly inquiryId: string | null;
  readonly animalNameFa: string;
  readonly recipientMobile: string;
  readonly amountToman: bigint;
  readonly status: string;
  readonly attempts: number;
  readonly lastErrorFa: string | null;
  readonly retryable: boolean;
  readonly createdAt: Date;
}

/** Everything still owed, oldest first: a work queue, not a report. */
export async function refundQueue(database: DbClient, actor: Actor): Promise<readonly RefundQueueEntry[]> {
  assertMarketplaceCapability(actor, 'REFUND_ISSUE');
  const rows = await database
    .select({
      id: depositRefunds.id,
      inquiryId: depositRefunds.inquiryId,
      amountToman: depositRefunds.amountToman,
      status: depositRefunds.status,
      attempts: depositRefunds.attempts,
      lastErrorFa: depositRefunds.lastErrorFa,
      createdAt: depositRefunds.createdAt,
      recipientMobile: accounts.mobile,
      animalNameFa: animals.name,
    })
    .from(depositRefunds)
    .innerJoin(accounts, eq(accounts.id, depositRefunds.recipientAccountId))
    .innerJoin(listingInquiries, eq(listingInquiries.id, depositRefunds.inquiryId))
    .innerJoin(animalListings, eq(animalListings.id, listingInquiries.listingId))
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .where(inArray(depositRefunds.status, ['PENDING', 'PROCESSING', 'FAILED', 'MANUAL_REQUIRED']))
    .orderBy(depositRefunds.createdAt);

  return rows.map((row) => ({
    id: row.id,
    inquiryId: row.inquiryId,
    animalNameFa: row.animalNameFa ?? 'بدون نام',
    recipientMobile: row.recipientMobile,
    amountToman: row.amountToman,
    status: row.status,
    attempts: row.attempts,
    lastErrorFa: row.lastErrorFa,
    retryable: refundRetryable(row.status, row.attempts),
    createdAt: row.createdAt,
  }));
}

/** The tries behind one refund, for the operator deciding what to do next. */
export async function refundAttempts(database: DbClient, actor: Actor, refundId: string) {
  assertMarketplaceCapability(actor, 'REFUND_ISSUE');
  return database
    .select()
    .from(depositRefundAttempts)
    .where(eq(depositRefundAttempts.refundId, refundId))
    .orderBy(desc(depositRefundAttempts.createdAt));
}

export { MAX_AUTOMATIC_REFUND_ATTEMPTS };
