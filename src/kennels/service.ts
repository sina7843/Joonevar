/**
 * Breeder activation and kennels — §15, D06, D10, D16.
 *
 * The breeder context is what an approved kennel produces. There is no separate
 * role-activation payment and no extra breeder document: the prerequisites are
 * the ones §15.2 lists — an active membership and at least one animal with a
 * registration sheet — and nothing new is invented because a role exists.
 */
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accountRoles, referenceBreeds } from '../db/schema/core.ts';
import { paymentBatches } from '../db/schema/billing.ts';
import { kennelBreeds, kennels } from '../db/schema/kennels.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { createBatch, findBatch, type BatchRecord } from '../billing/payments.ts';
import { assertEligible, eligibilityFor } from '../domain/eligibility/service.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';

export const KENNEL_FEE_KEY = 'fee.kennel_registration_toman';

export type KennelRecord = typeof kennels.$inferSelect;
export type KennelBreedRecord = typeof kennelBreeds.$inferSelect;

export const KENNEL_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  READY_TO_SUBMIT: 'آماده ارسال',
  UNDER_REVIEW: 'در حال بررسی انجمن',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
};

/** States in which the owner may still edit the kennel's own fields. */
const EDITABLE = ['DRAFT', 'READY_TO_SUBMIT', 'NEEDS_CORRECTION'] as const;
/** A person may only have one kennel that is not rejected at a time. */
const LIVE = ['DRAFT', 'READY_TO_SUBMIT', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'APPROVED'] as const;

const trimmed = (value: string | null | undefined): string | null => {
  const out = (value ?? '').trim();
  return out === '' ? null : out;
};

export async function kennelOfOwner(database: DbClient, accountId: string): Promise<KennelRecord | null> {
  const [row] = await database
    .select()
    .from(kennels)
    .where(and(eq(kennels.ownerAccountId, accountId), inArray(kennels.status, [...LIVE])))
    .orderBy(desc(kennels.createdAt))
    .limit(1);
  return row ?? null;
}

export async function requireOwnKennel(
  database: DbClient,
  actor: Actor,
  kennelId: string,
): Promise<KennelRecord> {
  const [row] = await database.select().from(kennels).where(eq(kennels.id, kennelId)).limit(1);
  // Same answer for "not yours" and "does not exist" (§23.4).
  if (!row || row.ownerAccountId !== actor.accountId) throw notFound('پرونده کنل پیدا نشد.');
  return row;
}

/**
 * Opens or resumes the registration — §15.2, the «شروع ثبت کنل» entry.
 *
 * The gate is exactly the one the source names; holding the breeder role is
 * never itself a condition, and never a shortcut either.
 */
export async function startKennel(database: Database, actor: Actor): Promise<KennelRecord> {
  await assertEligible(database, actor.accountId, 'KENNEL');
  const existing = await kennelOfOwner(database, actor.accountId);
  if (existing) return existing;

  return database.transaction(async (tx) => {
    const [row] = await tx.insert(kennels).values({ ownerAccountId: actor.accountId }).returning();
    if (!row) throw conflict('ساخت پرونده کنل انجام نشد.');
    await recordAudit(tx, actor, {
      action: 'KENNEL_STARTED',
      targetType: 'KENNEL',
      targetId: row.id,
      targetVersion: row.version,
    });
    return row;
  });
}

export interface KennelInput {
  readonly nameFa?: string | null;
  readonly nameEn?: string | null;
  readonly phone?: string | null;
  readonly provinceFa?: string | null;
  readonly cityFa?: string | null;
  readonly addressFa?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly noteFa?: string | null;
}

export async function saveKennel(
  database: Database,
  actor: Actor,
  kennelId: string,
  input: KennelInput,
  expectedVersion?: number,
): Promise<KennelRecord> {
  const current = await requireOwnKennel(database, actor, kennelId);
  if (!(EDITABLE as readonly string[]).includes(current.status)) {
    throw conflict('در وضعیت فعلی، ویرایش اطلاعات کنل ممکن نیست.');
  }
  if (expectedVersion !== undefined && expectedVersion !== current.version) {
    throw versionStale(expectedVersion, current.version);
  }

  const name = input.nameFa === undefined ? current.nameFa : trimmed(input.nameFa);
  if (name !== null && name.length < 2) throw validation('نام کنل باید حداقل دو نویسه باشد.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(kennels)
      .set({
        nameFa: name,
        nameEn: input.nameEn === undefined ? current.nameEn : trimmed(input.nameEn),
        phone: input.phone === undefined ? current.phone : trimmed(input.phone),
        provinceFa: input.provinceFa === undefined ? current.provinceFa : trimmed(input.provinceFa),
        cityFa: input.cityFa === undefined ? current.cityFa : trimmed(input.cityFa),
        addressFa: input.addressFa === undefined ? current.addressFa : trimmed(input.addressFa),
        latitude: input.latitude === undefined ? current.latitude : input.latitude,
        longitude: input.longitude === undefined ? current.longitude : input.longitude,
        noteFa: input.noteFa === undefined ? current.noteFa : trimmed(input.noteFa),
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(kennels.id, kennelId), eq(kennels.version, current.version)))
      .returning();
    if (!row) throw conflict('این پرونده هم‌زمان تغییر کرده است.');
    await recordAudit(tx, actor, {
      action: 'KENNEL_UPDATED',
      targetType: 'KENNEL',
      targetId: kennelId,
      targetVersion: row.version,
    });
    return row;
  });
}

// ── Breeds ────────────────────────────────────────────────────────────────

/** Persian or English, from the same registry the animal form uses (§15.2). */
export async function searchBreeds(database: DbClient, term: string | null, limit = 20) {
  const value = trimmed(term);
  const rows = value
    ? await database
        .select()
        .from(referenceBreeds)
        .where(or(ilike(referenceBreeds.nameFa, '%' + value + '%'), ilike(referenceBreeds.nameEn, '%' + value + '%')))
        .limit(limit)
    : await database.select().from(referenceBreeds).limit(limit);
  return rows.sort((a, b) => a.nameFa.localeCompare(b.nameFa, 'fa'));
}

export async function breedsOfKennel(database: DbClient, kennelId: string) {
  return database
    .select({
      id: kennelBreeds.id,
      breedId: referenceBreeds.id,
      nameFa: referenceBreeds.nameFa,
      nameEn: referenceBreeds.nameEn,
    })
    .from(kennelBreeds)
    .innerJoin(referenceBreeds, eq(referenceBreeds.id, kennelBreeds.breedId))
    .where(eq(kennelBreeds.kennelId, kennelId));
}

/**
 * Adding a breed — §15.3.
 *
 * After approval this is an ordinary edit: no new payment and no second review,
 * with the before and after recorded against the actor and the time.
 */
export async function addBreed(
  database: Database,
  actor: Actor,
  kennelId: string,
  breedId: string,
): Promise<void> {
  const kennel = await requireOwnKennel(database, actor, kennelId);
  if (kennel.status === 'REJECTED') throw conflict('این پرونده رد شده است.');
  if (kennel.status === 'UNDER_REVIEW') throw conflict('تا پایان بررسی انجمن، فهرست نژادها تغییر نمی‌کند.');

  const [breed] = await database.select().from(referenceBreeds).where(eq(referenceBreeds.id, breedId)).limit(1);
  if (!breed) throw notFound('نژاد انتخاب‌شده در فهرست مرجع نیست.');

  const before = await breedsOfKennel(database, kennelId);
  if (before.some((row) => row.breedId === breedId)) return;

  await database.transaction(async (tx) => {
    await tx.insert(kennelBreeds).values({ kennelId, breedId, addedByAccountId: actor.accountId });
    await recordAudit(tx, actor, {
      action: 'KENNEL_BREED_ADDED',
      targetType: 'KENNEL',
      targetId: kennelId,
      before: { breeds: before.map((row) => row.nameFa) },
      after: { breeds: [...before.map((row) => row.nameFa), breed.nameFa] },
    });
  });
}

/** Removing a breed, except the last one — §15.3. */
export async function removeBreed(
  database: Database,
  actor: Actor,
  kennelId: string,
  breedId: string,
): Promise<void> {
  const kennel = await requireOwnKennel(database, actor, kennelId);
  if (kennel.status === 'UNDER_REVIEW') throw conflict('تا پایان بررسی انجمن، فهرست نژادها تغییر نمی‌کند.');

  const before = await breedsOfKennel(database, kennelId);
  if (!before.some((row) => row.breedId === breedId)) throw notFound('این نژاد در فهرست کنل نیست.');
  if (before.length <= 1) throw conflict('حذف آخرین نژاد کنل مجاز نیست؛ حداقل یک نژاد لازم است.');

  await database.transaction(async (tx) => {
    await tx
      .delete(kennelBreeds)
      .where(and(eq(kennelBreeds.kennelId, kennelId), eq(kennelBreeds.breedId, breedId)));
    await recordAudit(tx, actor, {
      action: 'KENNEL_BREED_REMOVED',
      targetType: 'KENNEL',
      targetId: kennelId,
      before: { breeds: before.map((row) => row.nameFa) },
      after: { breeds: before.filter((row) => row.breedId !== breedId).map((row) => row.nameFa) },
    });
  });
}

// ── Payment and submission ────────────────────────────────────────────────

export interface SubmitReadiness {
  readonly ready: boolean;
  readonly reasonFa: string | null;
}

/** What §15.2 requires before the kennel may be sent for review. */
export async function submitReadiness(
  database: DbClient,
  kennel: KennelRecord,
): Promise<SubmitReadiness> {
  if (!kennel.nameFa) return { ready: false, reasonFa: 'نام کنل لازم است.' };
  // The kennel's own address is required; the residence on the account is not.
  if (!kennel.cityFa || !kennel.addressFa) {
    return { ready: false, reasonFa: 'نشانی و موقعیت کنل برای ارسال لازم است.' };
  }
  const breeds = await breedsOfKennel(database, kennel.id);
  if (breeds.length === 0) return { ready: false, reasonFa: 'حداقل یک نژاد پرورشی انتخاب کنید.' };
  return { ready: true, reasonFa: null };
}

/**
 * Starts the one payment §15.2 names, reusing the existing primitives.
 *
 * There is no separate fee for activating the role; this is the kennel
 * registration service of §22 and nothing else.
 */
export async function startKennelPayment(
  database: Database,
  actor: Actor,
  kennelId: string,
): Promise<BatchRecord> {
  const kennel = await requireOwnKennel(database, actor, kennelId);
  if (kennel.status !== 'DRAFT' && kennel.status !== 'NEEDS_CORRECTION') {
    throw conflict('در وضعیت فعلی، پرداخت ثبت کنل لازم نیست.');
  }
  const readiness = await submitReadiness(database, kennel);
  if (!readiness.ready) throw conflict(readiness.reasonFa ?? 'اطلاعات کنل کامل نیست.');

  if (kennel.batchId) {
    const existing = await findBatch(database, kennel.batchId);
    if (existing && existing.status !== 'PAID') return existing;
    if (existing?.status === 'PAID') throw conflict('پرداخت این کنل قبلاً تأیید شده است.');
  }

  const batch = await createBatch(database, actor, {
    service: 'KENNEL_REGISTRATION',
    items: [{ targetType: 'KENNEL', targetId: kennel.id, settingKey: KENNEL_FEE_KEY }],
    resume: {
      entity: { type: 'KENNEL', id: kennel.id },
      step: 'KENNEL_PAYMENT',
      originRoute: '/kennels/' + kennel.id,
    },
  });

  await database
    .update(kennels)
    .set({ batchId: batch.id, version: kennel.version + 1, updatedAt: new Date() })
    .where(and(eq(kennels.id, kennel.id), eq(kennels.version, kennel.version)));
  return batch;
}

/** The verified payment moves the kennel to the step before submission. */
export async function markKennelPaid(tx: DbClient, batch: BatchRecord): Promise<void> {
  const [kennel] = await tx.select().from(kennels).where(eq(kennels.batchId, batch.id)).limit(1);
  if (!kennel) return;
  if (kennel.status !== 'DRAFT' && kennel.status !== 'NEEDS_CORRECTION') return;

  await tx
    .update(kennels)
    .set({ status: 'READY_TO_SUBMIT', version: kennel.version + 1, updatedAt: new Date() })
    .where(and(eq(kennels.id, kennel.id), eq(kennels.version, kennel.version)));
  await recordAudit(tx, null, {
    action: 'KENNEL_PAYMENT_VERIFIED',
    targetType: 'KENNEL',
    targetId: kennel.id,
    after: { status: 'READY_TO_SUBMIT', batchId: batch.id },
  });
  await createNotification(tx, {
    recipientAccountId: kennel.ownerAccountId,
    kind: 'KENNEL_PAYMENT_VERIFIED',
    titleFa: 'پرداخت ثبت کنل تأیید شد',
    bodyFa: 'حالا می‌توانید پرونده کنل را برای بررسی انجمن ارسال کنید.',
    resume: {
      entity: { type: 'KENNEL', id: kennel.id },
      step: 'KENNEL_SUBMIT',
      originRoute: '/kennels/' + kennel.id,
    },
  });
}

export async function submitKennel(
  database: Database,
  actor: Actor,
  kennelId: string,
): Promise<KennelRecord> {
  const kennel = await requireOwnKennel(database, actor, kennelId);
  if (kennel.status === 'UNDER_REVIEW') throw conflict('این پرونده در صف بررسی انجمن است.');
  if (kennel.status === 'APPROVED') throw conflict('این کنل تأیید شده است.');
  if (kennel.status === 'DRAFT') throw conflict('ابتدا پرداخت ثبت کنل را کامل کنید.');

  const readiness = await submitReadiness(database, kennel);
  if (!readiness.ready) throw conflict(readiness.reasonFa ?? 'اطلاعات کنل کامل نیست.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(kennels)
      .set({
        status: 'UNDER_REVIEW',
        submittedAt: new Date(),
        reasonFa: null,
        version: kennel.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(kennels.id, kennelId), eq(kennels.version, kennel.version)))
      .returning();
    if (!row) throw conflict('این پرونده هم‌زمان تغییر کرده است.');
    await recordAudit(tx, actor, {
      action: 'KENNEL_SUBMITTED',
      targetType: 'KENNEL',
      targetId: kennelId,
      targetVersion: row.version,
      before: { status: kennel.status },
      after: { status: 'UNDER_REVIEW' },
    });
    return row;
  });
}

// ── Association review ────────────────────────────────────────────────────

function assertAssociation(actor: Actor): void {
  if (actor.context !== 'ASSOCIATION_OPERATOR') throw forbidden('بررسی کنل فقط در محیط انجمن انجام می‌شود.');
}

export async function kennelQueue(database: DbClient, actor: Actor): Promise<readonly KennelRecord[]> {
  assertAssociation(actor);
  return database
    .select()
    .from(kennels)
    .where(eq(kennels.status, 'UNDER_REVIEW'))
    .orderBy(kennels.submittedAt);
}

export async function findKennel(database: DbClient, id: string): Promise<KennelRecord | null> {
  const [row] = await database.select().from(kennels).where(eq(kennels.id, id)).limit(1);
  return row ?? null;
}

export interface KennelDecision {
  readonly kennelId: string;
  readonly decision: 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED';
  readonly reasonFa?: string | null;
  readonly expectedVersion?: number;
}

/**
 * The association's decision — §15.2, §21.2, §21.5.
 *
 * Approving it is what makes the breeder context real (§15.1): the role becomes
 * active here, from inside the kennel flow, and no separate activation payment
 * or document is ever asked for.
 */
export async function reviewKennel(
  database: Database,
  actor: Actor,
  input: KennelDecision,
): Promise<KennelRecord> {
  assertAssociation(actor);
  const current = await findKennel(database, input.kennelId);
  if (!current) throw notFound('پرونده کنل پیدا نشد.');
  if (current.status !== 'UNDER_REVIEW') throw conflict('این پرونده در انتظار بررسی نیست.');
  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
    throw versionStale(input.expectedVersion, current.version);
  }
  const reason = (input.reasonFa ?? '').trim();
  if (input.decision !== 'APPROVED' && reason.length < 3) throw validation('ثبت دلیل الزامی است.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(kennels)
      .set({
        status: input.decision,
        reasonFa: input.decision === 'APPROVED' ? null : reason,
        reviewedByAccountId: actor.accountId,
        reviewedAt: new Date(),
        approvedAt: input.decision === 'APPROVED' ? new Date() : current.approvedAt,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(kennels.id, current.id), eq(kennels.version, current.version)))
      .returning();
    if (!row) throw conflict('این پرونده هم‌زمان تغییر کرده است.');

    if (input.decision === 'APPROVED') {
      // The breeder context comes from the approved kennel and nothing else.
      const [role] = await tx
        .select()
        .from(accountRoles)
        .where(and(eq(accountRoles.accountId, current.ownerAccountId), eq(accountRoles.role, 'BREEDER')))
        .limit(1);
      if (role) {
        await tx
          .update(accountRoles)
          .set({ status: 'ACTIVE', grantedAt: role.grantedAt ?? new Date() })
          .where(eq(accountRoles.id, role.id));
      } else {
        await tx
          .insert(accountRoles)
          .values({
            accountId: current.ownerAccountId,
            role: 'BREEDER',
            status: 'ACTIVE',
            grantedAt: new Date(),
          });
      }
      await recordAudit(tx, actor, {
        action: 'BREEDER_ROLE_ACTIVATED',
        targetType: 'ACCOUNT',
        targetId: current.ownerAccountId,
        after: { kennelId: current.id },
      });
    }

    await recordAudit(tx, actor, {
      action: 'KENNEL_REVIEWED',
      targetType: 'KENNEL',
      targetId: current.id,
      targetVersion: row.version,
      reason: input.decision === 'APPROVED' ? null : reason,
      before: { status: current.status },
      after: { status: input.decision },
    });
    await createNotification(tx, {
      recipientAccountId: current.ownerAccountId,
      kind: 'KENNEL_' + input.decision,
      titleFa:
        input.decision === 'APPROVED'
          ? 'کنل شما تأیید شد'
          : input.decision === 'NEEDS_CORRECTION'
            ? 'پرونده کنل نیازمند اصلاح است'
            : 'پرونده کنل رد شد',
      bodyFa:
        input.decision === 'APPROVED'
          ? 'نقش پرورش‌دهنده شما فعال شد و از تغییر نقش در دسترس است.'
          : reason,
      resume: {
        entity: { type: 'KENNEL', id: current.id },
        step: 'KENNEL_REVIEW',
        originRoute: '/kennels/' + current.id,
      },
    });
    return row;
  });
}

/** The entry state for the dashboard card and the «شروع ثبت کنل» button. */
export async function kennelEntry(database: DbClient, actor: Actor) {
  const [eligibility, kennel] = await Promise.all([
    eligibilityFor(database, actor.accountId, 'KENNEL'),
    kennelOfOwner(database, actor.accountId),
  ]);
  return { eligibility, kennel };
}

export async function kennelBatch(database: DbClient, kennel: KennelRecord) {
  if (!kennel.batchId) return null;
  const [row] = await database.select().from(paymentBatches).where(eq(paymentBatches.id, kennel.batchId)).limit(1);
  return row ?? null;
}
