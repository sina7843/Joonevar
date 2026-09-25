/**
 * The handover and the transfer of ownership — PROMPT-007.
 *
 * The shape of this module follows one sentence: the animal changes hands in a
 * room, and the product's job is to record that it happened without pretending
 * to have been there.
 *
 * So: the seller offers methods on the advert and the buyer picks one of them;
 * a veterinary place chosen as a meeting point is validated against the real
 * directory and is **not** an endorsement of the animal by that clinic; the
 * buyer holds a one-time code with a bounded life and bounded attempts and the
 * seller enters it in front of them; and only the buyer's own confirmation
 * completes the transfer.
 *
 * At that last instant every condition is read again inside the transaction
 * that moves the ownership — the verified deposit, the minimum age, the
 * microchip, the seller's authority, the animal being transferable, no other
 * completed transfer, no open dispute — because all of them can change between
 * arranging a meeting and standing in it. The transfer, the listing becoming
 * SOLD and the deal becoming COMPLETED are one transaction: either the animal
 * changed hands everywhere or nowhere.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { animals } from '../db/schema/animals.ts';
import { microchips } from '../db/schema/clinical.ts';
import { vetLocations } from '../db/schema/vets.ts';
import { animalListingDeliveries, animalListings } from '../db/schema/marketplace.ts';
import { listingInquiries } from '../db/schema/inquiry.ts';
import { dealDisputes } from '../db/schema/deals.ts';
import { animalOwnershipTransfers, dealHandovers } from '../db/schema/handover.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { violates } from '../db/constraint.ts';
import { readInt, readText, snapshotSetting } from '../settings/service.ts';
import { resumeContext } from '../domain/resume-context.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertMarketplaceCapability, hasMarketplaceCapability } from './model.ts';
import { threadRole, type InquiryRow } from './inquiries.ts';
import { sellerEligibility } from './listing-eligibility.ts';
import { deliverableFrom, DELIVERY_METHOD_FA, isDeliveryMethod, type DeliveryMethod } from './listing-model.ts';
import {
  afterWrongAttempt,
  canMoveHandover,
  codeAttemptAllowed,
  handoverStatement,
  transferBlockers,
  HANDOVER_CODE_LENGTH,
  TRANSFER_CONDITION_FA,
  type CodePolicy,
  type HandoverActor,
  type HandoverStatus,
} from './handover-model.ts';

export type HandoverRow = typeof dealHandovers.$inferSelect;
export type TransferRow = typeof animalOwnershipTransfers.$inferSelect;

export const CODE_MINUTES_KEY = 'market.animal.handover_code_minutes';
export const CODE_ATTEMPTS_KEY = 'market.animal.handover_code_max_attempts';
export const CODE_LOCK_KEY = 'market.animal.handover_code_lock_minutes';
export const CODE_ISSUES_KEY = 'market.animal.handover_code_max_issues';
export const STATEMENT_VERSION_KEY = 'market.animal.handover_statement_version';
export const MIN_AGE_KEY = 'market.animal.min_handover_age_days';

// ── the code ───────────────────────────────────────────────────────────────

/** Salted by the row id, so the same six digits hash differently per handover. */
const hashCode = (handoverId: string, code: string): string =>
  createHash('sha256').update(handoverId + ':' + code).digest('hex');

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function newCode(): string {
  let code = '';
  for (let index = 0; index < HANDOVER_CODE_LENGTH; index += 1) code += String(randomInt(10));
  return code;
}

async function codePolicy(database: DbClient): Promise<CodePolicy> {
  return {
    validityMinutes: await readInt(database, CODE_MINUTES_KEY),
    maxAttempts: await readInt(database, CODE_ATTEMPTS_KEY),
    lockMinutes: await readInt(database, CODE_LOCK_KEY),
    maxIssues: await readInt(database, CODE_ISSUES_KEY),
  };
}

// ── shared reads ───────────────────────────────────────────────────────────

async function loadDeal(database: DbClient, inquiryId: string): Promise<InquiryRow> {
  const [row] = await database.select().from(listingInquiries).where(eq(listingInquiries.id, inquiryId)).limit(1);
  if (!row) throw notFound('این معامله پیدا نشد.');
  return row;
}

export async function loadHandover(database: DbClient, handoverId: string): Promise<HandoverRow> {
  const [row] = await database.select().from(dealHandovers).where(eq(dealHandovers.id, handoverId)).limit(1);
  if (!row) throw notFound('این تحویل پیدا نشد.');
  return row;
}

export async function handoverOfDeal(database: DbClient, inquiryId: string): Promise<HandoverRow | null> {
  const [row] = await database
    .select()
    .from(dealHandovers)
    .where(eq(dealHandovers.inquiryId, inquiryId))
    .limit(1);
  return row ?? null;
}

/** Whether a dispute is currently holding this deal. */
async function openDispute(database: DbClient, inquiryId: string): Promise<boolean> {
  const rows = await database
    .select({ id: dealDisputes.id })
    .from(dealDisputes)
    .where(and(eq(dealDisputes.inquiryId, inquiryId), inArray(dealDisputes.status, ['OPEN', 'UNDER_REVIEW'])))
    .limit(1);
  return rows.length > 0;
}

// ── arranging the meeting ──────────────────────────────────────────────────

export interface ScheduleHandoverInput {
  readonly inquiryId: string;
  readonly method: string;
  readonly vetLocationId?: string | null;
  readonly placeFa?: string | null;
  readonly scheduledAt: Date;
}

/**
 * Choose how and where the animal will be handed over.
 *
 * The buyer picks from the methods the seller actually declared on the advert —
 * a method that was never offered is refused here rather than being agreed in
 * chat and discovered at the door. Rescheduling is this same call again.
 */
export async function scheduleHandover(
  database: Database,
  actor: Actor,
  input: ScheduleHandoverInput,
): Promise<HandoverRow> {
  if (!isDeliveryMethod(input.method)) throw validation('روش تحویل معتبر نیست.');
  const method = input.method as DeliveryMethod;
  if (input.scheduledAt.getTime() <= Date.now()) throw validation('زمان تحویل باید در آینده باشد.');

  const deal = await loadDeal(database, input.inquiryId);
  const role = threadRole(deal, actor);
  if (role === 'MODERATOR') throw forbidden();
  if (deal.status !== 'CONVERTED') {
    throw conflict('تا پیش از تأیید بیعانه و رزرو، زمان تحویل ثبت نمی‌شود.');
  }
  if (await openDispute(database, deal.id)) {
    throw conflict('تا تعیین تکلیف پرونده اختلاف، تحویل متوقف است.');
  }

  const offered = await database
    .select({ method: animalListingDeliveries.method })
    .from(animalListingDeliveries)
    .where(eq(animalListingDeliveries.listingId, deal.listingId));
  if (!offered.some((row) => row.method === method)) {
    throw validation('این روش تحویل در آگهی اعلام نشده است؛ یکی از روش‌های اعلام‌شده فروشنده را انتخاب کنید.');
  }

  let vetLocationId: string | null = null;
  let placeFa = input.placeFa?.trim() || null;
  if (method === 'VET_CLINIC') {
    if (!input.vetLocationId) throw validation('مرکز دامپزشکی محل تحویل را انتخاب کنید.');
    // Validated against the directory itself: an inactive or unknown place is
    // not a meeting point, and choosing one is never a veterinary endorsement.
    const [location] = await database
      .select({ id: vetLocations.id, nameFa: vetLocations.nameFa, cityFa: vetLocations.cityFa, isActive: vetLocations.isActive })
      .from(vetLocations)
      .where(eq(vetLocations.id, input.vetLocationId))
      .limit(1);
    if (!location || !location.isActive) throw notFound('این مرکز دامپزشکی در فهرست فعال پیدا نشد.');
    vetLocationId = location.id;
    placeFa = placeFa ?? [location.nameFa, location.cityFa].filter(Boolean).join(' — ');
  }

  const [listing] = await database
    .select({ animalId: animalListings.animalId })
    .from(animalListings)
    .where(eq(animalListings.id, deal.listingId))
    .limit(1);
  if (!listing) throw notFound('این آگهی پیدا نشد.');

  const now = new Date();
  const existing = await handoverOfDeal(database, deal.id);

  return database.transaction(async (tx) => {
    if (existing !== null) {
      const status = existing.status as HandoverStatus;
      if (status === 'COMPLETED') throw conflict('این تحویل قبلاً کامل شده است.');
      if (status !== 'SCHEDULED' && !canMoveHandover(status, 'SCHEDULED', role as HandoverActor)) {
        throw conflict('تحویل در وضعیت «' + status + '» دوباره زمان‌بندی نمی‌شود.');
      }
      const [updated] = await tx
        .update(dealHandovers)
        .set({
          method,
          vetLocationId,
          placeFa,
          scheduledAt: input.scheduledAt,
          status: 'SCHEDULED',
          // A new arrangement invalidates the code of the old one.
          codeHash: null,
          codeIssuedAt: null,
          codeExpiresAt: null,
          codeAttempts: 0,
          codeLockedUntil: null,
          endedReasonFa: null,
          endedByAccountId: null,
          version: existing.version + 1,
          updatedAt: now,
        })
        .where(and(eq(dealHandovers.id, existing.id), eq(dealHandovers.version, existing.version)))
        .returning();
      if (!updated) throw conflict('این تحویل در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

      await recordAudit(tx, actor, {
        action: 'ANIMAL_HANDOVER_RESCHEDULED',
        targetType: 'DEAL_HANDOVER',
        targetId: updated.id,
        before: { status: existing.status, scheduledAt: existing.scheduledAt?.toISOString() ?? null },
        after: { method, scheduledAt: input.scheduledAt.toISOString(), vetLocationId },
      });
      await notifyOther(tx, deal, role, 'ANIMAL_HANDOVER_SCHEDULED', 'زمان تحویل تغییر کرد', 'زمان یا محل تحویل این معامله دوباره تعیین شد.');
      return updated;
    }

    const [created] = await tx
      .insert(dealHandovers)
      .values({
        inquiryId: deal.id,
        listingId: deal.listingId,
        animalId: listing.animalId,
        method,
        vetLocationId,
        placeFa,
        scheduledAt: input.scheduledAt,
      })
      .returning();

    await recordAudit(tx, actor, {
      action: 'ANIMAL_HANDOVER_SCHEDULED',
      targetType: 'DEAL_HANDOVER',
      targetId: created!.id,
      after: { method, scheduledAt: input.scheduledAt.toISOString(), vetLocationId },
    });
    await notifyOther(tx, deal, role, 'ANIMAL_HANDOVER_SCHEDULED', 'زمان تحویل تعیین شد', 'برای این معامله زمان و محل تحویل ثبت شد.');
    return created!;
  });
}

async function notifyOther(
  tx: DbClient,
  deal: InquiryRow,
  role: 'BUYER' | 'SELLER',
  kind: string,
  titleFa: string,
  bodyFa: string,
): Promise<void> {
  await createNotification(tx, {
    recipientAccountId: role === 'BUYER' ? deal.sellerAccountId : deal.buyerAccountId,
    kind,
    titleFa,
    bodyFa,
    resume: resumeContext({
      entity: { type: 'LISTING_INQUIRY', id: deal.id },
      step: 'HANDOVER',
      originRoute: '/account/purchases/' + deal.id,
    }),
  });
}

// ── the one-time code ──────────────────────────────────────────────────────

export interface IssuedCode {
  readonly code: string;
  readonly expiresAt: Date;
  readonly attemptsAllowed: number;
}

/**
 * Give the buyer a code.
 *
 * Only the buyer: the code exists so that the person receiving the animal
 * proves the seller is standing in front of them, and a code the seller could
 * mint for themselves would prove nothing. The plain code is returned exactly
 * once, to this caller, and only its hash is stored.
 */
export async function issueHandoverCode(
  database: Database,
  actor: Actor,
  inquiryId: string,
): Promise<IssuedCode> {
  const deal = await loadDeal(database, inquiryId);
  if (threadRole(deal, actor) !== 'BUYER') throw forbidden();
  if (await openDispute(database, deal.id)) {
    throw conflict('تا تعیین تکلیف پرونده اختلاف، کد تحویل صادر نمی‌شود.');
  }

  const handover = await handoverOfDeal(database, deal.id);
  if (handover === null) throw conflict('ابتدا زمان و محل تحویل را ثبت کنید.');
  const status = handover.status as HandoverStatus;
  if (status === 'COMPLETED') throw conflict('این تحویل قبلاً کامل شده است.');

  const policy = await codePolicy(database);
  const validity = await snapshotSetting(database, CODE_MINUTES_KEY);
  if (handover.codeIssues >= policy.maxIssues) {
    throw conflict(
      'برای این تحویل ' +
        handover.codeIssues.toLocaleString('fa-IR') +
        ' بار کد صادر شده است؛ برای ادامه با پشتیبانی هماهنگ کنید.',
    );
  }

  const now = new Date();
  if (handover.codeLockedUntil !== null && handover.codeLockedUntil.getTime() > now.getTime()) {
    throw conflict('به دلیل تلاش‌های ناموفق، صدور کد تازه موقتاً بسته است.');
  }

  const code = newCode();
  const expiresAt = new Date(now.getTime() + policy.validityMinutes * 60_000);

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(dealHandovers)
      .set({
        status: 'CODE_ISSUED',
        codeHash: hashCode(handover.id, code),
        codeIssuedAt: now,
        codeExpiresAt: expiresAt,
        codeAttempts: 0,
        codeLockedUntil: null,
        codeIssues: handover.codeIssues + 1,
        codeValidityMinutes: policy.validityMinutes,
        codeMaxAttempts: policy.maxAttempts,
        codeSettingVersion: validity.version,
        sellerEnteredAt: null,
        version: handover.version + 1,
        updatedAt: now,
      })
      .where(and(eq(dealHandovers.id, handover.id), eq(dealHandovers.version, handover.version)))
      .returning();
    if (!updated) throw conflict('این تحویل در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    // The code itself is never written to the audit trail or to a notification.
    await recordAudit(tx, actor, {
      action: 'ANIMAL_HANDOVER_CODE_ISSUED',
      targetType: 'DEAL_HANDOVER',
      targetId: handover.id,
      after: { expiresAt: expiresAt.toISOString(), issue: updated.codeIssues, validityMinutes: policy.validityMinutes },
    });
    await notifyOther(
      tx,
      deal,
      'BUYER',
      'ANIMAL_HANDOVER_CODE_ISSUED',
      'کد تحویل صادر شد',
      'خریدار کد تحویل را در اختیار دارد؛ هنگام تحویل، کد را از او بگیرید و در همین صفحه وارد کنید.',
    );
    return { code, expiresAt, attemptsAllowed: policy.maxAttempts };
  });
}

export type EnterCodeOutcome =
  | { readonly state: 'ACCEPTED'; readonly handover: HandoverRow }
  | { readonly state: 'WRONG'; readonly attemptsRemaining: number; readonly messageFa: string }
  | { readonly state: 'LOCKED'; readonly retryAfterSeconds: number; readonly messageFa: string }
  | { readonly state: 'EXPIRED'; readonly messageFa: string }
  | { readonly state: 'NO_CODE'; readonly messageFa: string };

/**
 * The seller types the buyer's code.
 *
 * Every wrong attempt is counted and the ceiling locks the code for a managed
 * period, so a six-digit number cannot be guessed at leisure. Nothing about
 * which digits were wrong is ever returned.
 */
export async function enterHandoverCode(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; code: string },
): Promise<EnterCodeOutcome> {
  const deal = await loadDeal(database, input.inquiryId);
  if (threadRole(deal, actor) !== 'SELLER') throw forbidden();

  const handover = await handoverOfDeal(database, deal.id);
  if (handover === null) throw conflict('برای این معامله تحویلی ثبت نشده است.');
  const status = handover.status as HandoverStatus;
  if (status === 'COMPLETED') throw conflict('این تحویل قبلاً کامل شده است.');
  if (status === 'ON_HOLD') throw conflict('تا تعیین تکلیف پرونده اختلاف، تحویل متوقف است.');

  const now = new Date();
  const allowed = codeAttemptAllowed(
    {
      codeHash: handover.codeHash,
      codeExpiresAt: handover.codeExpiresAt,
      codeAttempts: handover.codeAttempts,
      codeLockedUntil: handover.codeLockedUntil,
      codeMaxAttempts: handover.codeMaxAttempts,
    },
    now,
  );

  if (allowed.state === 'EXPIRED') {
    await database
      .update(dealHandovers)
      .set({ status: 'EXPIRED', version: handover.version + 1, updatedAt: now })
      .where(and(eq(dealHandovers.id, handover.id), eq(dealHandovers.version, handover.version)));
    return { state: 'EXPIRED', messageFa: allowed.messageFa };
  }
  if (allowed.state === 'LOCKED') {
    return { state: 'LOCKED', retryAfterSeconds: allowed.retryAfterSeconds, messageFa: allowed.messageFa };
  }
  if (allowed.state === 'NO_CODE') return { state: 'NO_CODE', messageFa: allowed.messageFa };

  const typed = input.code.replace(/[\s-]/g, '');
  const matches = /^[0-9]{6}$/.test(typed) && safeEqualHex(hashCode(handover.id, typed), handover.codeHash!);

  if (!matches) {
    const policy = await codePolicy(database);
    const next = afterWrongAttempt(
      {
        codeHash: handover.codeHash,
        codeExpiresAt: handover.codeExpiresAt,
        codeAttempts: handover.codeAttempts,
        codeLockedUntil: handover.codeLockedUntil,
        codeMaxAttempts: handover.codeMaxAttempts,
      },
      policy,
      now,
    );
    await database.transaction(async (tx) => {
      await tx
        .update(dealHandovers)
        .set({ codeAttempts: next.attempts, codeLockedUntil: next.lockedUntil, updatedAt: now })
        .where(eq(dealHandovers.id, handover.id));
      await recordAudit(tx, actor, {
        action: 'ANIMAL_HANDOVER_CODE_REJECTED',
        targetType: 'DEAL_HANDOVER',
        targetId: handover.id,
        // The attempt is recorded; the digits typed are not.
        after: { attempts: next.attempts, locked: next.lockedUntil !== null },
      });
    });
    return {
      state: 'WRONG',
      attemptsRemaining: next.attemptsRemaining,
      messageFa:
        next.lockedUntil === null
          ? 'کد درست نیست. ' + next.attemptsRemaining.toLocaleString('fa-IR') + ' تلاش باقی مانده است.'
          : 'کد درست نیست و ورود کد موقتاً بسته شد.',
    };
  }

  const [updated] = await database
    .update(dealHandovers)
    .set({
      status: 'SELLER_ENTERED',
      sellerEnteredAt: now,
      codeAttempts: 0,
      version: handover.version + 1,
      updatedAt: now,
    })
    .where(and(eq(dealHandovers.id, handover.id), eq(dealHandovers.version, handover.version)))
    .returning();
  if (!updated) throw conflict('این تحویل در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'ANIMAL_HANDOVER_CODE_ACCEPTED',
    targetType: 'DEAL_HANDOVER',
    targetId: handover.id,
    after: { at: now.toISOString() },
  });
  await createNotification(database, {
    recipientAccountId: deal.buyerAccountId,
    kind: 'ANIMAL_HANDOVER_CODE_ACCEPTED',
    titleFa: 'فروشنده کد تحویل را وارد کرد',
    bodyFa: 'اگر حیوان را تحویل گرفته‌اید، صورت‌جلسه را تأیید کنید تا مالکیت منتقل شود.',
    resume: resumeContext({
      entity: { type: 'LISTING_INQUIRY', id: deal.id },
      step: 'HANDOVER',
      originRoute: '/account/purchases/' + deal.id,
    }),
  });
  return { state: 'ACCEPTED', handover: updated };
}

// ── completing it ──────────────────────────────────────────────────────────

export interface CompletionResult {
  readonly handover: HandoverRow;
  readonly transfer: TransferRow;
}

/**
 * The buyer confirms, and the animal changes hands.
 *
 * Everything that must be true is read again here, inside the transaction that
 * writes the transfer, and the write itself is guarded: the animal's own
 * version, the deal's status and a unique index over the deal. Two confirmations
 * arriving together leave exactly one transfer, and any failure rolls the whole
 * thing back rather than leaving an animal half-sold.
 */
export async function confirmHandover(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; expectedVersion: number },
): Promise<CompletionResult> {
  const deal = await loadDeal(database, input.inquiryId);
  if (threadRole(deal, actor) !== 'BUYER') throw forbidden();
  return completeHandover(database, actor, deal, 'BUYER', input.expectedVersion, null);
}

/**
 * An administrator records a handover that really happened.
 *
 * For the case the product cannot otherwise answer: the meeting took place, the
 * code expired or the buyer's account is unreachable, and an animal is living
 * with somebody who is not its recorded owner. It bypasses the code — and
 * nothing else. Every condition is still checked, the reason is required, and
 * the transfer says which administrator recorded it, so recovery never becomes
 * a quiet way around the evidence.
 */
export async function recordHandoverByAdmin(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; reasonFa: string; expectedVersion: number },
): Promise<CompletionResult> {
  assertMarketplaceCapability(actor, 'ANIMAL_DISPUTE_DECIDE');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa.length < 10) throw validation('دلیل ثبت دستی تحویل را بنویسید؛ در تاریخچه و روی انتقال ثبت می‌شود.');
  const deal = await loadDeal(database, input.inquiryId);
  return completeHandover(database, actor, deal, 'ADMIN', input.expectedVersion, reasonFa);
}

async function completeHandover(
  database: Database,
  actor: Actor,
  deal: InquiryRow,
  by: 'BUYER' | 'ADMIN',
  expectedVersion: number,
  adminReasonFa: string | null,
): Promise<CompletionResult> {
  const handover = await handoverOfDeal(database, deal.id);
  if (handover === null) throw conflict('برای این معامله تحویلی ثبت نشده است.');
  const status = handover.status as HandoverStatus;
  if (status === 'COMPLETED') throw conflict('این تحویل قبلاً کامل شده است.');
  if (!canMoveHandover(status, 'COMPLETED', by)) {
    if (by === 'BUYER' && status !== 'SELLER_ENTERED') {
      throw conflict('تا وارد کردن کد تحویل توسط فروشنده، تأیید خریدار ثبت نمی‌شود.');
    }
    throw conflict('این تحویل در وضعیت فعلی کامل نمی‌شود.');
  }

  const statementVersion = await readText(database, STATEMENT_VERSION_KEY);
  const minimumAgeDays = await readInt(database, MIN_AGE_KEY);
  const now = new Date();

  return database.transaction(async (tx) => {
    // Everything is read here, not from what the screen believed a minute ago.
    const [animal] = await tx
      .select({
        id: animals.id,
        ownerAccountId: animals.ownerAccountId,
        status: animals.status,
        name: animals.name,
        petId: animals.petId,
        birthDate: animals.birthDate,
        version: animals.version,
      })
      .from(animals)
      .where(eq(animals.id, handover.animalId))
      .limit(1);
    if (!animal) throw notFound('این حیوان پیدا نشد.');

    const [chip] = await tx
      .select({ number: microchips.number })
      .from(microchips)
      .where(eq(microchips.animalId, animal.id))
      .limit(1);

    const [alreadyTransferred] = await tx
      .select({ id: animalOwnershipTransfers.id })
      .from(animalOwnershipTransfers)
      .where(eq(animalOwnershipTransfers.inquiryId, deal.id))
      .limit(1);

    const eligibility = await sellerEligibility(tx as Database, deal.sellerAccountId, animal.id);
    const deliverableAt = deliverableFrom(animal.birthDate, minimumAgeDays);
    const disputed = await openDispute(tx, deal.id);

    const blockers = transferBlockers({
      depositVerified: deal.reservedAt !== null && deal.paymentBatchId !== null,
      minimumAgeReached: deliverableAt !== null && deliverableAt.getTime() <= now.getTime(),
      microchipRegistered: chip !== undefined,
      // The seller must still be the owner or the authorised kennel: an animal
      // that changed hands between the deal and the meeting is not theirs to
      // give, whatever the advert said.
      sellerStillAuthorised: eligibility.allowed && animal.ownerAccountId === deal.sellerAccountId,
      animalTransferable: animal.status === 'REGISTERED',
      noExistingTransfer: alreadyTransferred === undefined,
      noOpenDispute: !disputed,
    });
    if (blockers.length > 0) {
      throw conflict(TRANSFER_CONDITION_FA[blockers[0]!]);
    }

    const [buyer] = await tx
      .select({ mobile: accounts.mobile })
      .from(accounts)
      .where(eq(accounts.id, deal.buyerAccountId))
      .limit(1);
    const [seller] = await tx
      .select({ mobile: accounts.mobile })
      .from(accounts)
      .where(eq(accounts.id, deal.sellerAccountId))
      .limit(1);

    const statementFa = handoverStatement({
      version: statementVersion,
      animalNameFa: animal.name ?? 'بدون نام',
      petId: animal.petId,
      microchipNumber: chip?.number ?? null,
      sellerMobile: seller!.mobile,
      buyerMobile: buyer!.mobile,
      priceToman: deal.finalPriceToman,
      depositToman: deal.depositAmountToman,
      methodFa: DELIVERY_METHOD_FA[handover.method as DeliveryMethod],
      placeFa: handover.placeFa,
      at: now,
    });

    const [updatedHandover] = await tx
      .update(dealHandovers)
      .set({
        status: 'COMPLETED',
        buyerConfirmedAt: now,
        // An administrator recording a meeting stands in for the entry the
        // parties could not make; the row says which of the two it was.
        sellerEnteredAt: handover.sellerEnteredAt ?? now,
        statementVersion,
        statementFa,
        finalPriceToman: deal.finalPriceToman,
        completedAt: now,
        endedReasonFa: adminReasonFa,
        endedByAccountId: by === 'ADMIN' ? actor.accountId : null,
        version: handover.version + 1,
        updatedAt: now,
      })
      .where(and(eq(dealHandovers.id, handover.id), eq(dealHandovers.version, expectedVersion)))
      .returning();
    if (!updatedHandover) throw conflict('این تحویل در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    let transfer: TransferRow;
    try {
      const [row] = await tx
        .insert(animalOwnershipTransfers)
        .values({
          animalId: animal.id,
          fromAccountId: animal.ownerAccountId,
          toAccountId: deal.buyerAccountId,
          reason: by === 'ADMIN' ? 'ADMIN_CORRECTION' : 'MARKETPLACE_SALE',
          inquiryId: deal.id,
          handoverId: handover.id,
          priceToman: deal.finalPriceToman,
          noteFa: adminReasonFa,
          recordedByAccountId: by === 'ADMIN' ? actor.accountId : null,
          transferredAt: now,
        })
        .returning();
      transfer = row!;
    } catch (error) {
      if (violates(error, 'animal_ownership_transfer_deal_key')) {
        throw conflict('این معامله همین حالا انتقال مالکیت ثبت کرده است.');
      }
      throw error;
    }

    // The animal keeps its whole record; only the current owner moves.
    const moved = await tx
      .update(animals)
      .set({ ownerAccountId: deal.buyerAccountId, version: animal.version + 1, updatedAt: now })
      .where(and(eq(animals.id, animal.id), eq(animals.version, animal.version)))
      .returning({ id: animals.id });
    if (moved.length === 0) throw conflict('پرونده این حیوان در این فاصله تغییر کرده است؛ دوباره تلاش کنید.');

    const [listing] = await tx
      .select({ id: animalListings.id, status: animalListings.status, version: animalListings.version })
      .from(animalListings)
      .where(eq(animalListings.id, deal.listingId))
      .limit(1);
    if (listing && listing.status === 'RESERVED') {
      await tx
        .update(animalListings)
        .set({
          status: 'SOLD',
          statusReasonFa: 'تحویل انجام و مالکیت منتقل شد.',
          statusChangedAt: now,
          version: listing.version + 1,
          updatedAt: now,
        })
        .where(and(eq(animalListings.id, listing.id), eq(animalListings.version, listing.version)));
    }

    const [closedDeal] = await tx
      .update(listingInquiries)
      .set({
        status: 'COMPLETED',
        closedReasonFa: 'تحویل انجام و مالکیت منتقل شد.',
        statusChangedAt: now,
        version: deal.version + 1,
        updatedAt: now,
      })
      .where(and(eq(listingInquiries.id, deal.id), eq(listingInquiries.status, 'CONVERTED')))
      .returning({ id: listingInquiries.id });
    if (!closedDeal) throw conflict('این معامله در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_OWNERSHIP_TRANSFERRED',
      targetType: 'ANIMAL',
      targetId: animal.id,
      targetVersion: animal.version + 1,
      before: { ownerAccountId: animal.ownerAccountId },
      after: {
        ownerAccountId: deal.buyerAccountId,
        inquiryId: deal.id,
        handoverId: handover.id,
        transferId: transfer.id,
        statementVersion,
        by,
      },
      reason: adminReasonFa,
    });

    for (const recipient of [deal.buyerAccountId, deal.sellerAccountId]) {
      await createNotification(tx, {
        recipientAccountId: recipient,
        kind: 'ANIMAL_OWNERSHIP_TRANSFERRED',
        titleFa: 'تحویل ثبت و مالکیت منتقل شد',
        bodyFa: 'صورت‌جلسه تحویل در پرونده این معامله ثبت شد و مالکیت حیوان در همزیست منتقل شد.',
        resume: resumeContext({
          entity: { type: 'LISTING_INQUIRY', id: deal.id },
          step: 'HANDOVER_COMPLETED',
          originRoute: '/account/purchases/' + deal.id,
        }),
      });
    }

    return { handover: updatedHandover, transfer };
  });
}

// ── the ways it does not happen ────────────────────────────────────────────

/**
 * Somebody refused at the door, or the meeting is being called off.
 *
 * Neither ends the deal: the deposit, the thread and the cancellation rules of
 * PROMPT-006 are untouched, and the two can arrange another meeting or take the
 * deal apart through the path that decides where the money goes.
 */
export async function endHandover(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; to: 'REFUSED' | 'CANCELLED'; reasonFa: string },
): Promise<HandoverRow> {
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل را بنویسید؛ برای طرف مقابل و در تاریخچه ثبت می‌شود.');

  const deal = await loadDeal(database, input.inquiryId);
  const role = threadRole(deal, actor);
  if (role === 'MODERATOR') throw forbidden();

  const handover = await handoverOfDeal(database, deal.id);
  if (handover === null) throw conflict('برای این معامله تحویلی ثبت نشده است.');
  const status = handover.status as HandoverStatus;
  if (!canMoveHandover(status, input.to, role)) throw conflict('این تغییر وضعیت مجاز نیست.');

  const now = new Date();
  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(dealHandovers)
      .set({
        status: input.to,
        endedReasonFa: reasonFa,
        endedByAccountId: actor.accountId,
        codeHash: null,
        codeExpiresAt: null,
        version: handover.version + 1,
        updatedAt: now,
      })
      .where(and(eq(dealHandovers.id, handover.id), eq(dealHandovers.version, handover.version)))
      .returning();
    if (!updated) throw conflict('این تحویل در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_HANDOVER_ENDED',
      targetType: 'DEAL_HANDOVER',
      targetId: handover.id,
      before: { status: handover.status },
      after: { status: input.to, by: role },
      reason: reasonFa,
    });
    await notifyOther(
      tx,
      deal,
      role,
      'ANIMAL_HANDOVER_ENDED',
      input.to === 'REFUSED' ? 'تحویل انجام نشد' : 'تحویل لغو شد',
      reasonFa,
    );
    return updated;
  });
}

/**
 * Hold a handover while a dispute is open.
 *
 * Called when a dispute is opened over a deal that already has a meeting
 * arranged, so nobody turns up to hand over an animal whose case is being
 * decided. Releasing it is an administrator's decision, not a side effect.
 */
export async function holdHandoverForDispute(tx: DbClient, inquiryId: string): Promise<void> {
  const [handover] = await tx
    .select()
    .from(dealHandovers)
    .where(eq(dealHandovers.inquiryId, inquiryId))
    .limit(1);
  if (!handover) return;
  const status = handover.status as HandoverStatus;
  if (!canMoveHandover(status, 'ON_HOLD', 'SYSTEM')) return;

  await tx
    .update(dealHandovers)
    .set({
      status: 'ON_HOLD',
      endedReasonFa: 'پرونده اختلاف باز است؛ تا تعیین تکلیف، تحویل متوقف می‌ماند.',
      codeHash: null,
      codeExpiresAt: null,
      version: handover.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(dealHandovers.id, handover.id), eq(dealHandovers.version, handover.version)));
}

/** An administrator releases a held handover so the two can meet again. */
export async function releaseHandoverHold(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; reasonFa: string },
): Promise<HandoverRow> {
  assertMarketplaceCapability(actor, 'ANIMAL_DISPUTE_DECIDE');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل رفع توقف را بنویسید.');

  const deal = await loadDeal(database, input.inquiryId);
  const handover = await handoverOfDeal(database, deal.id);
  if (handover === null) throw notFound('برای این معامله تحویلی ثبت نشده است.');
  if (handover.status !== 'ON_HOLD') throw conflict('این تحویل متوقف نیست.');
  if (await openDispute(database, deal.id)) {
    throw conflict('تا تعیین تکلیف پرونده اختلاف، توقف برداشته نمی‌شود.');
  }

  const now = new Date();
  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(dealHandovers)
      .set({ status: 'SCHEDULED', endedReasonFa: null, version: handover.version + 1, updatedAt: now })
      .where(and(eq(dealHandovers.id, handover.id), eq(dealHandovers.version, handover.version)))
      .returning();
    if (!updated) throw conflict('این تحویل در این فاصله تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_HANDOVER_HOLD_RELEASED',
      targetType: 'DEAL_HANDOVER',
      targetId: handover.id,
      reason: reasonFa,
    });
    return updated;
  });
}

// ── reads ──────────────────────────────────────────────────────────────────

export interface HandoverView {
  readonly handover: HandoverRow;
  readonly locationNameFa: string | null;
  readonly blockers: readonly string[];
  /** The statement as it would read if it were confirmed now (PROMPT-007). */
  readonly statementPreviewFa: string;
}

/**
 * One handover with the conditions that would stop it right now.
 *
 * Shown so the two people learn about a missing microchip or an animal below
 * the minimum age before they drive across town, not at the door. The same
 * list is checked again inside the transaction; this read is a courtesy, not
 * the guard.
 */
export async function handoverView(
  database: DbClient,
  deal: InquiryRow,
  now: Date = new Date(),
): Promise<HandoverView | null> {
  const handover = await handoverOfDeal(database, deal.id);
  if (handover === null) return null;

  const [location] = handover.vetLocationId
    ? await database
        .select({ nameFa: vetLocations.nameFa })
        .from(vetLocations)
        .where(eq(vetLocations.id, handover.vetLocationId))
        .limit(1)
    : [];

  const [animal] = await database
    .select({ id: animals.id, ownerAccountId: animals.ownerAccountId, status: animals.status, birthDate: animals.birthDate })
    .from(animals)
    .where(eq(animals.id, handover.animalId))
    .limit(1);

  const [chip] = await database
    .select({ id: microchips.id })
    .from(microchips)
    .where(eq(microchips.animalId, handover.animalId))
    .limit(1);

  const [transferred] = await database
    .select({ id: animalOwnershipTransfers.id })
    .from(animalOwnershipTransfers)
    .where(eq(animalOwnershipTransfers.inquiryId, deal.id))
    .limit(1);

  const minimumAgeDays = await readInt(database, MIN_AGE_KEY);
  const deliverableAt = deliverableFrom(animal?.birthDate ?? null, minimumAgeDays);

  const blockers = transferBlockers({
    depositVerified: deal.reservedAt !== null && deal.paymentBatchId !== null,
    minimumAgeReached: deliverableAt !== null && deliverableAt.getTime() <= now.getTime(),
    microchipRegistered: chip !== undefined,
    sellerStillAuthorised: animal?.ownerAccountId === deal.sellerAccountId,
    animalTransferable: animal?.status === 'REGISTERED',
    noExistingTransfer: transferred === undefined,
    noOpenDispute: !(await openDispute(database, deal.id)),
  });

  const [buyer] = await database
    .select({ mobile: accounts.mobile })
    .from(accounts)
    .where(eq(accounts.id, deal.buyerAccountId))
    .limit(1);
  const [seller] = await database
    .select({ mobile: accounts.mobile })
    .from(accounts)
    .where(eq(accounts.id, deal.sellerAccountId))
    .limit(1);
  const [animalFacts] = await database
    .select({ name: animals.name, petId: animals.petId })
    .from(animals)
    .where(eq(animals.id, handover.animalId))
    .limit(1);
  const [chipNumber] = await database
    .select({ number: microchips.number })
    .from(microchips)
    .where(eq(microchips.animalId, handover.animalId))
    .limit(1);

  return {
    handover,
    locationNameFa: location?.nameFa ?? null,
    blockers: blockers.map((code) => TRANSFER_CONDITION_FA[code]),
    // Shown before confirming so nobody agrees to a text they only see
    // afterwards; the frozen copy on the row is what the deal actually keeps.
    statementPreviewFa:
      handover.statementFa ??
      handoverStatement({
        version: await readText(database, STATEMENT_VERSION_KEY),
        animalNameFa: animalFacts?.name ?? 'بدون نام',
        petId: animalFacts?.petId ?? null,
        microchipNumber: chipNumber?.number ?? null,
        sellerMobile: seller?.mobile ?? '—',
        buyerMobile: buyer?.mobile ?? '—',
        priceToman: deal.finalPriceToman,
        depositToman: deal.depositAmountToman,
        methodFa: DELIVERY_METHOD_FA[handover.method as DeliveryMethod],
        placeFa: handover.placeFa,
        at: now,
      }),
  };
}

export interface HandoverLocationOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Active veterinary places, for the buyer choosing a meeting point.
 *
 * Read from the directory that already exists. Being listed here says the place
 * is real and active, and nothing at all about the animal.
 */
export async function handoverLocations(database: DbClient): Promise<readonly HandoverLocationOption[]> {
  const rows = await database
    .select({ id: vetLocations.id, nameFa: vetLocations.nameFa, cityFa: vetLocations.cityFa })
    .from(vetLocations)
    .where(eq(vetLocations.isActive, true))
    .orderBy(vetLocations.nameFa)
    .limit(200);
  return rows.map((row) => ({
    value: row.id,
    label: [row.nameFa, row.cityFa].filter(Boolean).join(' — '),
  }));
}

/** Which delivery methods this advert actually offers. */
export async function offeredDeliveryMethods(
  database: DbClient,
  listingId: string,
): Promise<readonly DeliveryMethod[]> {
  const rows = await database
    .select({ method: animalListingDeliveries.method })
    .from(animalListingDeliveries)
    .where(eq(animalListingDeliveries.listingId, listingId));
  return rows.map((row) => row.method as DeliveryMethod);
}

export interface OwnershipEntry {
  readonly id: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly reason: string;
  readonly priceToman: bigint | null;
  readonly transferredAt: Date;
}

/**
 * The chain of owners of one animal, newest first.
 *
 * The rows are never edited or removed: an animal that has been sold twice has
 * two of them, and the first owner stays in the record however many times it
 * changes hands afterwards.
 */
export async function ownershipHistory(
  database: DbClient,
  animalId: string,
): Promise<readonly OwnershipEntry[]> {
  return database
    .select({
      id: animalOwnershipTransfers.id,
      fromAccountId: animalOwnershipTransfers.fromAccountId,
      toAccountId: animalOwnershipTransfers.toAccountId,
      reason: animalOwnershipTransfers.reason,
      priceToman: animalOwnershipTransfers.priceToman,
      transferredAt: animalOwnershipTransfers.transferredAt,
    })
    .from(animalOwnershipTransfers)
    .where(eq(animalOwnershipTransfers.animalId, animalId))
    .orderBy(desc(animalOwnershipTransfers.transferredAt));
}

export interface AdminHandoverEntry {
  readonly inquiryId: string;
  readonly handoverId: string;
  readonly animalNameFa: string;
  readonly status: string;
  readonly scheduledAt: Date | null;
  readonly endedReasonFa: string | null;
  readonly version: number;
}

/** Handovers that are stuck: held, refused, expired or long overdue. */
export async function stuckHandovers(
  database: DbClient,
  actor: Actor,
): Promise<readonly AdminHandoverEntry[]> {
  assertMarketplaceCapability(actor, 'ANIMAL_DISPUTE_DECIDE');
  const rows = await database
    .select({
      inquiryId: dealHandovers.inquiryId,
      handoverId: dealHandovers.id,
      status: dealHandovers.status,
      scheduledAt: dealHandovers.scheduledAt,
      endedReasonFa: dealHandovers.endedReasonFa,
      version: dealHandovers.version,
      animalNameFa: animals.name,
    })
    .from(dealHandovers)
    .innerJoin(animals, eq(animals.id, dealHandovers.animalId))
    .where(inArray(dealHandovers.status, ['ON_HOLD', 'REFUSED', 'EXPIRED', 'SELLER_ENTERED']))
    .orderBy(dealHandovers.scheduledAt);
  return rows.map((row) => ({ ...row, animalNameFa: row.animalNameFa ?? 'بدون نام' }));
}

/** True when this actor may act on the administrative recovery surfaces. */
export const canRecoverHandovers = (actor: Actor): boolean =>
  hasMarketplaceCapability(actor, 'ANIMAL_DISPUTE_DECIDE');

export { isDeliveryMethod };
