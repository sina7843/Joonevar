/**
 * Association membership — D04, §7.
 *
 * Lifetime by decision: there is no expiry date, no renewal, no periodic
 * reminder and no mandatory review after payment. Membership becomes active the
 * moment the server verifies a successful payment, and it lives on the account,
 * so switching context never changes it.
 *
 * Issuing the membership number is a separate step. A number that is still
 * PENDING does not block anything.
 */
import { eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { memberships } from '../db/schema/billing.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readMoney } from '../settings/service.ts';
import { conflict, forbidden, notConfigured } from '../domain/errors.ts';
import type { MoneyValue } from '../domain/money.ts';
import { resumeContext, type ResumeContext } from '../domain/resume-context.ts';
import { assertEligible } from '../domain/eligibility/service.ts';
import type { Actor } from '../authz/actor.ts';
import { createBatch, type BatchRecord } from './payments.ts';

export const MEMBERSHIP_FEE_KEY = 'fee.membership_toman';

export type MembershipStatus = 'NONE' | 'PAYMENT_PENDING' | 'ACTIVE' | 'INACTIVE';

export interface MembershipRecord {
  readonly accountId: string;
  readonly status: MembershipStatus;
  readonly activatedAt: Date | null;
  readonly membershipNo: string | null;
  readonly numberStatus: 'PENDING' | 'ISSUED';
  readonly paymentBatchId: string | null;
  readonly version: number;
}

export async function findMembership(database: DbClient, accountId: string): Promise<MembershipRecord | null> {
  const [row] = await database.select().from(memberships).where(eq(memberships.accountId, accountId)).limit(1);
  return row ? (row as MembershipRecord) : null;
}

export async function isMembershipActive(database: DbClient, accountId: string): Promise<boolean> {
  return (await findMembership(database, accountId))?.status === 'ACTIVE';
}

/** The fee shown and charged, read from managed data (D16). */
export async function membershipFee(database: DbClient): Promise<MoneyValue> {
  return readMoney(database, MEMBERSHIP_FEE_KEY);
}

async function ensureRow(database: Database, accountId: string): Promise<MembershipRecord> {
  const existing = await findMembership(database, accountId);
  if (existing) return existing;
  const [created] = await database.insert(memberships).values({ accountId, status: 'NONE' }).returning();
  return created as MembershipRecord;
}

/**
 * Start the membership payment.
 *
 * The amount is never taken from the request: the batch reads it from settings
 * and freezes it, so a changed tariff afterwards does not alter this intent.
 */
export async function startMembershipPayment(
  database: Database,
  actor: Actor,
  resume: ResumeContext = {
    entity: { type: 'MEMBERSHIP', id: 'self' },
    step: 'REVIEW_FEE',
    originRoute: '/membership',
  },
): Promise<BatchRecord> {
  await assertEligible(database, actor.accountId, 'MEMBERSHIP');

  const current = await ensureRow(database, actor.accountId);
  if (current.status === 'ACTIVE') throw conflict('عضویت شما از قبل فعال است.');

  const fee = await membershipFee(database);
  if (!fee.configured) throw notConfigured('هزینه عضویت');

  const batch = await createBatch(database, actor, {
    service: 'MEMBERSHIP',
    items: [{ targetType: 'MEMBERSHIP', targetId: actor.accountId, settingKey: MEMBERSHIP_FEE_KEY }],
    resume: resumeContext(resume),
  });

  await database
    .update(memberships)
    .set({
      // An active membership is never reached here; the guard above returns first.
      status: 'PAYMENT_PENDING',
      paymentBatchId: batch.id,
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(memberships.accountId, actor.accountId));

  return batch;
}

/**
 * Activate on verified payment.
 *
 * Runs inside the verifying transaction and is written to be safe if it ever
 * runs twice: an already active membership is left exactly as it is, keeping
 * the original activation date.
 */
export async function activateMembershipFromPayment(
  tx: DbClient,
  batch: { id: string; accountId: string },
  now: Date = new Date(),
): Promise<void> {
  const [current] = await tx.select().from(memberships).where(eq(memberships.accountId, batch.accountId)).limit(1);

  if (current?.status === 'ACTIVE') return;

  if (current) {
    await tx
      .update(memberships)
      .set({
        status: 'ACTIVE',
        activatedAt: now,
        paymentBatchId: batch.id,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(eq(memberships.accountId, batch.accountId));
  } else {
    await tx.insert(memberships).values({
      accountId: batch.accountId,
      status: 'ACTIVE',
      activatedAt: now,
      paymentBatchId: batch.id,
    });
  }

  await recordAudit(tx, null, {
    action: 'MEMBERSHIP_ACTIVATED',
    targetType: 'MEMBERSHIP',
    targetId: batch.accountId,
    before: { status: current?.status ?? 'NONE' },
    // No expiry is written, because a lifetime membership does not have one (D04).
    after: { status: 'ACTIVE', activatedAt: now.toISOString(), numberStatus: current?.numberStatus ?? 'PENDING' },
  });

  await createNotification(tx, {
    recipientAccountId: batch.accountId,
    kind: 'MEMBERSHIP_ACTIVATED',
    titleFa: 'عضویت شما فعال شد',
    bodyFa: 'عضویت انجمن برای شما فعال است. شماره عضویت پس از صدور در همین صفحه نمایش داده می‌شود.',
    resume: { entity: { type: 'MEMBERSHIP', id: 'self' }, step: 'ACTIVE', originRoute: '/membership' },
  });
}

/**
 * Issue the membership number. A separate operational step (§7): the number can
 * stay PENDING while the membership is already active and usable.
 */
export async function issueMembershipNumber(
  database: Database,
  actor: Actor,
  input: { accountId: string; membershipNo: string },
): Promise<MembershipRecord> {
  if (actor.context !== 'ASSOCIATION_OPERATOR' && actor.context !== 'SUPERADMIN') {
    throw forbidden('صدور شماره عضویت از محیط عملیاتی انجام می‌شود.');
  }
  const value = input.membershipNo.trim();
  if (value === '') throw conflict('شماره عضویت خالی است.');

  const current = await findMembership(database, input.accountId);
  if (current === null) throw conflict('عضویتی برای این حساب ثبت نشده است.');

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(memberships)
      .set({ membershipNo: value, numberStatus: 'ISSUED', version: current.version + 1, updatedAt: new Date() })
      .where(eq(memberships.accountId, input.accountId))
      .returning();
    await recordAudit(tx, actor, {
      action: 'MEMBERSHIP_NUMBER_ISSUED',
      targetType: 'MEMBERSHIP',
      targetId: input.accountId,
      targetVersion: current.version + 1,
      before: { numberStatus: current.numberStatus },
      after: { numberStatus: 'ISSUED' },
    });
    return updated as MembershipRecord;
  });
}

/**
 * Deactivate and reactivate.
 *
 * The source does not define why a membership would be deactivated, so no
 * policy is invented here — only the mechanism §7.1 depends on. Reactivation
 * lifts the membership restriction and nothing else: the role, its history and
 * its locations are untouched and no onboarding is repeated.
 */
export async function setMembershipActive(
  database: Database,
  actor: Actor,
  input: { accountId: string; active: boolean; reasonFa: string },
): Promise<MembershipRecord> {
  if (actor.context !== 'ASSOCIATION_OPERATOR' && actor.context !== 'SUPERADMIN') {
    throw forbidden('تغییر وضعیت عضویت از محیط عملیاتی انجام می‌شود.');
  }
  const reason = input.reasonFa.trim();
  if (reason.length < 3) throw conflict('ثبت دلیل الزامی است.');

  const current = await findMembership(database, input.accountId);
  if (current === null) throw conflict('عضویتی برای این حساب ثبت نشده است.');
  if (current.status === 'NONE' || current.status === 'PAYMENT_PENDING') {
    throw conflict('این حساب هنوز عضویت فعال‌شده‌ای ندارد.');
  }

  const next: MembershipStatus = input.active ? 'ACTIVE' : 'INACTIVE';
  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(memberships)
      .set({ status: next, version: current.version + 1, updatedAt: new Date() })
      .where(eq(memberships.accountId, input.accountId))
      .returning();
    await recordAudit(tx, actor, {
      action: input.active ? 'MEMBERSHIP_REACTIVATED' : 'MEMBERSHIP_DEACTIVATED',
      targetType: 'MEMBERSHIP',
      targetId: input.accountId,
      targetVersion: current.version + 1,
      before: { status: current.status },
      after: { status: next },
      reason,
    });
    await createNotification(tx, {
      recipientAccountId: input.accountId,
      kind: input.active ? 'MEMBERSHIP_REACTIVATED' : 'MEMBERSHIP_DEACTIVATED',
      titleFa: input.active ? 'عضویت شما دوباره فعال شد' : 'عضویت شما غیرفعال شد',
      bodyFa: reason,
      resume: { entity: { type: 'MEMBERSHIP', id: 'self' }, step: 'STATUS', originRoute: '/membership' },
    });
    return updated as MembershipRecord;
  });
}
