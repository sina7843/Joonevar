/**
 * Advertising packages — Requirements-Phase-2 §14, §15, P2-D03, P2-D05,
 * P2-D07 (PROMPT-011).
 *
 * A purchase is an ordinary Phase 1 payment: the price is frozen from managed
 * settings into the batch, the gateway is verified on the server, and the
 * package is activated inside that same verified transaction. Nothing here
 * invents an amount, and paying never verifies a licence or makes a profile
 * trusted — the advertising axis stays its own (P2-D05).
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { adPlans, adSubscriptions } from '../db/schema/advertising.ts';
import { vetProfiles, centres } from '../db/schema/vets.ts';
import { communities } from '../db/schema/communities.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readMoney } from '../settings/service.ts';
import { createBatch, type BatchRecord } from '../billing/payments.ts';
import { conflict, forbidden, notConfigured, notFound, validation } from '../domain/errors.ts';
import { formatTomanFa, type MoneyValue } from '../domain/money.ts';
import type { Actor } from '../authz/actor.ts';
import type { ActorContextName } from '../authz/actor.ts';
import {
  AD_PERIOD_FA,
  AD_TARGET_FA,
  AD_TIER_FA,
  adState,
  isAdTargetType,
  isLivePackage,
  packageEnd,
  packageStart,
  planCapacityProblem,
  purchaseProblem,
  type AdPeriod,
  type AdTargetType,
  type AdTier,
} from './model.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این رکورد هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const OWNER_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];

export type AdPlanRow = typeof adPlans.$inferSelect;
export type AdSubscriptionRow = typeof adSubscriptions.$inferSelect;

const text = (value: string | null | undefined): string | null => {
  const out = (value ?? '').trim();
  return out === '' ? null : out;
};

function reasonOf(value: string | null | undefined): string {
  const out = text(value);
  if (out === null) throw validation('دلیل تغییر را بنویسید.');
  return out;
}

// ── Plans ────────────────────────────────────────────────────────────────

export interface AdPlanView {
  readonly plan: AdPlanRow;
  readonly tierFa: string;
  readonly periodFa: string;
  readonly price: MoneyValue;
  readonly priceFa: string | null;
  readonly activeCount: number;
  readonly full: boolean;
}

/** Every plan with its managed price and how many of its slots are in use. */
export async function listPlans(database: DbClient, now: Date = new Date()): Promise<AdPlanView[]> {
  const rows = await database.select().from(adPlans).orderBy(asc(adPlans.tier), asc(adPlans.durationDays));
  const live = await database.select().from(adSubscriptions).where(eq(adSubscriptions.status, 'ACTIVE'));
  return Promise.all(
    rows.map(async (plan) => {
      const price = await readMoney(database, plan.priceSettingKey);
      const activeCount = live.filter((row) => row.planId === plan.id && isLivePackage(row, now)).length;
      return {
        plan,
        tierFa: AD_TIER_FA[plan.tier as AdTier],
        periodFa: AD_PERIOD_FA[plan.period as AdPeriod],
        price,
        priceFa: formatTomanFa(price),
        activeCount,
        full: plan.slotCapacity !== null && activeCount >= plan.slotCapacity,
      };
    }),
  );
}

/**
 * What the panel configures: the features text, the slot capacity and whether
 * the plan is on sale. The price is not here — it is an audited settings edit,
 * so one figure is never charged from two places (P2-D03).
 */
export async function updatePlan(
  database: Database,
  actor: Actor,
  input: {
    planId: string;
    expectedVersion: number;
    featuresFa: string | null;
    slotCapacity: number | null;
    isActive: boolean;
    reason: string;
  },
): Promise<AdPlanRow> {
  if (actor.context !== 'SUPERADMIN') throw forbidden('تنظیم بسته‌های تبلیغاتی فقط از محیط سوپرادمین ممکن است.');
  const reason = reasonOf(input.reason);
  const capacityProblem = planCapacityProblem(input.slotCapacity);
  if (capacityProblem) throw validation(capacityProblem);
  const featuresFa = text(input.featuresFa);
  if (featuresFa !== null && featuresFa.length > 1000) throw validation('توضیح امکانات حداکثر ۱٬۰۰۰ نویسه است.');

  return database.transaction(async (tx) => {
    const [current] = UUID.test(input.planId)
      ? await tx.select().from(adPlans).where(eq(adPlans.id, input.planId)).limit(1)
      : [];
    if (!current) throw notFound('بسته پیدا نشد.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    const nextActive = input.isActive ? 1 : 0;
    const [row] = await tx
      .update(adPlans)
      .set({
        featuresFa,
        slotCapacity: input.slotCapacity,
        isActive: nextActive,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(adPlans.id, current.id), eq(adPlans.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'AD_PLAN_UPDATED',
      targetType: 'AD_PLAN',
      targetId: row.id,
      targetVersion: row.version,
      before: { featuresFa: current.featuresFa, slotCapacity: current.slotCapacity, isActive: current.isActive === 1 },
      after: { featuresFa: row.featuresFa, slotCapacity: row.slotCapacity, isActive: row.isActive === 1 },
      reason,
    });
    return row;
  });
}

// ── Targets ──────────────────────────────────────────────────────────────

export interface AdTarget {
  readonly type: AdTargetType;
  readonly id: string;
  readonly nameFa: string;
  readonly kindFa: string;
  readonly ownerAccountId: string | null;
  /** Where this record is managed, so a buyer can go back to it. */
  readonly manageRoute: string;
}

/** One record, read for a purchase. Anything unknown is not found rather than refused. */
export async function findTarget(
  database: DbClient,
  targetType: string,
  targetId: string,
): Promise<AdTarget | null> {
  if (!isAdTargetType(targetType) || !UUID.test(targetId)) return null;
  if (targetType === 'VET') {
    const [row] = await database.select().from(vetProfiles).where(eq(vetProfiles.id, targetId)).limit(1);
    return row
      ? {
          type: 'VET',
          id: row.id,
          nameFa: row.displayNameFa,
          kindFa: AD_TARGET_FA.VET,
          ownerAccountId: row.accountId,
          manageRoute: '/account/vet-profile',
        }
      : null;
  }
  if (targetType === 'CENTRE') {
    const [row] = await database.select().from(centres).where(eq(centres.id, targetId)).limit(1);
    return row
      ? {
          type: 'CENTRE',
          id: row.id,
          nameFa: row.displayNameFa,
          kindFa: AD_TARGET_FA.CENTRE,
          ownerAccountId: row.ownerAccountId,
          manageRoute: '/account/centres/' + row.id,
        }
      : null;
  }
  const [row] = await database.select().from(communities).where(eq(communities.id, targetId)).limit(1);
  return row
    ? {
        type: 'COMMUNITY',
        id: row.id,
        nameFa: row.displayNameFa,
        kindFa: AD_TARGET_FA.COMMUNITY,
        ownerAccountId: row.ownerAccountId,
        manageRoute: '/account/communities/' + row.id,
      }
    : null;
}

/** Every record this account manages and may therefore buy a package for (P2-D07). */
export async function myTargets(database: DbClient, actor: Actor): Promise<AdTarget[]> {
  if (!OWNER_CONTEXTS.includes(actor.context)) return [];
  const [vetRows, centreRows, communityRows] = await Promise.all([
    database.select().from(vetProfiles).where(eq(vetProfiles.accountId, actor.accountId)),
    database.select().from(centres).where(eq(centres.ownerAccountId, actor.accountId)).orderBy(asc(centres.displayNameFa)),
    database
      .select()
      .from(communities)
      .where(eq(communities.ownerAccountId, actor.accountId))
      .orderBy(asc(communities.displayNameFa)),
  ]);
  return [
    ...vetRows.map((row) => ({
      type: 'VET' as const,
      id: row.id,
      nameFa: row.displayNameFa,
      kindFa: AD_TARGET_FA.VET,
      ownerAccountId: row.accountId,
      manageRoute: '/account/vet-profile',
    })),
    ...centreRows.map((row) => ({
      type: 'CENTRE' as const,
      id: row.id,
      nameFa: row.displayNameFa,
      kindFa: AD_TARGET_FA.CENTRE,
      ownerAccountId: row.ownerAccountId,
      manageRoute: '/account/centres/' + row.id,
    })),
    ...communityRows.map((row) => ({
      type: 'COMMUNITY' as const,
      id: row.id,
      nameFa: row.displayNameFa,
      kindFa: AD_TARGET_FA.COMMUNITY,
      ownerAccountId: row.ownerAccountId,
      manageRoute: '/account/communities/' + row.id,
    })),
  ];
}

// ── Subscriptions ────────────────────────────────────────────────────────

/** Every subscription of one record, newest first: the history §14 asks for. */
export async function subscriptionsOf(
  database: DbClient,
  targetType: AdTargetType,
  targetId: string,
): Promise<Array<AdSubscriptionRow & { tier: string; period: string; durationDays: number }>> {
  if (!UUID.test(targetId)) return [];
  const rows = await database
    .select({ subscription: adSubscriptions, plan: adPlans })
    .from(adSubscriptions)
    .innerJoin(adPlans, eq(adPlans.id, adSubscriptions.planId))
    .where(and(eq(adSubscriptions.targetType, targetType), eq(adSubscriptions.targetId, targetId)))
    .orderBy(desc(adSubscriptions.createdAt));
  return rows.map((row) => ({
    ...row.subscription,
    tier: row.plan.tier,
    period: row.plan.period,
    durationDays: row.plan.durationDays,
  }));
}

/** The live package of a record, or null. Expiry is decided here, at read time. */
export async function livePackage(
  database: DbClient,
  targetType: AdTargetType,
  targetId: string,
  now: Date = new Date(),
): Promise<AdSubscriptionRow | null> {
  if (!UUID.test(targetId)) return null;
  const rows = await database
    .select()
    .from(adSubscriptions)
    .where(
      and(
        eq(adSubscriptions.targetType, targetType),
        eq(adSubscriptions.targetId, targetId),
        eq(adSubscriptions.status, 'ACTIVE'),
      ),
    )
    .orderBy(desc(adSubscriptions.endsAt));
  return rows.find((row) => isLivePackage(row, now)) ?? null;
}

/**
 * The records of one kind that carry a live package right now.
 *
 * Used for the «تبلیغ» label. Ordering search results by it is the versioned,
 * auditable ranking of §15 and belongs to its own prompt; this only says who is
 * promoted, and never that a promoted record is verified or trusted (P2-D05).
 */
export async function promotedTargetIds(
  database: DbClient,
  targetType: AdTargetType,
  now: Date = new Date(),
): Promise<ReadonlySet<string>> {
  const rows = await database
    .select()
    .from(adSubscriptions)
    .where(and(eq(adSubscriptions.targetType, targetType), eq(adSubscriptions.status, 'ACTIVE')));
  return new Set(rows.filter((row) => isLivePackage(row, now)).map((row) => row.targetId));
}

export interface PurchaseIntent {
  readonly subscription: AdSubscriptionRow;
  readonly batch: BatchRecord;
}

/**
 * Start a purchase: a subscription intent plus the payment batch that freezes
 * its price. Nothing is active until the payment is verified on the server.
 */
export async function startPackagePurchase(
  database: Database,
  actor: Actor,
  input: { targetType: string; targetId: string; planId: string },
  now: Date = new Date(),
): Promise<PurchaseIntent> {
  if (!OWNER_CONTEXTS.includes(actor.context)) throw forbidden('خرید بسته از این محیط ممکن نیست.');
  const target = await findTarget(database, input.targetType, input.targetId);
  if (target === null) throw notFound('پرونده پیدا نشد.');

  const [plan] = UUID.test(input.planId)
    ? await database.select().from(adPlans).where(eq(adPlans.id, input.planId)).limit(1)
    : [];
  if (!plan) throw notFound('بسته پیدا نشد.');

  const price = await readMoney(database, plan.priceSettingKey);
  const pending = await database
    .select()
    .from(adSubscriptions)
    .where(
      and(
        eq(adSubscriptions.targetType, target.type),
        eq(adSubscriptions.targetId, target.id),
        eq(adSubscriptions.status, 'PENDING_PAYMENT'),
      ),
    );
  const liveOfPlan = await database.select().from(adSubscriptions).where(eq(adSubscriptions.status, 'ACTIVE'));

  const problem = purchaseProblem({
    ownerAccountId: target.ownerAccountId,
    actorAccountId: actor.accountId,
    planActive: plan.isActive === 1,
    priceConfigured: price.configured,
    pendingExists: pending.length > 0,
    activeOfPlan: liveOfPlan.filter((row) => row.planId === plan.id && isLivePackage(row, now)).length,
    slotCapacity: plan.slotCapacity,
  });
  if (problem) {
    // An unpriced plan is a configuration gap, not the buyer's mistake (§22).
    if (!price.configured) throw notConfigured('قیمت بسته تبلیغاتی');
    if (target.ownerAccountId !== null && target.ownerAccountId !== actor.accountId) throw forbidden(problem);
    throw conflict(problem);
  }

  return database.transaction(async (tx) => {
    const [subscription] = await tx
      .insert(adSubscriptions)
      .values({ targetType: target.type, targetId: target.id, accountId: actor.accountId, planId: plan.id })
      .returning();

    const batch = await createBatch(tx as unknown as Database, actor, {
      service: 'ADVERTISING_PACKAGE',
      items: [{ targetType: 'AD_SUBSCRIPTION', targetId: subscription!.id, settingKey: plan.priceSettingKey }],
      resume: {
        entity: { type: 'AD_SUBSCRIPTION', id: subscription!.id },
        step: 'REVIEW_PACKAGE_FEE',
        originRoute: '/account/packages?target=' + target.type + ':' + target.id,
      },
    });

    const [withBatch] = await tx
      .update(adSubscriptions)
      .set({ paymentBatchId: batch.id, version: subscription!.version + 1, updatedAt: now })
      .where(and(eq(adSubscriptions.id, subscription!.id), eq(adSubscriptions.version, subscription!.version)))
      .returning();
    if (!withBatch) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'AD_PACKAGE_PURCHASE_STARTED',
      targetType: 'AD_SUBSCRIPTION',
      targetId: withBatch.id,
      targetVersion: withBatch.version,
      after: {
        target: { type: target.type, id: target.id },
        planId: plan.id,
        tier: plan.tier,
        period: plan.period,
        paymentBatchId: batch.id,
      },
    });
    return { subscription: withBatch, batch };
  });
}

/**
 * Activate the package of a verified payment — runs inside the verifying
 * transaction, so a package exists only where money was really taken.
 *
 * Renewing early keeps the days already paid for: the new period starts where
 * the live one ends.
 */
export async function activateSubscriptionFromPayment(
  tx: DbClient,
  batch: { id: string; accountId: string },
  now: Date = new Date(),
): Promise<void> {
  const [current] = await tx.select().from(adSubscriptions).where(eq(adSubscriptions.paymentBatchId, batch.id)).limit(1);
  if (!current) return;
  // A repeated or concurrent callback finds the work already done.
  if (current.status === 'ACTIVE') return;
  if (current.status === 'CANCELLED') return;

  const [plan] = await tx.select().from(adPlans).where(eq(adPlans.id, current.planId)).limit(1);
  if (!plan) return;

  const live = await tx
    .select()
    .from(adSubscriptions)
    .where(
      and(
        eq(adSubscriptions.targetType, current.targetType),
        eq(adSubscriptions.targetId, current.targetId),
        eq(adSubscriptions.status, 'ACTIVE'),
      ),
    )
    .orderBy(desc(adSubscriptions.endsAt));
  const liveEndsAt = live.find((row) => isLivePackage(row, now))?.endsAt ?? null;
  const startsAt = packageStart(liveEndsAt, now);
  const endsAt = packageEnd(startsAt, plan.durationDays);

  const [row] = await tx
    .update(adSubscriptions)
    .set({ status: 'ACTIVE', startsAt, endsAt, version: current.version + 1, updatedAt: now })
    .where(and(eq(adSubscriptions.id, current.id), eq(adSubscriptions.version, current.version)))
    .returning();
  if (!row) return;

  await recordAudit(
    tx,
    { accountId: batch.accountId as never, context: 'USER', activeRoles: [] },
    {
      action: 'AD_PACKAGE_ACTIVATED',
      targetType: 'AD_SUBSCRIPTION',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status, startsAt: null, endsAt: null },
      after: {
        status: row.status,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        renewedFromLivePeriod: liveEndsAt !== null,
      },
    },
  );
  await createNotification(tx, {
    recipientAccountId: row.accountId,
    kind: 'AD_PACKAGE_ACTIVATED',
    titleFa: 'بسته تبلیغاتی شما فعال شد',
    bodyFa: 'بسته ' + AD_TIER_FA[plan.tier as AdTier] + ' ' + AD_PERIOD_FA[plan.period as AdPeriod] + ' فعال شد.',
    resume: {
      entity: { type: 'AD_SUBSCRIPTION', id: row.id },
      step: 'PACKAGE_ACTIVE',
      originRoute: '/account/packages?target=' + row.targetType + ':' + row.targetId,
    },
  });
}

/** A failed payment leaves its intent visible with the reason, not deleted (§26). */
export async function markPurchaseFailed(tx: DbClient, batchId: string, now: Date = new Date()): Promise<void> {
  const [current] = await tx.select().from(adSubscriptions).where(eq(adSubscriptions.paymentBatchId, batchId)).limit(1);
  if (!current || current.status !== 'PENDING_PAYMENT') return;
  await tx
    .update(adSubscriptions)
    .set({ status: 'PAYMENT_FAILED', version: current.version + 1, updatedAt: now })
    .where(and(eq(adSubscriptions.id, current.id), eq(adSubscriptions.version, current.version)));
}

/**
 * Cancel a package.
 *
 * The record keeps its dates and its reason. No refund rule is invented here:
 * money already taken is settled outside the product until a policy exists.
 */
export async function cancelPackage(
  database: Database,
  actor: Actor,
  input: { subscriptionId: string; expectedVersion: number; reason: string },
  now: Date = new Date(),
): Promise<AdSubscriptionRow> {
  const reason = reasonOf(input.reason);
  return database.transaction(async (tx) => {
    const [current] = UUID.test(input.subscriptionId)
      ? await tx.select().from(adSubscriptions).where(eq(adSubscriptions.id, input.subscriptionId)).limit(1)
      : [];
    if (!current) throw notFound('بسته‌ای با این شناسه پیدا نشد.');

    const isOwner = current.accountId === actor.accountId && OWNER_CONTEXTS.includes(actor.context);
    if (!isOwner && actor.context !== 'SUPERADMIN') throw forbidden('این بسته را فقط خریدار یا سوپرادمین لغو می‌کند.');
    if (current.status === 'CANCELLED') throw conflict('این بسته پیش‌تر لغو شده است.');
    if (adState(current, now) === 'EXPIRED') throw conflict('این بسته منقضی شده است و لغو ندارد.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    const [row] = await tx
      .update(adSubscriptions)
      .set({
        status: 'CANCELLED',
        cancelledAt: now,
        cancelReasonFa: reason,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(adSubscriptions.id, current.id), eq(adSubscriptions.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'AD_PACKAGE_CANCELLED',
      targetType: 'AD_SUBSCRIPTION',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status, endsAt: current.endsAt?.toISOString() ?? null },
      after: { status: row.status, cancelledAt: now.toISOString() },
      reason,
    });
    return row;
  });
}

/** The purchases of one account, for its own packages page. */
export async function myPackages(database: DbClient, actor: Actor) {
  const rows = await database
    .select({ subscription: adSubscriptions, plan: adPlans })
    .from(adSubscriptions)
    .innerJoin(adPlans, eq(adPlans.id, adSubscriptions.planId))
    .where(eq(adSubscriptions.accountId, actor.accountId))
    .orderBy(desc(adSubscriptions.createdAt));
  return rows.map((row) => ({ ...row.subscription, plan: row.plan }));
}

/** Superadmin view: every subscription, newest first, with its record and plan. */
export async function allPackages(database: DbClient, actor: Actor) {
  if (actor.context !== 'SUPERADMIN') throw forbidden('این فهرست فقط در محیط سوپرادمین دیده می‌شود.');
  const rows = await database
    .select({ subscription: adSubscriptions, plan: adPlans })
    .from(adSubscriptions)
    .innerJoin(adPlans, eq(adPlans.id, adSubscriptions.planId))
    .orderBy(desc(adSubscriptions.createdAt))
    .limit(200);
  const targets = await Promise.all(
    rows.map((row) => findTarget(database, row.subscription.targetType, row.subscription.targetId)),
  );
  return rows.map((row, index) => ({ ...row.subscription, plan: row.plan, target: targets[index] ?? null }));
}

/** Plans seeded once from the catalogue of §14; prices stay in settings. */
export async function ensurePlans(
  database: DbClient,
  catalogue: ReadonlyArray<{ tier: AdTier; period: AdPeriod; durationDays: number; priceSettingKey: string; featuresFa: string }>,
): Promise<number> {
  let inserted = 0;
  for (const entry of catalogue) {
    const [existing] = await database
      .select({ id: adPlans.id })
      .from(adPlans)
      .where(and(eq(adPlans.tier, entry.tier), eq(adPlans.period, entry.period)))
      .limit(1);
    if (existing) continue;
    await database.insert(adPlans).values({
      tier: entry.tier,
      period: entry.period,
      durationDays: entry.durationDays,
      priceSettingKey: entry.priceSettingKey,
      featuresFa: entry.featuresFa,
    });
    inserted += 1;
  }
  return inserted;
}
