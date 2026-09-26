/**
 * Finder subscriptions, capacity and the access matrix — PROMPT-002 (DEC-0218).
 *
 * Money only ever enters through the existing `createBatch` → `startAttempt` →
 * `verifyAttempt` path; a period becomes ACTIVE only inside the verifying
 * transaction. What this module adds is the finder's own rules around that:
 *
 *  - the checkout copies the whole plan version onto the period, so a later edit
 *    to the plan rewrites nobody;
 *  - every write that decides an account's periods or capacity takes that
 *    account's row lock first, so two renewals, or two activations at the edge
 *    of the capacity, are decided one after the other and never overlap;
 *  - expiry is read from `ends_at`, never swept, so it is right without a
 *    scheduler; an expired subscription stops new activations and new requests
 *    but touches nothing already open (PRODUCT_DECISIONS §2).
 *
 * There is no payment, escrow or wallet for the mating agreement itself.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { finderPlanVersions, finderSubscriptionPeriods } from '../db/schema/finder.ts';
import { animals } from '../db/schema/animals.ts';
import { microchips } from '../db/schema/clinical.ts';
import { referenceBreeds } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { createBatch, findBatch, type BatchRecord } from '../billing/payments.ts';
import { readSetting } from '../settings/service.ts';
import { kennelOfOwner } from '../kennels/service.ts';
import { isKycApproved } from '../identity/kyc.ts';
import { speciesEnabled } from '../marketplace/species.ts';
import { violates } from '../db/constraint.ts';
import { periodStart } from '../domain/period.ts';
import { conflict, notFound } from '../domain/errors.ts';
import { resumeContext } from '../domain/resume-context.ts';
import type { Actor } from '../authz/actor.ts';
import { assertFinderFlag, finderFlagEnabled } from './flags.ts';
import {
  addMonths,
  capacityOf,
  capacityProblem,
  FINDER_SETTING_KEYS,
  pairProblem,
  planPurchaseProblem,
  profileVisible,
  standingAt,
  type Capacity,
  type FinderAudience,
  type PaidPeriod,
  type Standing,
} from './model.ts';

export type PeriodRow = typeof finderSubscriptionPeriods.$inferSelect;

export const ACCOUNT_ROUTE = '/account/mating-finder';

/**
 * The per-account mutex. Every decision about one account's periods or its
 * capacity runs after this, inside the same transaction.
 */
export async function lockAccount(tx: DbClient, accountId: string): Promise<void> {
  const result = await tx.execute(sql`select id from account where id = ${accountId} for update`);
  if (result.rows.length === 0) throw notFound('حساب پیدا نشد.');
}

// ── Standing ─────────────────────────────────────────────────────────────────

async function paidPeriods(database: DbClient, accountId: string): Promise<PaidPeriod[]> {
  const rows = await database
    .select()
    .from(finderSubscriptionPeriods)
    .where(and(eq(finderSubscriptionPeriods.accountId, accountId), eq(finderSubscriptionPeriods.status, 'ACTIVE')));
  return rows.map((row) => ({
    audience: row.audience,
    activeAnimalCapacity: row.activeAnimalCapacity,
    startsAt: row.startsAt!,
    endsAt: row.endsAt!,
  }));
}

export async function finderStanding(database: DbClient, accountId: string, now: Date = new Date()): Promise<Standing> {
  return standingAt(await paidPeriods(database, accountId), now);
}

export async function hasFinderSubscription(database: DbClient, accountId: string, now: Date = new Date()): Promise<boolean> {
  return (await finderStanding(database, accountId, now)).state === 'ACTIVE';
}

/** The managed free-owner figure, or null while nobody has entered one. */
async function freeOwnerCapacity(database: DbClient): Promise<number | null> {
  const row = await readSetting(database, FINDER_SETTING_KEYS.freeOwnerCapacity);
  return row.value === null ? null : Number(row.value);
}

export async function finderCapacity(database: DbClient, accountId: string, now: Date = new Date()): Promise<Capacity> {
  const [standing, free] = await Promise.all([finderStanding(database, accountId, now), freeOwnerCapacity(database)]);
  return capacityOf(standing, free);
}

/**
 * Refuse unless the account has room for one more active profile. The caller
 * must already hold `lockAccount` in the same transaction and pass the count it
 * read under that lock — that is what makes two activations at the edge of the
 * capacity end with one success and one refusal, never two successes. An
 * expired subscription falls back to the free capacity, so expiry alone stops
 * new activations.
 */
export async function assertCapacityAvailable(
  tx: DbClient,
  accountId: string,
  activeCount: number,
  now: Date = new Date(),
): Promise<Capacity> {
  const capacity = await finderCapacity(tx, accountId, now);
  const problem = capacityProblem(capacity, activeCount);
  if (problem) throw conflict(problem, { limit: capacity.limit, activeCount, source: capacity.source });
  return capacity;
}

// ── Access matrix ────────────────────────────────────────────────────────────

/** Whether a viewer (null = a visitor) may see one owner's active profile. */
export async function mayViewProfile(
  database: DbClient,
  viewerAccountId: string | null,
  ownerAccountId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const viewerIsOwner = viewerAccountId === ownerAccountId;
  const [ownerSubscribed, viewerSubscribed, freePoolOpen] = await Promise.all([
    hasFinderSubscription(database, ownerAccountId, now),
    viewerAccountId === null || viewerIsOwner ? false : hasFinderSubscription(database, viewerAccountId, now),
    finderFlagEnabled(database, 'finder.flag.free_pool_visibility'),
  ]);
  return profileVisible({ viewerIsOwner, ownerSubscribed, viewerSubscribed, freePoolOpen });
}

/**
 * Null when a request between these two owners may form, otherwise why not:
 * both KYC-approved and at least one with a live subscription, read now. The
 * request prompt calls this inside its own transaction; a subscription that
 * expires afterwards never undoes a request that already formed.
 */
export async function pairFormationProblem(
  database: DbClient,
  senderAccountId: string,
  receiverAccountId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const [senderKycApproved, receiverKycApproved, senderSubscribed, receiverSubscribed] = await Promise.all([
    isKycApproved(database, senderAccountId),
    isKycApproved(database, receiverAccountId),
    hasFinderSubscription(database, senderAccountId, now),
    hasFinderSubscription(database, receiverAccountId, now),
  ]);
  return pairProblem({ senderKycApproved, receiverKycApproved, senderSubscribed, receiverSubscribed });
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export interface StartedSubscription {
  readonly period: PeriodRow;
  readonly batch: BatchRecord;
  readonly reused: boolean;
}

/**
 * Open the payment for one period of one plan version.
 *
 * Everything is decided on the server: the plan must still be the published
 * version, inside its sale window and priced; a kennel plan needs an approved
 * kennel. The whole version is copied onto the period. A second checkout while
 * one is open reuses it if it is for the same version, and otherwise supersedes
 * it — and if the superseded batch is paid anyway, that money still buys exactly
 * the period it priced (see the activation below), so no payment is ever lost.
 */
export async function startFinderSubscription(
  database: Database,
  actor: Actor,
  input: { planVersionId: string },
  now: Date = new Date(),
): Promise<StartedSubscription> {
  await assertFinderFlag(database, 'finder.flag.subscription_purchase');

  const [plan] = await database
    .select()
    .from(finderPlanVersions)
    .where(eq(finderPlanVersions.id, input.planVersionId))
    .limit(1);
  if (!plan) throw notFound('این طرح اشتراک پیدا نشد.');
  const problem = planPurchaseProblem(plan, now);
  if (problem) throw conflict(problem);
  if (plan.audience === 'KENNEL') {
    const kennel = await kennelOfOwner(database, actor.accountId);
    if (kennel?.status !== 'APPROVED') throw conflict('طرح کنل فقط برای حسابی است که کنل تأییدشده دارد.');
  }

  try {
    return await database.transaction(async (tx) => {
      await lockAccount(tx, actor.accountId);

      const [pending] = await tx
        .select()
        .from(finderSubscriptionPeriods)
        .where(
          and(
            eq(finderSubscriptionPeriods.accountId, actor.accountId),
            eq(finderSubscriptionPeriods.status, 'PENDING_PAYMENT'),
          ),
        )
        .limit(1);
      if (pending) {
        if (pending.planVersionId === plan.id && pending.paymentBatchId) {
          const batch = await findBatch(tx, pending.paymentBatchId);
          if (batch && batch.status !== 'PAID') return { period: pending, batch, reused: true };
        }
        const [superseded] = await tx
          .update(finderSubscriptionPeriods)
          .set({ status: 'SUPERSEDED', version: pending.version + 1, updatedAt: now })
          .where(and(eq(finderSubscriptionPeriods.id, pending.id), eq(finderSubscriptionPeriods.version, pending.version)))
          .returning();
        if (!superseded) throw conflict('این پرداخت در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');
        await recordAudit(tx, actor, {
          action: 'FINDER_SUBSCRIPTION_SUPERSEDED',
          targetType: 'FINDER_SUBSCRIPTION',
          targetId: pending.id,
          targetVersion: superseded.version,
          before: { status: pending.status, planVersionId: pending.planVersionId },
          after: { status: 'SUPERSEDED', replacedByPlanVersionId: plan.id },
        });
      }

      const [anyPaid] = await tx
        .select({ id: finderSubscriptionPeriods.id })
        .from(finderSubscriptionPeriods)
        .where(and(eq(finderSubscriptionPeriods.accountId, actor.accountId), eq(finderSubscriptionPeriods.status, 'ACTIVE')))
        .limit(1);

      const [period] = await tx
        .insert(finderSubscriptionPeriods)
        .values({
          accountId: actor.accountId,
          planVersionId: plan.id,
          audience: plan.audience,
          planVersion: plan.version,
          durationMonths: plan.durationMonths,
          activeAnimalCapacity: plan.activeAnimalCapacity,
          priceToman: plan.priceToman!,
          suspensionPolicy: plan.suspensionPolicy,
          kind: anyPaid ? 'RENEWAL' : 'INITIAL',
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const batch = await createBatch(tx as unknown as Database, actor, {
        service: 'MATING_FINDER_SUBSCRIPTION',
        items: [{ targetType: 'FINDER_SUBSCRIPTION_PERIOD', targetId: period!.id, finderPlanVersionId: plan.id }],
        resume: resumeContext({
          entity: { type: 'FINDER_SUBSCRIPTION', id: period!.id },
          step: 'SUBSCRIPTION_PAYMENT',
          originRoute: ACCOUNT_ROUTE,
        }),
      });

      const [linked] = await tx
        .update(finderSubscriptionPeriods)
        .set({ paymentBatchId: batch.id, version: period!.version + 1, updatedAt: now })
        .where(and(eq(finderSubscriptionPeriods.id, period!.id), eq(finderSubscriptionPeriods.version, period!.version)))
        .returning();

      await recordAudit(tx, actor, {
        action: 'FINDER_SUBSCRIPTION_PAYMENT_STARTED',
        targetType: 'FINDER_SUBSCRIPTION',
        targetId: linked!.id,
        targetVersion: linked!.version,
        after: {
          planVersionId: plan.id,
          planVersion: plan.version,
          audience: plan.audience,
          durationMonths: plan.durationMonths,
          activeAnimalCapacity: plan.activeAnimalCapacity,
          priceToman: plan.priceToman!.toString(),
          kind: linked!.kind,
          paymentBatchId: batch.id,
        },
      });
      return { period: linked!, batch, reused: false };
    });
  } catch (error) {
    if (violates(error, 'finder_subscription_one_pending_key')) {
      throw conflict('یک پرداخت اشتراک در جریان است؛ صفحه را دوباره باز کنید.');
    }
    throw error;
  }
}

/**
 * Turn a verified payment into a period — inside the verifying transaction, so a
 * period exists exactly where money was taken. The start is where the account's
 * live chain ends (or now), decided under the account lock, so two payments
 * verified at the same moment queue one after the other instead of overlapping.
 * A replayed callback finds the period no longer pending and does nothing.
 */
export async function activateFinderSubscriptionFromPayment(
  tx: DbClient,
  batch: { id: string },
  now: Date = new Date(),
): Promise<void> {
  const [found] = await tx
    .select({ accountId: finderSubscriptionPeriods.accountId })
    .from(finderSubscriptionPeriods)
    .where(eq(finderSubscriptionPeriods.paymentBatchId, batch.id))
    .limit(1);
  if (!found) return;
  await lockAccount(tx, found.accountId);

  // Re-read under the lock: whoever got here first has already done the work.
  const [period] = await tx
    .select()
    .from(finderSubscriptionPeriods)
    .where(eq(finderSubscriptionPeriods.paymentBatchId, batch.id))
    .limit(1);
  if (!period || (period.status !== 'PENDING_PAYMENT' && period.status !== 'SUPERSEDED')) return;

  const [live] = await tx
    .select({ endsAt: sql<Date | null>`max(${finderSubscriptionPeriods.endsAt})` })
    .from(finderSubscriptionPeriods)
    .where(and(eq(finderSubscriptionPeriods.accountId, period.accountId), eq(finderSubscriptionPeriods.status, 'ACTIVE')));
  const liveEndsAt = live?.endsAt ? new Date(live.endsAt) : null;
  const startsAt = periodStart(liveEndsAt, now);
  const endsAt = addMonths(startsAt, period.durationMonths);

  const [row] = await tx
    .update(finderSubscriptionPeriods)
    .set({ status: 'ACTIVE', startsAt, endsAt, version: period.version + 1, updatedAt: now })
    .where(and(eq(finderSubscriptionPeriods.id, period.id), eq(finderSubscriptionPeriods.version, period.version)))
    .returning();
  if (!row) return;

  await recordAudit(tx, null, {
    action: 'FINDER_SUBSCRIPTION_ACTIVATED',
    targetType: 'FINDER_SUBSCRIPTION',
    targetId: row.id,
    targetVersion: row.version,
    before: { status: period.status },
    after: {
      status: 'ACTIVE',
      kind: row.kind,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      continuedFromLiveChain: liveEndsAt !== null && liveEndsAt.getTime() > now.getTime(),
      paidAfterSupersede: period.status === 'SUPERSEDED',
      paymentBatchId: batch.id,
    },
  });

  if (await finderFlagEnabled(tx, 'finder.flag.notifications')) {
    await createNotification(tx, {
      recipientAccountId: row.accountId,
      kind: 'FINDER_SUBSCRIPTION_ACTIVATED',
      titleFa: row.kind === 'RENEWAL' ? 'اشتراک جفت‌یابی تمدید شد' : 'اشتراک جفت‌یابی فعال شد',
      bodyFa: 'پرداخت روی سرور تأیید شد و دوره اشتراک ثبت است.',
      resume: { entity: { type: 'FINDER_SUBSCRIPTION', id: row.id }, step: 'ACTIVE', originRoute: ACCOUNT_ROUTE },
    });
  }
}

// ── Reads for the account page ────────────────────────────────────────────────

export async function subscriptionHistory(database: DbClient, accountId: string): Promise<readonly PeriodRow[]> {
  return database
    .select()
    .from(finderSubscriptionPeriods)
    .where(eq(finderSubscriptionPeriods.accountId, accountId))
    .orderBy(desc(finderSubscriptionPeriods.createdAt));
}

export interface IdentityReadyAnimal {
  readonly id: string;
  readonly name: string | null;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly breedNameFa: string | null;
  readonly hasOfficialChip: boolean;
}

/**
 * The owner's registered animals of a species the finder is open for, with the
 * one identity fact that exists today: whether an official microchip row is
 * bound. This is not the profile eligibility check (PROMPT-003 adds KYC,
 * fertility declaration, life status and photos); the page says so.
 */
export async function ownerAnimalsForFinder(database: DbClient, accountId: string): Promise<readonly IdentityReadyAnimal[]> {
  const rows = await database
    .select({
      id: animals.id,
      name: animals.name,
      sex: animals.sex,
      species: animals.species,
      breedNameFa: referenceBreeds.nameFa,
      chipId: microchips.id,
    })
    .from(animals)
    .leftJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
    .leftJoin(microchips, eq(microchips.animalId, animals.id))
    .where(and(eq(animals.ownerAccountId, accountId), inArray(animals.status, ['REGISTERED'])));
  const open = new Map<string, boolean>();
  const result: IdentityReadyAnimal[] = [];
  for (const row of rows) {
    if (!open.has(row.species)) open.set(row.species, await speciesEnabled(database, 'MATING', row.species));
    if (!open.get(row.species)) continue;
    result.push({ id: row.id, name: row.name, sex: row.sex, breedNameFa: row.breedNameFa, hasOfficialChip: row.chipId !== null });
  }
  return result;
}

/** Which audiences this account may buy for: a kennel plan needs an approved kennel. */
export async function purchasableAudiences(database: DbClient, accountId: string): Promise<readonly FinderAudience[]> {
  const kennel = await kennelOfOwner(database, accountId);
  return kennel?.status === 'APPROVED' ? ['OWNER', 'KENNEL'] : ['OWNER'];
}
