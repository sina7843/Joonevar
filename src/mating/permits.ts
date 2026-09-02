/**
 * Official mating permits — §16, §17.2, D12, D13, D16.
 *
 * This is the official route and its own entity. The personal declaration of
 * §20 is a different record with a different identifier and route, and nothing
 * here can turn one into the other. Pregnancy, birth, a veterinarian's
 * confirmation and paper signatures are not prerequisites for issuing a permit,
 * and no digital signing gate exists.
 */
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { profiles } from '../db/schema/identity.ts';
import { animals } from '../db/schema/animals.ts';
import { paymentBatches } from '../db/schema/billing.ts';
import { matingPermits, permitAllocationShares } from '../db/schema/mating.ts';
import { pedigrees } from '../db/schema/pedigree.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { createBatch, findBatch, type BatchRecord } from '../billing/payments.ts';
import { assertEligible, eligibilityFor } from '../domain/eligibility/service.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import { humanCode } from '../domain/ids.ts';
import { normalizePedigreeCode } from '../domain/lineage.ts';
import {
  cooldownAdvisoryForAnimals,
  recordCooldownContinuation,
  type CooldownAdvisory,
} from './cooldown.ts';
import {
  assertAllocationRule,
  type AllocationRuleType,
  type AllocationSide,
  type ShareInput,
} from '../domain/allocation.ts';
import type { Actor } from '../authz/actor.ts';

export const PERMIT_FEE_KEY = 'fee.mating_permit_toman';

export type PermitRecord = typeof matingPermits.$inferSelect;
export type ShareRecord = typeof permitAllocationShares.$inferSelect;

export const PERMIT_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  AWAITING_COUNTERPARTY: 'در انتظار تأیید طرف مقابل',
  AWAITING_PAYMENT: 'در انتظار پرداخت',
  READY_TO_SUBMIT: 'آماده ارسال',
  UNDER_REVIEW: 'در حال بررسی',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  ISSUED: 'مجوز صادر شد',
  REJECTED: 'ردشده',
};

/** The permit's own identifier, distinct from every other document (§23.2). */
export const newPermitNo = (): string => 'MP-' + humanCode(8);

const EDITABLE = ['DRAFT', 'AWAITING_COUNTERPARTY', 'AWAITING_PAYMENT', 'NEEDS_CORRECTION'] as const;

export interface ResolvedParty {
  readonly animalId: string;
  readonly animalName: string | null;
  readonly ownerAccountId: string;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly pedigreeCode: string;
}

/**
 * Resolves the counterparty from a pedigree code — §16 steps 2 and 3.
 *
 * Only an issued pedigree resolves, and the party is whoever actually owns that
 * animal. The form never supplies an account id, so nothing a browser posts can
 * name a different person.
 */
export async function resolveByPedigreeCode(
  database: DbClient,
  rawCode: string,
): Promise<ResolvedParty> {
  const code = normalizePedigreeCode(rawCode);
  if (code === '') throw validation('کد شجره‌نامه را وارد کنید.');

  const [row] = await database
    .select({
      animalId: animals.id,
      animalName: animals.name,
      ownerAccountId: animals.ownerAccountId,
      sex: animals.sex,
      pedigreeCode: pedigrees.pedigreeCode,
    })
    .from(pedigrees)
    .innerJoin(animals, eq(animals.id, pedigrees.animalId))
    .where(eq(pedigrees.pedigreeCode, code))
    .limit(1);
  if (!row) throw notFound('حیوانی با این کد شجره‌نامه پیدا نشد.');
  return row;
}

/** The animals this person may put forward: their own, with a pedigree (§16). */
export async function eligibleAnimals(database: DbClient, actor: Actor) {
  return database
    .select({
      animalId: animals.id,
      name: animals.name,
      sex: animals.sex,
      pedigreeCode: pedigrees.pedigreeCode,
    })
    .from(pedigrees)
    .innerJoin(animals, eq(animals.id, pedigrees.animalId))
    .where(eq(animals.ownerAccountId, actor.accountId));
}

export interface StartPermitInput {
  readonly ownAnimalId: string;
  readonly counterpartyPedigreeCode: string;
}

/**
 * Opens the official permit — §16 steps 1 to 4.
 *
 * Both animals must be pedigreed, one male and one female, each really owned by
 * its own side. The counterparty is invited by a notification into this exact
 * case; there is no token a third party could replay.
 */
export async function startPermit(
  database: Database,
  actor: Actor,
  input: StartPermitInput,
): Promise<PermitRecord> {
  await assertEligible(database, actor.accountId, 'MATING_PERMIT');

  const mine = (await eligibleAnimals(database, actor)).find((row) => row.animalId === input.ownAnimalId);
  if (!mine) throw notFound('حیوان شجره‌دار شما پیدا نشد.');
  if (mine.sex !== 'MALE' && mine.sex !== 'FEMALE') throw validation('جنسیت این حیوان ثبت نشده است.');

  const other = await resolveByPedigreeCode(database, input.counterpartyPedigreeCode);
  if (other.animalId === mine.animalId) throw validation('حیوان مقابل نمی‌تواند همان حیوان باشد.');
  if (other.sex === mine.sex) throw validation('مجوز جفت‌گیری بین یک نر و یک ماده ثبت می‌شود.');
  if (other.sex !== 'MALE' && other.sex !== 'FEMALE') throw validation('جنسیت حیوان مقابل ثبت نشده است.');
  if (other.ownerAccountId === actor.accountId) {
    throw validation('برای دو حیوان یک مالک، طرف مقابلی برای تأیید وجود ندارد.');
  }

  const sire = mine.sex === 'MALE' ? mine.animalId : other.animalId;
  const dam = mine.sex === 'FEMALE' ? mine.animalId : other.animalId;

  const live = await database
    .select({ id: matingPermits.id })
    .from(matingPermits)
    .where(
      and(
        eq(matingPermits.sireAnimalId, sire),
        eq(matingPermits.damAnimalId, dam),
        inArray(matingPermits.status, [
          'DRAFT',
          'AWAITING_COUNTERPARTY',
          'AWAITING_PAYMENT',
          'READY_TO_SUBMIT',
          'UNDER_REVIEW',
          'NEEDS_CORRECTION',
        ]),
      ),
    );
  if (live.length > 0) throw conflict('برای این دو حیوان یک پرونده مجوز باز وجود دارد.');

  // §17.2: the same warning at every permit entry. It is advisory, so it is
  // recorded and the case opens anyway.
  const advisory = await cooldownAdvisoryForAnimals(database, [sire, dam]);

  return database.transaction(async (tx) => {
    const [permit] = await tx
      .insert(matingPermits)
      .values({
        initiatorAccountId: actor.accountId,
        counterpartyAccountId: other.ownerAccountId,
        sireAnimalId: sire,
        damAnimalId: dam,
        status: 'AWAITING_COUNTERPARTY',
        invitedAt: new Date(),
      })
      .returning();
    if (!permit) throw conflict('ساخت پرونده مجوز انجام نشد.');

    await recordAudit(tx, actor, {
      action: 'MATING_PERMIT_STARTED',
      targetType: 'MATING_CASE',
      targetId: permit.id,
      after: { sireAnimalId: sire, damAnimalId: dam, counterpartyAccountId: other.ownerAccountId },
    });
    await recordCooldownContinuation(tx, actor, advisory, {
      type: 'MATING_CASE',
      id: permit.id,
      step: 'PERMIT_START',
    });
    // The invitation is a notification into this case, addressed to the person
    // the pedigree code actually resolved to (§16 step 4, §23.4).
    await createNotification(tx, {
      recipientAccountId: other.ownerAccountId,
      kind: 'MATING_PERMIT_INVITATION',
      titleFa: 'دعوت به مجوز رسمی جفت‌گیری',
      bodyFa: 'برای حیوان شما یک پرونده مجوز رسمی باز شده است؛ تأیید یا رد آن با خود شماست.',
      resume: {
        entity: { type: 'MATING_CASE', id: permit.id },
        step: 'COUNTERPARTY_CONFIRMATION',
        originRoute: '/mating/permits/' + permit.id,
      },
    });
    return permit;
  });
}

/** Either side may read the case; nobody else can. */
export async function permitForParty(
  database: DbClient,
  actor: Actor,
  permitId: string,
): Promise<PermitRecord> {
  const [row] = await database.select().from(matingPermits).where(eq(matingPermits.id, permitId)).limit(1);
  if (!row) throw notFound('پرونده مجوز پیدا نشد.');
  if (row.initiatorAccountId !== actor.accountId && row.counterpartyAccountId !== actor.accountId) {
    throw notFound('پرونده مجوز پیدا نشد.');
  }
  return row;
}

export async function permitsOfParty(database: DbClient, actor: Actor): Promise<readonly PermitRecord[]> {
  return database
    .select()
    .from(matingPermits)
    .where(
      or(
        eq(matingPermits.initiatorAccountId, actor.accountId),
        eq(matingPermits.counterpartyAccountId, actor.accountId),
      ),
    )
    .orderBy(desc(matingPermits.createdAt));
}

/**
 * The counterparty's own confirmation — §16 step 4.
 *
 * It is bound to the signed-in actor and to this record: the account is the one
 * resolved from the pedigree code, never one a form posted.
 */
export async function confirmCounterparty(
  database: Database,
  actor: Actor,
  permitId: string,
  accept: boolean,
  reasonFa?: string | null,
): Promise<PermitRecord> {
  const permit = await permitForParty(database, actor, permitId);
  if (permit.counterpartyAccountId !== actor.accountId) {
    throw forbidden('تأیید این پرونده با طرف مقابل است.');
  }
  if (permit.status !== 'AWAITING_COUNTERPARTY') throw conflict('این پرونده در انتظار تأیید شما نیست.');
  const reason = (reasonFa ?? '').trim();
  if (!accept && reason.length < 3) throw validation('برای رد دعوت، ثبت دلیل الزامی است.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(matingPermits)
      .set({
        status: accept ? 'AWAITING_PAYMENT' : 'REJECTED',
        counterpartyConfirmedAt: accept ? new Date() : null,
        reasonFa: accept ? null : reason,
        version: permit.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(matingPermits.id, permitId), eq(matingPermits.version, permit.version)))
      .returning();
    if (!row) throw conflict('این پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: accept ? 'MATING_PERMIT_CONFIRMED' : 'MATING_PERMIT_DECLINED',
      targetType: 'MATING_CASE',
      targetId: permitId,
      targetVersion: row.version,
      reason: accept ? null : reason,
    });
    await createNotification(tx, {
      recipientAccountId: permit.initiatorAccountId,
      kind: accept ? 'MATING_PERMIT_CONFIRMED' : 'MATING_PERMIT_DECLINED',
      titleFa: accept ? 'طرف مقابل پرونده را تأیید کرد' : 'طرف مقابل دعوت را رد کرد',
      bodyFa: accept ? 'حالا می‌توانید توافق تقسیم را ثبت کنید.' : reason,
      resume: {
        entity: { type: 'MATING_CASE', id: permitId },
        step: 'ALLOCATION_RULE',
        originRoute: '/mating/permits/' + permitId,
      },
    });
    return row;
  });
}

// ── Allocation rule ───────────────────────────────────────────────────────

export async function sharesOfPermit(database: DbClient, permitId: string): Promise<readonly ShareRecord[]> {
  return database.select().from(permitAllocationShares).where(eq(permitAllocationShares.permitId, permitId));
}

/**
 * Records the pre-birth rule — §16 step 5.
 *
 * Only its structure is validated here. How it lands on real puppies is decided
 * after the litter exists and both sides confirm it (§19), so nothing about a
 * number of newborns is assumed or stored.
 */
export async function saveAllocationRule(
  database: Database,
  actor: Actor,
  permitId: string,
  input: { type: AllocationRuleType; shares: readonly ShareInput[]; noteFa?: string | null },
): Promise<PermitRecord> {
  const permit = await permitForParty(database, actor, permitId);
  if (permit.initiatorAccountId !== actor.accountId) throw forbidden('ثبت توافق تقسیم با آغازکننده پرونده است.');
  if (!(EDITABLE as readonly string[]).includes(permit.status)) {
    throw conflict('در وضعیت فعلی، تغییر توافق تقسیم ممکن نیست.');
  }
  if (permit.counterpartyConfirmedAt === null) throw conflict('ابتدا طرف مقابل باید پرونده را تأیید کند.');
  assertAllocationRule(input.type, input.shares);

  const [sire] = await database.select().from(animals).where(eq(animals.id, permit.sireAnimalId)).limit(1);
  const [dam] = await database.select().from(animals).where(eq(animals.id, permit.damAnimalId)).limit(1);
  if (!sire || !dam) throw notFound('پرونده حیوان پیدا نشد.');
  const ownerOf: Record<AllocationSide, string> = {
    SIRE_SIDE: sire.ownerAccountId,
    DAM_SIDE: dam.ownerAccountId,
  };

  const before = await sharesOfPermit(database, permitId);

  return database.transaction(async (tx) => {
    await tx.delete(permitAllocationShares).where(eq(permitAllocationShares.permitId, permitId));
    for (const share of input.shares) {
      await tx.insert(permitAllocationShares).values({
        permitId,
        side: share.side,
        partyAccountId: ownerOf[share.side],
        fixedCount: input.type === 'PERCENTAGE' ? null : (share.fixedCount ?? null),
        percent: input.type === 'FIXED' ? null : (share.percent ?? null),
      });
    }
    const [row] = await tx
      .update(matingPermits)
      .set({
        ruleType: input.type,
        ruleNoteFa: input.noteFa?.trim() || null,
        version: permit.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(matingPermits.id, permitId), eq(matingPermits.version, permit.version)))
      .returning();
    if (!row) throw conflict('این پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'MATING_PERMIT_RULE_SAVED',
      targetType: 'MATING_CASE',
      targetId: permitId,
      targetVersion: row.version,
      before: { shares: before.map((s) => ({ side: s.side, fixedCount: s.fixedCount, percent: s.percent })) },
      after: { type: input.type, shares: input.shares },
    });
    return row;
  });
}

// ── Cooldown ──────────────────────────────────────────────────────────────

/**
 * The cooldown advisory for the two animals of one permit — §17.2.
 *
 * The computation itself lives in `cooldown.ts` and is the same at every permit
 * entry: it reads only mutually confirmed dates, never invents a base date and
 * never withdraws the continue action.
 */
export async function cooldownAdvisory(
  database: DbClient,
  permit: PermitRecord,
): Promise<CooldownAdvisory> {
  return cooldownAdvisoryForAnimals(database, [permit.sireAnimalId, permit.damAnimalId]);
}

// ── Payment and submission ────────────────────────────────────────────────

export interface PermitReadiness {
  readonly ready: boolean;
  readonly reasonFa: string | null;
}

/** What §16 requires before the money step and the final submit. */
export async function permitReadiness(
  database: DbClient,
  permit: PermitRecord,
): Promise<PermitReadiness> {
  if (permit.counterpartyConfirmedAt === null) {
    return { ready: false, reasonFa: 'تأیید طرف مقابل هنوز ثبت نشده است.' };
  }
  if (!permit.ruleType) return { ready: false, reasonFa: 'توافق تقسیم هنوز ثبت نشده است.' };
  const shares = await sharesOfPermit(database, permit.id);
  if (shares.length !== 2) return { ready: false, reasonFa: 'توافق تقسیم برای هر دو طرف ثبت نشده است.' };
  return { ready: true, reasonFa: null };
}

export async function startPermitPayment(
  database: Database,
  actor: Actor,
  permitId: string,
): Promise<BatchRecord> {
  const permit = await permitForParty(database, actor, permitId);
  if (permit.initiatorAccountId !== actor.accountId) throw forbidden('پرداخت این پرونده با آغازکننده است.');
  if (permit.status === 'ISSUED') throw conflict('این مجوز صادر شده است.');
  const readiness = await permitReadiness(database, permit);
  if (!readiness.ready) throw conflict(readiness.reasonFa ?? 'اطلاعات پرونده کامل نیست.');

  if (permit.batchId) {
    const existing = await findBatch(database, permit.batchId);
    if (existing?.status === 'PAID') throw conflict('پرداخت این مجوز قبلاً تأیید شده است.');
    if (existing) return existing;
  }

  const batch = await createBatch(database, actor, {
    service: 'MATING_PERMIT',
    items: [{ targetType: 'MATING_CASE', targetId: permit.id, settingKey: PERMIT_FEE_KEY }],
    resume: {
      entity: { type: 'MATING_CASE', id: permit.id },
      step: 'PERMIT_PAYMENT',
      originRoute: '/mating/permits/' + permit.id,
    },
  });
  await database
    .update(matingPermits)
    .set({ batchId: batch.id, version: permit.version + 1, updatedAt: new Date() })
    .where(and(eq(matingPermits.id, permit.id), eq(matingPermits.version, permit.version)));
  return batch;
}

/** A verified payment opens the final submit; it does not issue anything. */
export async function markPermitPaid(tx: DbClient, batch: BatchRecord): Promise<void> {
  const [permit] = await tx.select().from(matingPermits).where(eq(matingPermits.batchId, batch.id)).limit(1);
  if (!permit) return;
  if (permit.status !== 'AWAITING_PAYMENT' && permit.status !== 'NEEDS_CORRECTION') return;

  await tx
    .update(matingPermits)
    .set({ status: 'READY_TO_SUBMIT', version: permit.version + 1, updatedAt: new Date() })
    .where(and(eq(matingPermits.id, permit.id), eq(matingPermits.version, permit.version)));
  await recordAudit(tx, null, {
    action: 'MATING_PERMIT_PAYMENT_VERIFIED',
    targetType: 'MATING_CASE',
    targetId: permit.id,
    after: { status: 'READY_TO_SUBMIT', batchId: batch.id },
  });
  for (const recipient of [permit.initiatorAccountId, permit.counterpartyAccountId]) {
    if (!recipient) continue;
    await createNotification(tx, {
      recipientAccountId: recipient,
      kind: 'MATING_PERMIT_PAYMENT_VERIFIED',
      titleFa: 'پرداخت مجوز جفت‌گیری تأیید شد',
      bodyFa: 'پرونده آماده ارسال برای بررسی عملیاتی است.',
      resume: {
        entity: { type: 'MATING_CASE', id: permit.id },
        step: 'PERMIT_SUBMIT',
        originRoute: '/mating/permits/' + permit.id,
      },
    });
  }
}

/** §16 step 7 and 8: the payment comes before the final submit. */
export async function submitPermit(
  database: Database,
  actor: Actor,
  permitId: string,
): Promise<PermitRecord> {
  const permit = await permitForParty(database, actor, permitId);
  if (permit.initiatorAccountId !== actor.accountId) throw forbidden('ارسال این پرونده با آغازکننده است.');
  if (permit.status === 'UNDER_REVIEW') throw conflict('این پرونده در صف بررسی است.');
  if (permit.status === 'ISSUED') throw conflict('این مجوز صادر شده است.');
  if (permit.status !== 'READY_TO_SUBMIT' && permit.status !== 'NEEDS_CORRECTION') {
    throw conflict('ابتدا پرداخت هزینه مجوز را کامل کنید.');
  }
  const batch = permit.batchId ? await findBatch(database, permit.batchId) : null;
  if (batch?.status !== 'PAID') throw conflict('ابتدا پرداخت هزینه مجوز را کامل کنید.');

  const readiness = await permitReadiness(database, permit);
  if (!readiness.ready) throw conflict(readiness.reasonFa ?? 'اطلاعات پرونده کامل نیست.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(matingPermits)
      .set({
        status: 'UNDER_REVIEW',
        submittedAt: new Date(),
        reasonFa: null,
        version: permit.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(matingPermits.id, permitId), eq(matingPermits.version, permit.version)))
      .returning();
    if (!row) throw conflict('این پرونده هم‌زمان تغییر کرده است.');
    await recordAudit(tx, actor, {
      action: 'MATING_PERMIT_SUBMITTED',
      targetType: 'MATING_CASE',
      targetId: permitId,
      targetVersion: row.version,
      before: { status: permit.status },
      after: { status: 'UNDER_REVIEW' },
    });
    return row;
  });
}

// ── Operational review ────────────────────────────────────────────────────

function assertOperational(actor: Actor): void {
  if (actor.context !== 'ASSOCIATION_OPERATOR') {
    throw forbidden('بررسی مجوز جفت‌گیری در محیط عملیاتی انجمن انجام می‌شود.');
  }
}

export async function permitQueue(database: DbClient, actor: Actor): Promise<readonly PermitRecord[]> {
  assertOperational(actor);
  return database
    .select()
    .from(matingPermits)
    .where(eq(matingPermits.status, 'UNDER_REVIEW'))
    .orderBy(matingPermits.submittedAt);
}

export async function findPermit(database: DbClient, id: string): Promise<PermitRecord | null> {
  const [row] = await database.select().from(matingPermits).where(eq(matingPermits.id, id)).limit(1);
  return row ?? null;
}

export interface PermitDecision {
  readonly permitId: string;
  readonly decision: 'ISSUED' | 'NEEDS_CORRECTION' | 'REJECTED';
  readonly reasonFa?: string | null;
  readonly expectedVersion?: number;
}

/**
 * The operational decision — §16 steps 8 and 9.
 *
 * Issuing creates the official case identifier once. Pregnancy, birth, a
 * veterinarian's confirmation and paper signatures are not consulted, because
 * none of them is a prerequisite for this permit (§16, §12.5, D13).
 */
export async function reviewPermit(
  database: Database,
  actor: Actor,
  input: PermitDecision,
): Promise<PermitRecord> {
  assertOperational(actor);
  const permit = await findPermit(database, input.permitId);
  if (!permit) throw notFound('پرونده مجوز پیدا نشد.');
  if (permit.status !== 'UNDER_REVIEW') throw conflict('این پرونده در انتظار بررسی نیست.');
  if (input.expectedVersion !== undefined && input.expectedVersion !== permit.version) {
    throw versionStale(input.expectedVersion, permit.version);
  }
  const reason = (input.reasonFa ?? '').trim();
  if (input.decision !== 'ISSUED' && reason.length < 3) throw validation('ثبت دلیل الزامی است.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(matingPermits)
      .set({
        status: input.decision,
        reasonFa: input.decision === 'ISSUED' ? null : reason,
        reviewedByAccountId: actor.accountId,
        reviewedAt: new Date(),
        // Issued exactly once: an already numbered permit keeps its number.
        permitNo: input.decision === 'ISSUED' ? (permit.permitNo ?? newPermitNo()) : permit.permitNo,
        issuedAt: input.decision === 'ISSUED' ? (permit.issuedAt ?? new Date()) : permit.issuedAt,
        version: permit.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(matingPermits.id, permit.id), eq(matingPermits.version, permit.version)))
      .returning();
    if (!row) throw conflict('این پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: input.decision === 'ISSUED' ? 'MATING_PERMIT_ISSUED' : 'MATING_PERMIT_REVIEWED',
      targetType: 'MATING_CASE',
      targetId: permit.id,
      targetVersion: row.version,
      reason: input.decision === 'ISSUED' ? null : reason,
      before: { status: permit.status },
      after: { status: input.decision, permitNo: row.permitNo },
    });
    // Both animals' files gain the same event, so each profile shows it (§10).
    for (const animalId of [permit.sireAnimalId, permit.damAnimalId]) {
      await recordAudit(tx, actor, {
        action: input.decision === 'ISSUED' ? 'ANIMAL_MATING_PERMIT_ISSUED' : 'ANIMAL_MATING_PERMIT_REVIEWED',
        targetType: 'ANIMAL',
        targetId: animalId,
        after: { permitId: permit.id, permitNo: row.permitNo, status: input.decision },
      });
    }
    for (const recipient of [permit.initiatorAccountId, permit.counterpartyAccountId]) {
      if (!recipient) continue;
      await createNotification(tx, {
        recipientAccountId: recipient,
        kind: 'MATING_PERMIT_' + input.decision,
        titleFa:
          input.decision === 'ISSUED'
            ? 'مجوز رسمی جفت‌گیری صادر شد'
            : input.decision === 'NEEDS_CORRECTION'
              ? 'پرونده مجوز نیازمند اصلاح است'
              : 'پرونده مجوز رد شد',
        bodyFa: input.decision === 'ISSUED' ? 'مجوز در همان پرونده قابل مشاهده است.' : reason,
        resume: {
          entity: { type: 'MATING_CASE', id: permit.id },
          step: 'PERMIT_REVIEW',
          originRoute: '/mating/permits/' + permit.id,
        },
      });
    }
    return row;
  });
}

/** The official cases an animal is part of, for its profile and lineage view. */
export async function permitsOfAnimal(
  database: DbClient,
  animalId: string,
): Promise<readonly PermitRecord[]> {
  return database
    .select()
    .from(matingPermits)
    .where(or(eq(matingPermits.sireAnimalId, animalId), eq(matingPermits.damAnimalId, animalId)))
    .orderBy(desc(matingPermits.createdAt));
}

export async function permitEntry(database: DbClient, actor: Actor) {
  const [eligibility, permits] = await Promise.all([
    eligibilityFor(database, actor.accountId, 'MATING_PERMIT'),
    permitsOfParty(database, actor),
  ]);
  return { eligibility, permits };
}

export async function permitBatch(database: DbClient, permit: PermitRecord) {
  if (!permit.batchId) return null;
  const [row] = await database.select().from(paymentBatches).where(eq(paymentBatches.id, permit.batchId)).limit(1);
  return row ?? null;
}

/**
 * A person's name as the other side may see it — §16 step 3, §23.3.
 *
 * Someone who types a pedigree code learns enough to know whom they are dealing
 * with, and no more: the family name is shortened to an initial and no contact
 * detail is exposed.
 */
export function maskedName(firstName: string, lastName: string): string {
  const initial = lastName.trim().slice(0, 1);
  return firstName.trim() + (initial ? ' ' + initial + '.' : '');
}

async function displayName(database: DbClient, accountId: string | null): Promise<string> {
  if (!accountId) return '—';
  const [row] = await database
    .select({ firstName: profiles.firstName, lastName: profiles.lastName })
    .from(profiles)
    .where(eq(profiles.accountId, accountId))
    .limit(1);
  return row ? maskedName(row.firstName, row.lastName) : '—';
}

export interface PermitAnimalView {
  readonly id: string;
  readonly name: string | null;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly pedigreeCode: string | null;
  readonly ownerAccountId: string;
  readonly ownerName: string;
}

export interface PermitView {
  readonly permit: PermitRecord;
  readonly sire: PermitAnimalView;
  readonly dam: PermitAnimalView;
  readonly shares: readonly ShareRecord[];
  readonly initiatorName: string;
  readonly counterpartyName: string;
}

async function animalView(database: DbClient, animalId: string): Promise<PermitAnimalView> {
  const [row] = await database
    .select({
      id: animals.id,
      name: animals.name,
      sex: animals.sex,
      ownerAccountId: animals.ownerAccountId,
      pedigreeCode: pedigrees.pedigreeCode,
    })
    .from(animals)
    .leftJoin(pedigrees, eq(pedigrees.animalId, animals.id))
    .where(eq(animals.id, animalId))
    .limit(1);
  if (!row) throw notFound('پرونده حیوان پیدا نشد.');
  return { ...row, ownerName: await displayName(database, row.ownerAccountId) };
}

/** Everything §16 step 6 asks the review screen to show, in one read. */
export async function permitView(database: DbClient, permit: PermitRecord): Promise<PermitView> {
  const [sire, dam, shares, initiatorName, counterpartyName] = await Promise.all([
    animalView(database, permit.sireAnimalId),
    animalView(database, permit.damAnimalId),
    sharesOfPermit(database, permit.id),
    displayName(database, permit.initiatorAccountId),
    displayName(database, permit.counterpartyAccountId),
  ]);
  return { permit, sire, dam, shares, initiatorName, counterpartyName };
}
