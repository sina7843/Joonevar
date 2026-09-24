/**
 * Ending a reserved deal — PROMPT-006.
 *
 * A cancellation does three separable things, and they are separate here
 * because they fail separately: it records the decision, it creates the refund
 * that somebody now has to execute, and it releases the advert.
 *
 * Money never moves in this module. Deciding that a buyer is owed 550,000
 * Toman and actually sending it back are different events with different
 * failure modes, and pretending otherwise is how a product ends up saying
 * "refunded" about money still sitting at the bank.
 */
import { and, count, desc, eq, gt, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animalListings } from '../db/schema/marketplace.ts';
import { listingInquiries } from '../db/schema/inquiry.ts';
import { dealCancellations, dealDisputes, sellerDebts } from '../db/schema/deals.ts';
import { publisherRestrictions } from '../db/schema/moderation.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { violates } from '../db/constraint.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { resumeContext } from '../domain/resume-context.ts';
import type { Actor } from '../authz/actor.ts';
import { threadRole, type InquiryRow } from './inquiries.ts';
import { openRefund } from './refunds.ts';
import {
  canGiveReason,
  cancellationEffect,
  needsReview,
  sellerRestrictionUntil,
  CANCELLATION_REASONS,
  CANCELLATION_REASON_FA,
  type CancellationReason,
  type DealParty,
} from './cancellation-model.ts';

export type CancellationRow = typeof dealCancellations.$inferSelect;

export const isCancellationReason = (value: unknown): value is CancellationReason =>
  typeof value === 'string' && (CANCELLATION_REASONS as readonly string[]).includes(value);

async function loadDeal(database: DbClient, inquiryId: string): Promise<InquiryRow> {
  const [row] = await database.select().from(listingInquiries).where(eq(listingInquiries.id, inquiryId)).limit(1);
  if (!row) throw notFound('این معامله پیدا نشد.');
  return row;
}

export interface CancelDealInput {
  readonly inquiryId: string;
  readonly reason: string;
  readonly statementFa?: string | null;
}

export interface CancelDealResult {
  readonly cancellation: CancellationRow;
  readonly disputeId: string | null;
  readonly refundId: string | null;
}

/**
 * Cancel a reserved deal.
 *
 * Only a deal whose deposit was verified can be cancelled here: before that
 * there is no money to return, and withdrawing a request is the ordinary path
 * of PROMPT-005 rather than a cancellation. That is also why the "full refund
 * before the seller accepts" rule of PRODUCT_DECISIONS §6 needs no code — a
 * deposit cannot exist at that point, so there is nothing to refund and nothing
 * to deduct.
 */
export async function cancelDeal(
  database: Database,
  actor: Actor,
  input: CancelDealInput,
): Promise<CancelDealResult> {
  if (!isCancellationReason(input.reason)) throw validation('دلیل لغو معتبر نیست.');
  const reason = input.reason;

  const deal = await loadDeal(database, input.inquiryId);
  const role = threadRole(deal, actor);
  if (role === 'MODERATOR') throw forbidden();
  const party: DealParty = role;

  if (deal.status !== 'CONVERTED') {
    throw conflict('فقط معامله‌ای که بیعانه آن تأیید شده است از این مسیر لغو می‌شود.');
  }
  if (deal.depositAmountToman === null || deal.paymentBatchId === null) {
    throw conflict('برای این معامله بیعانه تأییدشده‌ای ثبت نشده است.');
  }
  if (!canGiveReason(reason, party)) {
    throw validation('این دلیل لغو از سوی طرف دیگر معامله ثبت می‌شود.');
  }

  const statementFa = input.statementFa?.trim() || null;
  if (needsReview(reason) && statementFa === null) {
    throw validation('برای این دلیل، شرح ماجرا لازم است؛ داور بر اساس همان تصمیم می‌گیرد.');
  }

  const effect = cancellationEffect(reason, deal.depositAmountToman, {
    policyVersion: deal.cancellationPolicyVersion,
    buyerPenaltyBp: deal.buyerPenaltyBp,
    sellerPenaltyToman: deal.sellerPenaltyToman,
    sellerRestrictionDays: deal.sellerRestrictionDays,
  });

  const now = new Date();
  return database.transaction(async (tx) => {
    let cancellation: CancellationRow;
    try {
      const [row] = await tx
        .insert(dealCancellations)
        .values({
          inquiryId: deal.id,
          listingId: deal.listingId,
          requestedByAccountId: actor.accountId,
          requestedByParty: party,
          reason,
          statementFa,
          outcome: effect.outcome,
          policyVersion: deal.cancellationPolicyVersion,
          depositAmountToman: deal.depositAmountToman!,
          buyerPenaltyBp: deal.buyerPenaltyBp,
          penaltyAmountToman: effect.penaltyToman,
          refundAmountToman: effect.refundToman,
        })
        .returning();
      cancellation = row!;
    } catch (error) {
      if (violates(error, 'deal_cancellation_one_key')) {
        throw conflict('برای این معامله قبلاً درخواست لغو ثبت شده است.');
      }
      throw error;
    }

    let disputeId: string | null = null;
    if (effect.opensDispute) {
      // A claim about the animal, the advert or a meeting is not settled by the
      // person making it. The deal stays reserved and the advert stays off the
      // market until a reviewer decides, because releasing it first would sell
      // the animal out from under the argument.
      const [dispute] = await tx
        .insert(dealDisputes)
        .values({
          inquiryId: deal.id,
          cancellationId: cancellation.id,
          openedByAccountId: actor.accountId,
          openedByParty: party,
          scope: reason === 'INFO_MISMATCH' || reason === 'FALSE_LISTING' ? 'LISTING_FACTS' : reason === 'HEALTH_ISSUE' ? 'LISTING_FACTS' : 'HANDOVER',
          claimFa: statementFa!,
        })
        .returning({ id: dealDisputes.id });
      disputeId = dispute!.id;
    }

    let refundId: string | null = null;
    if (!effect.opensDispute) {
      if (effect.refundToman > 0n) {
        refundId = await openRefund(tx, {
          inquiryId: deal.id,
          cancellationId: cancellation.id,
          paymentBatchId: deal.paymentBatchId!,
          recipientAccountId: deal.buyerAccountId,
          amountToman: effect.refundToman,
        });
      }

      if (effect.sellerDebtToman > 0n) {
        await tx.insert(sellerDebts).values({
          accountId: deal.sellerAccountId,
          inquiryId: deal.id,
          cancellationId: cancellation.id,
          amountToman: effect.sellerDebtToman,
          reasonFa: 'جریمه انصراف فروشنده از معامله پس از دریافت بیعانه.',
        });
      }

      if (reason === 'SELLER_CANCELLED') {
        await applySellerRestriction(tx, deal, now);
      }

      await releaseListing(tx, deal, now, CANCELLATION_REASON_FA[reason]);
      await closeDeal(tx, deal, now, 'معامله لغو شد: ' + CANCELLATION_REASON_FA[reason]);
    }

    await recordAudit(tx, actor, {
      action: 'ANIMAL_DEAL_CANCELLED',
      targetType: 'LISTING_INQUIRY',
      targetId: deal.id,
      after: {
        cancellationId: cancellation.id,
        reason,
        party,
        outcome: effect.outcome,
        policyVersion: deal.cancellationPolicyVersion,
        depositAmountToman: deal.depositAmountToman!.toString(),
        penaltyAmountToman: effect.penaltyToman.toString(),
        refundAmountToman: effect.refundToman.toString(),
        sellerDebtToman: effect.sellerDebtToman.toString(),
        disputeId,
        refundId,
      },
      reason: statementFa,
    });

    const other = party === 'BUYER' ? deal.sellerAccountId : deal.buyerAccountId;
    await createNotification(tx, {
      recipientAccountId: other,
      kind: 'ANIMAL_DEAL_CANCELLED',
      titleFa: effect.opensDispute ? 'پرونده اختلاف برای یک معامله باز شد' : 'معامله لغو شد',
      bodyFa: effect.noteFa,
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: deal.id },
        step: effect.opensDispute ? 'DEAL_DISPUTE' : 'DEAL_CANCELLED',
        originRoute: '/account/purchases/' + deal.id,
      }),
    });

    return { cancellation, disputeId, refundId };
  });
}

/**
 * Put the advert back on the market.
 *
 * The advert returns to where it was before the reservation, not to a new life:
 * its own expiry date still applies, so an advert whose time ran out while it
 * was reserved comes back expired rather than silently extended.
 */
export async function releaseListing(
  tx: DbClient,
  deal: InquiryRow,
  now: Date,
  reasonFa: string,
): Promise<void> {
  const [listing] = await tx
    .select({ id: animalListings.id, status: animalListings.status, version: animalListings.version, expiresAt: animalListings.expiresAt })
    .from(animalListings)
    .where(eq(animalListings.id, deal.listingId))
    .limit(1);
  if (!listing || listing.status !== 'RESERVED') return;

  const expired = listing.expiresAt !== null && listing.expiresAt.getTime() <= now.getTime();
  await tx
    .update(animalListings)
    .set({
      status: expired ? 'EXPIRED' : 'PUBLISHED',
      statusReasonFa: reasonFa,
      statusChangedAt: now,
      statusChangedByAccountId: null,
      version: listing.version + 1,
      updatedAt: now,
    })
    .where(and(eq(animalListings.id, listing.id), eq(animalListings.version, listing.version)));
}

/** The deal itself ends; its transcript and its rows stay exactly as they are. */
async function closeDeal(tx: DbClient, deal: InquiryRow, now: Date, reasonFa: string): Promise<void> {
  await tx
    .update(listingInquiries)
    .set({
      status: 'CLOSED',
      closedReasonFa: reasonFa,
      statusChangedAt: now,
      version: deal.version + 1,
      updatedAt: now,
    })
    .where(and(eq(listingInquiries.id, deal.id), eq(listingInquiries.status, 'CONVERTED')));
}

/**
 * Progressive restriction after a seller cancels.
 *
 * Counted from the seller's own cancellations, so it rises with a pattern and
 * not with a single accident, and it reuses the publisher restriction that
 * already exists rather than inventing a second mechanism that would have to be
 * kept in step with it.
 */
async function applySellerRestriction(tx: DbClient, deal: InquiryRow, now: Date): Promise<void> {
  const [previous] = await tx
    .select({ total: count() })
    .from(dealCancellations)
    .where(
      and(
        eq(dealCancellations.requestedByAccountId, deal.sellerAccountId),
        eq(dealCancellations.reason, 'SELLER_CANCELLED'),
      ),
    );
  // The row just written is in this count, so the first cancellation reads 1.
  const before = Math.max((previous?.total ?? 1) - 1, 0);
  const endsAt = sellerRestrictionUntil(before, deal.sellerRestrictionDays, now);
  if (endsAt === null) return;

  await tx.insert(publisherRestrictions).values({
    accountId: deal.sellerAccountId,
    reason:
      'انصراف فروشنده از معامله پس از دریافت بیعانه. دوره محدودیت با تکرار انصراف تصاعدی است و در پایان خودبه‌خود برداشته می‌شود.',
    startsAt: now,
    endsAt,
    createdByAccountId: null,
  });
}

// ── reads ──────────────────────────────────────────────────────────────────

export async function cancellationOfDeal(
  database: DbClient,
  inquiryId: string,
): Promise<CancellationRow | null> {
  const [row] = await database
    .select()
    .from(dealCancellations)
    .where(eq(dealCancellations.inquiryId, inquiryId))
    .limit(1);
  return row ?? null;
}

export interface SellerDebtView {
  readonly id: string;
  readonly amountToman: bigint;
  readonly status: string;
  readonly reasonFa: string;
  readonly createdAt: Date;
}

/** What this seller owes, for their own page and for the finance queue. */
export async function sellerDebtsOf(
  database: DbClient,
  accountId: string,
): Promise<readonly SellerDebtView[]> {
  return database
    .select({
      id: sellerDebts.id,
      amountToman: sellerDebts.amountToman,
      status: sellerDebts.status,
      reasonFa: sellerDebts.reasonFa,
      createdAt: sellerDebts.createdAt,
    })
    .from(sellerDebts)
    .where(eq(sellerDebts.accountId, accountId))
    .orderBy(desc(sellerDebts.createdAt));
}

/** Whether this seller is restricted right now, decided at read time. */
export async function sellerRestricted(
  database: DbClient,
  accountId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await database
    .select({ id: publisherRestrictions.id })
    .from(publisherRestrictions)
    .where(
      and(
        eq(publisherRestrictions.accountId, accountId),
        gt(publisherRestrictions.endsAt, now),
        inArray(publisherRestrictions.accountId, [accountId]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
