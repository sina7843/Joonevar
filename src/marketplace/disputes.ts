/**
 * Arbitration, and its limits — PROMPT-006.
 *
 * Hamzist answers three questions and says so: was the deposit owed back, were
 * the recorded facts of the advert true, and did the handover happen. The rest
 * of the price is settled between two people outside the product, so a claim
 * about it is refused here in plain words instead of being accepted into a
 * queue that was never going to decide it.
 *
 * Evidence is private storage. Who may read one file is a question about this
 * dispute — its two parties and the reviewer deciding it — asked per record
 * rather than granted to a whole role, so opening one case never opens the
 * others.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { animals } from '../db/schema/animals.ts';
import { animalListings } from '../db/schema/marketplace.ts';
import { listingInquiries } from '../db/schema/inquiry.ts';
import { dealCancellations, dealDisputes, disputeEvidence } from '../db/schema/deals.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { putPrivateFile, safeOriginalName } from '../files/storage.ts';
import { violates } from '../db/constraint.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { resumeContext } from '../domain/resume-context.ts';
import type { Actor } from '../authz/actor.ts';
import { assertMarketplaceCapability, hasMarketplaceCapability } from './model.ts';
import { threadRole, type InquiryRow } from './inquiries.ts';
import { openRefund } from './refunds.ts';
import { releaseListing } from './cancellations.ts';
import { holdHandoverForDispute } from './handover.ts';
import {
  decisionRefund,
  DISPUTE_DECISIONS,
  DISPUTE_SCOPES,
  OUT_OF_SCOPE_FA,
  type DisputeDecision,
  type DisputeScope,
} from './cancellation-model.ts';

export type DisputeRow = typeof dealDisputes.$inferSelect;

export const isDisputeScope = (value: unknown): value is DisputeScope =>
  typeof value === 'string' && (DISPUTE_SCOPES as readonly string[]).includes(value);

export const isDisputeDecision = (value: unknown): value is DisputeDecision =>
  typeof value === 'string' && (DISPUTE_DECISIONS as readonly string[]).includes(value);

async function loadDeal(database: DbClient, inquiryId: string): Promise<InquiryRow> {
  const [row] = await database.select().from(listingInquiries).where(eq(listingInquiries.id, inquiryId)).limit(1);
  if (!row) throw notFound('این معامله پیدا نشد.');
  return row;
}

export async function loadDispute(database: DbClient, disputeId: string): Promise<DisputeRow> {
  const [row] = await database.select().from(dealDisputes).where(eq(dealDisputes.id, disputeId)).limit(1);
  if (!row) throw notFound('این پرونده اختلاف پیدا نشد.');
  return row;
}

/**
 * Who may see this case.
 *
 * The two parties and a reviewer holding the capability. Anybody else is told
 * the case does not exist, so a stranger cannot confirm that two particular
 * people are arguing about a particular animal.
 */
export function disputeRole(
  deal: InquiryRow,
  actor: Actor,
): 'BUYER' | 'SELLER' | 'REVIEWER' {
  if (deal.buyerAccountId === actor.accountId) return 'BUYER';
  if (deal.sellerAccountId === actor.accountId) return 'SELLER';
  if (hasMarketplaceCapability(actor, 'ANIMAL_DISPUTE_DECIDE')) return 'REVIEWER';
  throw notFound('این پرونده اختلاف پیدا نشد.');
}

export interface OpenDisputeInput {
  readonly inquiryId: string;
  readonly scope: string;
  readonly claimFa: string;
}

/**
 * Open a case.
 *
 * Only over a deal whose deposit was actually verified: without money there is
 * nothing here to arbitrate, and the argument belongs in the thread or in a
 * report about the advert.
 */
export async function openDispute(
  database: Database,
  actor: Actor,
  input: OpenDisputeInput,
): Promise<DisputeRow> {
  if (!isDisputeScope(input.scope)) throw validation(OUT_OF_SCOPE_FA);
  const claimFa = input.claimFa.trim();
  if (claimFa.length < 20) throw validation('شرح ادعا را کامل‌تر بنویسید؛ داور بر اساس همین متن و مدارک تصمیم می‌گیرد.');

  const deal = await loadDeal(database, input.inquiryId);
  const role = threadRole(deal, actor);
  if (role === 'MODERATOR') throw forbidden();
  if (deal.reservedAt === null || deal.depositAmountToman === null) {
    throw conflict('تا پیش از پرداخت و تأیید بیعانه، پرونده اختلاف باز نمی‌شود.');
  }

  return database.transaction(async (tx) => {
    let dispute: DisputeRow;
    try {
      const [row] = await tx
        .insert(dealDisputes)
        .values({
          inquiryId: deal.id,
          openedByAccountId: actor.accountId,
          openedByParty: role,
          scope: input.scope as DisputeScope,
          claimFa,
        })
        .returning();
      dispute = row!;
    } catch (error) {
      if (violates(error, 'deal_dispute_one_live_key')) {
        throw conflict('برای این معامله پرونده اختلاف بازی وجود دارد.');
      }
      throw error;
    }

    // A meeting arranged for a deal now under dispute is held, so nobody turns
    // up to hand over an animal whose case is being decided (PROMPT-007).
    await holdHandoverForDispute(tx, deal.id);

    await recordAudit(tx, actor, {
      action: 'ANIMAL_DEAL_DISPUTE_OPENED',
      targetType: 'DEAL_DISPUTE',
      targetId: dispute.id,
      after: { inquiryId: deal.id, scope: input.scope, party: role },
    });
    await createNotification(tx, {
      recipientAccountId: role === 'BUYER' ? deal.sellerAccountId : deal.buyerAccountId,
      kind: 'ANIMAL_DEAL_DISPUTE_OPENED',
      titleFa: 'برای یکی از معامله‌های شما پرونده اختلاف باز شد',
      bodyFa: 'می‌توانید شرح و مدارک خودتان را در همان پرونده ثبت کنید. داوری همزیست محدود به بیعانه، صحت اطلاعات آگهی و انجام تحویل است.',
      resume: resumeContext({
        entity: { type: 'DEAL_DISPUTE', id: dispute.id },
        step: 'DEAL_DISPUTE',
        originRoute: '/account/purchases/' + deal.id,
      }),
    });
    return dispute;
  });
}

export interface AddEvidenceInput {
  readonly disputeId: string;
  readonly noteFa?: string | null;
  readonly file?: { readonly bytes: Uint8Array; readonly originalName: string | null } | null;
}

/** Add a document or a note to a case that is still being decided. */
export async function addDisputeEvidence(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: AddEvidenceInput,
): Promise<void> {
  const dispute = await loadDispute(database, input.disputeId);
  const deal = await loadDeal(database, dispute.inquiryId);
  const role = disputeRole(deal, actor);
  if (dispute.status === 'RESOLVED' || dispute.status === 'WITHDRAWN') {
    throw conflict('این پرونده تعیین تکلیف شده است و مدرک تازه نمی‌پذیرد.');
  }

  const noteFa = input.noteFa?.trim() || null;
  if (noteFa === null && !input.file) throw validation('توضیح یا مدرک را وارد کنید.');

  await database.transaction(async (tx) => {
    const stored = input.file
      ? await putPrivateFile(tx, storageRoot, actor, {
          ownerAccountId: actor.accountId,
          purpose: 'DISPUTE_EVIDENCE',
          bytes: input.file.bytes,
          originalName: safeOriginalName(input.file.originalName),
        })
      : null;

    await tx.insert(disputeEvidence).values({
      disputeId: dispute.id,
      addedByAccountId: actor.accountId,
      fileId: stored?.id ?? null,
      noteFa,
    });

    // A reviewer's first look moves the case out of the untouched queue.
    if (role === 'REVIEWER' && dispute.status === 'OPEN') {
      await tx
        .update(dealDisputes)
        .set({ status: 'UNDER_REVIEW', version: dispute.version + 1, updatedAt: new Date() })
        .where(and(eq(dealDisputes.id, dispute.id), eq(dealDisputes.status, 'OPEN')));
    }

    await recordAudit(tx, actor, {
      action: 'ANIMAL_DEAL_DISPUTE_EVIDENCE_ADDED',
      targetType: 'DEAL_DISPUTE',
      targetId: dispute.id,
      // Never the bytes and never the note: what is recorded is that evidence
      // arrived, from which side, and of what kind.
      metadata: { byRole: role, hasFile: stored !== null, mime: stored?.mime ?? null },
    });
  });
}

export interface DecideDisputeInput {
  readonly disputeId: string;
  readonly decision: string;
  readonly reasonFa: string;
  /** For a buyer-favoured decision: how much of the deposit comes back. */
  readonly refundToman?: bigint | null;
  readonly expectedVersion: number;
}

/**
 * Decide a case.
 *
 * The decision writes the refund it implies inside the same transaction, so a
 * case cannot be resolved in favour of the buyer while the money it promised
 * exists nowhere. Sending that money is still a separate, retryable step.
 */
export async function decideDispute(
  database: Database,
  actor: Actor,
  input: DecideDisputeInput,
): Promise<DisputeRow> {
  assertMarketplaceCapability(actor, 'ANIMAL_DISPUTE_DECIDE');
  if (!isDisputeDecision(input.decision)) throw validation('رأی انتخاب‌شده معتبر نیست.');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa.length < 10) throw validation('دلیل رأی را بنویسید؛ برای هر دو طرف و در تاریخچه ثبت می‌شود.');

  const dispute = await loadDispute(database, input.disputeId);
  if (dispute.status === 'RESOLVED') throw conflict('این پرونده قبلاً تعیین تکلیف شده است.');
  if (dispute.status === 'WITHDRAWN') throw conflict('این پرونده پس گرفته شده است.');

  const deal = await loadDeal(database, dispute.inquiryId);
  const deposit = deal.depositAmountToman ?? 0n;
  const refundAmount = decisionRefund(input.decision, deposit, input.refundToman ?? null);

  const now = new Date();
  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(dealDisputes)
      .set({
        status: 'RESOLVED',
        decision: input.decision as DisputeDecision,
        decisionReasonFa: reasonFa,
        refundAmountToman: refundAmount,
        decidedByAccountId: actor.accountId,
        decidedAt: now,
        version: dispute.version + 1,
        updatedAt: now,
      })
      .where(and(eq(dealDisputes.id, dispute.id), eq(dealDisputes.version, input.expectedVersion)))
      .returning();
    if (!updated) throw conflict('این پرونده در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    if (dispute.cancellationId !== null) {
      // The cancellation that was waiting for this answer now has one.
      await tx
        .update(dealCancellations)
        .set({
          outcome: refundAmount === 0n ? 'NO_REFUND' : refundAmount >= deposit ? 'FULL_REFUND' : 'PARTIAL_REFUND',
          refundAmountToman: refundAmount,
          penaltyAmountToman: deposit - refundAmount,
          decidedByAccountId: actor.accountId,
          decisionReasonFa: reasonFa,
          decidedAt: now,
        })
        .where(eq(dealCancellations.id, dispute.cancellationId));
    }

    if (refundAmount > 0n && deal.paymentBatchId !== null) {
      await openRefund(tx, {
        inquiryId: deal.id,
        cancellationId: dispute.cancellationId,
        paymentBatchId: deal.paymentBatchId,
        recipientAccountId: deal.buyerAccountId,
        amountToman: refundAmount,
      });
    }

    // A decided case releases the animal: either the sale is off, or it was
    // never going to happen through this deal. `OUT_OF_SCOPE` deliberately
    // changes nothing, because it decided nothing.
    if (input.decision !== 'OUT_OF_SCOPE') {
      await releaseListing(tx, deal, now, 'پرونده اختلاف این معامله تعیین تکلیف شد.');
      await tx
        .update(listingInquiries)
        .set({
          status: 'CLOSED',
          closedReasonFa: 'پرونده اختلاف تعیین تکلیف شد.',
          statusChangedAt: now,
          version: deal.version + 1,
          updatedAt: now,
        })
        .where(and(eq(listingInquiries.id, deal.id), eq(listingInquiries.status, 'CONVERTED')));
    }

    await recordAudit(tx, actor, {
      action: 'ANIMAL_DEAL_DISPUTE_DECIDED',
      targetType: 'DEAL_DISPUTE',
      targetId: dispute.id,
      targetVersion: updated.version,
      before: { status: dispute.status },
      after: {
        decision: input.decision,
        refundAmountToman: refundAmount.toString(),
        depositAmountToman: deposit.toString(),
        scope: dispute.scope,
      },
      reason: reasonFa,
    });

    for (const recipient of [deal.buyerAccountId, deal.sellerAccountId]) {
      await createNotification(tx, {
        recipientAccountId: recipient,
        kind: 'ANIMAL_DEAL_DISPUTE_DECIDED',
        titleFa: 'رأی پرونده اختلاف صادر شد',
        bodyFa: reasonFa,
        resume: resumeContext({
          entity: { type: 'DEAL_DISPUTE', id: dispute.id },
          step: 'DEAL_DISPUTE',
          originRoute: '/account/purchases/' + deal.id,
        }),
      });
    }
    return updated;
  });
}

/** The person who opened a case may take it back while nobody has decided it. */
export async function withdrawDispute(
  database: Database,
  actor: Actor,
  input: { disputeId: string; reasonFa: string },
): Promise<void> {
  const dispute = await loadDispute(database, input.disputeId);
  if (dispute.openedByAccountId !== actor.accountId) throw forbidden();
  if (dispute.status === 'RESOLVED') throw conflict('این پرونده تعیین تکلیف شده است.');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل پس‌گرفتن را بنویسید.');

  await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(dealDisputes)
      .set({
        status: 'WITHDRAWN',
        decisionReasonFa: reasonFa,
        version: dispute.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(dealDisputes.id, dispute.id), inArray(dealDisputes.status, ['OPEN', 'UNDER_REVIEW'])))
      .returning({ id: dealDisputes.id });
    if (!updated) throw conflict('این پرونده در این فاصله تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_DEAL_DISPUTE_WITHDRAWN',
      targetType: 'DEAL_DISPUTE',
      targetId: dispute.id,
      reason: reasonFa,
    });
  });
}

// ── reads ──────────────────────────────────────────────────────────────────

export interface DisputeEvidenceView {
  readonly id: string;
  readonly noteFa: string | null;
  readonly fileId: string | null;
  readonly mine: boolean;
  readonly createdAt: Date;
}

export interface DisputeView {
  readonly dispute: DisputeRow;
  readonly role: 'BUYER' | 'SELLER' | 'REVIEWER';
  readonly animalNameFa: string;
  readonly depositAmountToman: bigint | null;
  readonly evidence: readonly DisputeEvidenceView[];
}

/** One case, for somebody entitled to read it. */
export async function disputeView(
  database: DbClient,
  actor: Actor,
  disputeId: string,
): Promise<DisputeView> {
  const dispute = await loadDispute(database, disputeId);
  const deal = await loadDeal(database, dispute.inquiryId);
  const role = disputeRole(deal, actor);

  const [listing] = await database
    .select({ nameFa: animals.name })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .where(eq(animalListings.id, deal.listingId))
    .limit(1);

  const evidence = await database
    .select()
    .from(disputeEvidence)
    .where(eq(disputeEvidence.disputeId, dispute.id))
    .orderBy(asc(disputeEvidence.createdAt));

  return {
    dispute,
    role,
    animalNameFa: listing?.nameFa ?? 'بدون نام',
    depositAmountToman: deal.depositAmountToman,
    evidence: evidence.map((row) => ({
      id: row.id,
      noteFa: row.noteFa,
      fileId: row.fileId,
      mine: row.addedByAccountId === actor.accountId,
      createdAt: row.createdAt,
    })),
  };
}

export interface DisputeQueueEntry {
  readonly id: string;
  readonly inquiryId: string;
  readonly animalNameFa: string;
  readonly scope: string;
  readonly status: string;
  readonly claimFa: string;
  readonly openedByParty: string;
  readonly depositAmountToman: bigint | null;
  readonly version: number;
  readonly createdAt: Date;
}

/** Open cases, oldest first, for the reviewer who decides them. */
export async function disputeQueue(database: DbClient, actor: Actor): Promise<readonly DisputeQueueEntry[]> {
  assertMarketplaceCapability(actor, 'ANIMAL_DISPUTE_DECIDE');
  const rows = await database
    .select({
      id: dealDisputes.id,
      inquiryId: dealDisputes.inquiryId,
      scope: dealDisputes.scope,
      status: dealDisputes.status,
      claimFa: dealDisputes.claimFa,
      openedByParty: dealDisputes.openedByParty,
      version: dealDisputes.version,
      createdAt: dealDisputes.createdAt,
      depositAmountToman: listingInquiries.depositAmountToman,
      animalNameFa: animals.name,
    })
    .from(dealDisputes)
    .innerJoin(listingInquiries, eq(listingInquiries.id, dealDisputes.inquiryId))
    .innerJoin(animalListings, eq(animalListings.id, listingInquiries.listingId))
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .where(inArray(dealDisputes.status, ['OPEN', 'UNDER_REVIEW']))
    .orderBy(asc(dealDisputes.createdAt));

  return rows.map((row) => ({ ...row, animalNameFa: row.animalNameFa ?? 'بدون نام' }));
}

/** The live case of one deal, for the thread page that shows its state. */
export async function disputeOfDeal(database: DbClient, inquiryId: string): Promise<DisputeRow | null> {
  const [row] = await database
    .select()
    .from(dealDisputes)
    .where(eq(dealDisputes.inquiryId, inquiryId))
    .orderBy(desc(dealDisputes.createdAt))
    .limit(1);
  return row ?? null;
}

/** Whether this account may read one evidence file, asked per record. */
export async function mayReadDisputeEvidence(
  database: DbClient,
  actor: Actor,
  fileId: string,
): Promise<boolean> {
  const rows = await database
    .select({
      buyerAccountId: listingInquiries.buyerAccountId,
      sellerAccountId: listingInquiries.sellerAccountId,
    })
    .from(disputeEvidence)
    .innerJoin(dealDisputes, eq(dealDisputes.id, disputeEvidence.disputeId))
    .innerJoin(listingInquiries, eq(listingInquiries.id, dealDisputes.inquiryId))
    .where(eq(disputeEvidence.fileId, fileId))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (row.buyerAccountId === actor.accountId || row.sellerAccountId === actor.accountId) return true;
  return hasMarketplaceCapability(actor, 'ANIMAL_DISPUTE_DECIDE');
}
