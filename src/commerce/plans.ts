/**
 * Seller plans and the periods bought on them — PROMPT-008.
 *
 * A plan is a published version, like the commission rule of PROMPT-006: what
 * a store bought is frozen on its subscription, so changing a plan next month
 * changes nothing for the periods already running.
 *
 * A store becomes ACTIVE because a period began, and a period begins in exactly
 * two ways: a payment this server verified, or a plan whose price was recorded
 * as zero at the moment it was bought. There is no third way, and in
 * particular there is no operator action that marks a store as having paid —
 * the test for that case asserts the refusal rather than the absence of a
 * button.
 */
import { and, desc, eq, gt, inArray, lt } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { commerceSellers, sellerPlans, sellerSubscriptions } from '../db/schema/commerce.ts';
import { createBatch, type BatchRecord } from '../billing/payments.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readMoney } from '../settings/service.ts';
import { resumeContext } from '../domain/resume-context.ts';
import { conflict, notConfigured, notFound, validation } from '../domain/errors.ts';
import { violates } from '../db/constraint.ts';
import type { Actor } from '../authz/actor.ts';
import { assertMarketplaceCapability } from '../marketplace/model.ts';
import { assertSellerCapability, loadSeller } from './sellers.ts';
import { planExpired, planProblems, planWindow, type PlanCapabilities } from './seller-model.ts';

export type PlanRow = typeof sellerPlans.$inferSelect;
export type SubscriptionRow = typeof sellerSubscriptions.$inferSelect;

/**
 * The two plans of the launch, as rows rather than as prices.
 *
 * Each points at the managed settings key holding its tariff, and both of those
 * start unset (PROMPT-002): seeding a plan therefore never seeds a price, and
 * the purchase path stays shut until somebody with the authority enters one.
 */
export const LAUNCH_PLANS: ReadonlyArray<{
  code: string;
  labelFa: string;
  durationDays: number;
  productLimit: number | null;
  commissionPercentBp: number;
  capabilities: PlanCapabilities;
  priceSettingKey: string;
}> = [
  {
    code: 'BASIC',
    labelFa: 'پلن پایه فروشنده',
    durationDays: 30,
    productLimit: 50,
    commissionPercentBp: 0,
    capabilities: { canPromote: false },
    priceSettingKey: 'market.shop.seller_plan_basic_monthly_toman',
  },
  {
    code: 'PRO',
    labelFa: 'پلن حرفه‌ای فروشنده',
    durationDays: 30,
    productLimit: null,
    commissionPercentBp: 0,
    capabilities: { canPromote: true, maxActivePromotions: 5 },
    priceSettingKey: 'market.shop.seller_plan_pro_monthly_toman',
  },
];

/**
 * Publish a plan version.
 *
 * The previous published version of the same code is archived in the same
 * transaction, so there is never a moment with two live versions of one plan.
 * Subscriptions already sold keep pointing at the version they bought.
 */
export async function publishPlan(
  database: Database,
  actor: Actor,
  input: {
    code: string;
    labelFa: string;
    durationDays: number;
    productLimit: number | null;
    commissionPercentBp: number;
    capabilities: PlanCapabilities;
    priceSettingKey: string;
    noteFa: string;
  },
): Promise<PlanRow> {
  assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  const problems = planProblems({
    durationDays: input.durationDays,
    productLimit: input.productLimit,
    commissionPercentBp: input.commissionPercentBp,
    capabilities: input.capabilities,
  });
  if (problems.length > 0) throw validation(problems[0]!);
  const noteFa = input.noteFa.trim();
  if (noteFa === '') throw validation('توضیح این نسخه را بنویسید؛ در تاریخچه ثبت می‌شود.');

  return database.transaction(async (tx) => {
    const [live] = await tx
      .select()
      .from(sellerPlans)
      .where(and(eq(sellerPlans.code, input.code), eq(sellerPlans.status, 'PUBLISHED')))
      .limit(1);
    const [previous] = await tx
      .select({ version: sellerPlans.version })
      .from(sellerPlans)
      .where(eq(sellerPlans.code, input.code))
      .orderBy(desc(sellerPlans.version))
      .limit(1);

    if (live) {
      await tx
        .update(sellerPlans)
        .set({ status: 'ARCHIVED', archivedAt: new Date() })
        .where(and(eq(sellerPlans.id, live.id), eq(sellerPlans.status, 'PUBLISHED')));
    }

    const [created] = await tx
      .insert(sellerPlans)
      .values({
        code: input.code,
        labelFa: input.labelFa,
        version: (previous?.version ?? 0) + 1,
        status: 'PUBLISHED',
        durationDays: input.durationDays,
        productLimit: input.productLimit,
        commissionPercentBp: input.commissionPercentBp,
        capabilities: input.capabilities,
        priceSettingKey: input.priceSettingKey,
        noteFa,
        createdByAccountId: actor.accountId,
        publishedAt: new Date(),
      })
      .returning();

    await recordAudit(tx, actor, {
      action: 'COMMERCE_PLAN_PUBLISHED',
      targetType: 'SELLER_PLAN',
      targetId: created!.id,
      before: live ? { planId: live.id, version: live.version } : undefined,
      after: {
        code: input.code,
        version: created!.version,
        durationDays: input.durationDays,
        productLimit: input.productLimit,
        commissionPercentBp: input.commissionPercentBp,
        capabilities: input.capabilities,
      },
      reason: noteFa,
    });
    return created!;
  });
}

/** Seed the launch plans as drafts of record; prices stay unset. */
export async function ensureLaunchPlans(database: Database, actor: Actor): Promise<number> {
  assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  let created = 0;
  for (const plan of LAUNCH_PLANS) {
    const [existing] = await database
      .select({ id: sellerPlans.id })
      .from(sellerPlans)
      .where(eq(sellerPlans.code, plan.code))
      .limit(1);
    if (existing) continue;
    await publishPlan(database, actor, { ...plan, noteFa: 'نسخه اولیه پلن ' + plan.labelFa });
    created += 1;
  }
  return created;
}

export interface PlanView {
  readonly id: string;
  readonly code: string;
  readonly labelFa: string;
  readonly version: number;
  readonly durationDays: number;
  readonly productLimit: number | null;
  readonly commissionPercentBp: number;
  readonly capabilities: PlanCapabilities;
  readonly priceSettingKey: string;
  /** Null when the tariff is unset, which is a real state and not free. */
  readonly priceToman: bigint | null;
}

export async function publishedPlans(database: DbClient): Promise<readonly PlanView[]> {
  const rows = await database
    .select()
    .from(sellerPlans)
    .where(eq(sellerPlans.status, 'PUBLISHED'))
    .orderBy(sellerPlans.code);

  const out: PlanView[] = [];
  for (const row of rows) {
    const price = await readMoney(database, row.priceSettingKey);
    out.push({
      id: row.id,
      code: row.code,
      labelFa: row.labelFa,
      version: row.version,
      durationDays: row.durationDays,
      productLimit: row.productLimit,
      commissionPercentBp: row.commissionPercentBp,
      capabilities: (row.capabilities ?? {}) as PlanCapabilities,
      priceSettingKey: row.priceSettingKey,
      priceToman: price.configured ? price.toman : null,
    });
  }
  return out;
}

export async function planHistory(database: DbClient, actor: Actor): Promise<readonly PlanRow[]> {
  assertMarketplaceCapability(actor, 'MARKET_OVERVIEW_VIEW');
  return database.select().from(sellerPlans).orderBy(desc(sellerPlans.createdAt));
}

// ── buying a period ────────────────────────────────────────────────────────

export interface StartedSubscription {
  readonly subscription: SubscriptionRow;
  readonly batch: BatchRecord | null;
}

/**
 * Buy or renew a plan period.
 *
 * A priced plan opens a payment and the period begins only when that payment is
 * verified. A plan an operator recorded as costing nothing starts immediately
 * and says so on the row, so "free" is a recorded decision rather than a
 * missing price.
 */
export async function startPlanPurchase(
  database: Database,
  actor: Actor,
  input: { sellerId: string; planId: string },
): Promise<StartedSubscription> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_BILLING');
  const seller = await loadSeller(database, input.sellerId);
  if (!['APPROVED', 'ACTIVE', 'SUSPENDED'].includes(seller.status)) {
    throw conflict('تا تأیید پرونده فروشگاه، خرید پلن باز نمی‌شود.');
  }

  const [plan] = await database
    .select()
    .from(sellerPlans)
    .where(and(eq(sellerPlans.id, input.planId), eq(sellerPlans.status, 'PUBLISHED')))
    .limit(1);
  if (!plan) throw notFound('این پلن پیدا نشد.');

  const price = await readMoney(database, plan.priceSettingKey);
  if (!price.configured) throw notConfigured(plan.priceSettingKey);
  const free = price.toman === 0n;

  return database.transaction(async (tx) => {
    let subscription: SubscriptionRow;
    try {
      const [row] = await tx
        .insert(sellerSubscriptions)
        .values({
          sellerId: seller.id,
          planId: plan.id,
          status: free ? 'ACTIVE' : 'PENDING_PAYMENT',
          durationDays: plan.durationDays,
          productLimit: plan.productLimit,
          commissionPercentBp: plan.commissionPercentBp,
          capabilities: plan.capabilities,
          freeOfCharge: free,
          ...(free ? planWindow(new Date(), plan.durationDays) : {}),
        })
        .returning();
      subscription = row!;
    } catch (error) {
      if (violates(error, 'seller_subscription_live_key')) {
        throw conflict('این فروشگاه یک دوره فعال یا در انتظار پرداخت دارد.');
      }
      throw error;
    }

    if (free) {
      await activateSeller(tx, seller.id, actor);
      await recordAudit(tx, actor, {
        action: 'COMMERCE_PLAN_ACTIVATED',
        targetType: 'COMMERCE_SELLER',
        targetId: seller.id,
        after: { subscriptionId: subscription.id, planCode: plan.code, freeOfCharge: true },
      });
      return { subscription, batch: null };
    }

    const batch = await createBatch(tx as Database, actor, {
      service: 'COMMERCE_SELLER_PLAN',
      items: [{ targetType: 'SELLER_SUBSCRIPTION', targetId: subscription.id, settingKey: plan.priceSettingKey }],
      resume: resumeContext({
        entity: { type: 'COMMERCE_SELLER', id: seller.id },
        step: 'SELLER_PLAN_PAYMENT',
        originRoute: '/account/seller',
      }),
    });

    const [linked] = await tx
      .update(sellerSubscriptions)
      .set({ paymentBatchId: batch.id, updatedAt: new Date() })
      .where(eq(sellerSubscriptions.id, subscription.id))
      .returning();

    await recordAudit(tx, actor, {
      action: 'COMMERCE_PLAN_PURCHASE_STARTED',
      targetType: 'COMMERCE_SELLER',
      targetId: seller.id,
      after: { subscriptionId: subscription.id, planCode: plan.code, batchId: batch.id },
    });
    return { subscription: linked!, batch };
  });
}

/**
 * Turn a verified payment into a live period.
 *
 * Runs inside the transaction that marked the batch paid. A renewal starts
 * where the live period ends rather than overlapping it, and the store becomes
 * ACTIVE here — the only place it ever does.
 */
export async function activatePlanFromPayment(
  tx: DbClient,
  batch: { id: string },
  now: Date = new Date(),
): Promise<void> {
  const [subscription] = await tx
    .select()
    .from(sellerSubscriptions)
    .where(eq(sellerSubscriptions.paymentBatchId, batch.id))
    .limit(1);
  if (!subscription || subscription.status !== 'PENDING_PAYMENT') return;

  const [live] = await tx
    .select({ endsAt: sellerSubscriptions.endsAt })
    .from(sellerSubscriptions)
    .where(
      and(
        eq(sellerSubscriptions.sellerId, subscription.sellerId),
        eq(sellerSubscriptions.status, 'ACTIVE'),
        gt(sellerSubscriptions.endsAt, now),
      ),
    )
    .orderBy(desc(sellerSubscriptions.endsAt))
    .limit(1);

  const window = planWindow(live?.endsAt ?? now, subscription.durationDays);
  await tx
    .update(sellerSubscriptions)
    .set({
      status: 'ACTIVE',
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      version: subscription.version + 1,
      updatedAt: now,
    })
    .where(eq(sellerSubscriptions.id, subscription.id));

  await activateSeller(tx, subscription.sellerId, null, now);

  await recordAudit(tx, null, {
    action: 'COMMERCE_PLAN_ACTIVATED',
    targetType: 'COMMERCE_SELLER',
    targetId: subscription.sellerId,
    after: {
      subscriptionId: subscription.id,
      startsAt: window.startsAt.toISOString(),
      endsAt: window.endsAt.toISOString(),
      batchId: batch.id,
    },
  });
}

/**
 * The store starts trading.
 *
 * Only from APPROVED, and only from here. A suspended store keeps its plan and
 * does not quietly come back to life by buying another period: lifting a
 * suspension is a reviewer's decision.
 */
async function activateSeller(tx: DbClient, sellerId: string, actor: Actor | null, now: Date = new Date()): Promise<void> {
  const [seller] = await tx
    .select({ id: commerceSellers.id, status: commerceSellers.status, version: commerceSellers.version })
    .from(commerceSellers)
    .where(eq(commerceSellers.id, sellerId))
    .limit(1);
  if (!seller || seller.status !== 'APPROVED') return;

  await tx
    .update(commerceSellers)
    .set({
      status: 'ACTIVE',
      activatedAt: now,
      statusReasonFa: 'دوره پلن فروشنده آغاز شد.',
      statusChangedAt: now,
      version: seller.version + 1,
      updatedAt: now,
    })
    .where(and(eq(commerceSellers.id, seller.id), eq(commerceSellers.version, seller.version)));

  await createNotification(tx, {
    recipientAccountId: (
      await tx
        .select({ ownerAccountId: commerceSellers.ownerAccountId })
        .from(commerceSellers)
        .where(eq(commerceSellers.id, seller.id))
        .limit(1)
    )[0]!.ownerAccountId,
    kind: 'COMMERCE_SELLER_ACTIVATED',
    titleFa: 'فروشگاه شما فعال شد',
    bodyFa: 'دوره پلن فروشندگی شما آغاز شد و فروشگاه می‌تواند فعالیت کند.',
    resume: resumeContext({
      entity: { type: 'COMMERCE_SELLER', id: seller.id },
      step: 'SELLER_DASHBOARD',
      originRoute: '/account/seller',
    }),
  });
  void actor;
}

export interface SubscriptionView {
  readonly subscription: SubscriptionRow | null;
  readonly planLabelFa: string | null;
  readonly expired: boolean;
  readonly productLimit: number | null;
  readonly capabilities: PlanCapabilities;
}

/**
 * The store's current period, judged at read time.
 *
 * An expired period is reported as expired without anything having run: no job
 * writes the expiry down, so a store cannot be trading on a plan that ended
 * merely because nobody swept it.
 */
export async function currentSubscription(
  database: DbClient,
  sellerId: string,
  now: Date = new Date(),
): Promise<SubscriptionView> {
  const [row] = await database
    .select({
      subscription: sellerSubscriptions,
      planLabelFa: sellerPlans.labelFa,
    })
    .from(sellerSubscriptions)
    .innerJoin(sellerPlans, eq(sellerPlans.id, sellerSubscriptions.planId))
    .where(
      and(
        eq(sellerSubscriptions.sellerId, sellerId),
        inArray(sellerSubscriptions.status, ['ACTIVE', 'PENDING_PAYMENT']),
      ),
    )
    .orderBy(desc(sellerSubscriptions.createdAt))
    .limit(1);

  if (!row) {
    return { subscription: null, planLabelFa: null, expired: false, productLimit: null, capabilities: {} };
  }
  const expired = row.subscription.status === 'ACTIVE' && planExpired(row.subscription.endsAt, now);
  return {
    subscription: row.subscription,
    planLabelFa: row.planLabelFa,
    expired,
    // An expired period grants nothing: neither its ceiling nor its powers.
    productLimit: expired ? null : row.subscription.productLimit,
    capabilities: expired ? {} : ((row.subscription.capabilities ?? {}) as PlanCapabilities),
  };
}

/**
 * Close the periods whose date has passed.
 *
 * Called by an operator or a scheduler; nothing in the product runs it by
 * itself, and `currentSubscription` already answers honestly without it. This
 * only tidies the rows so a queue is not full of periods that ended.
 */
export async function expireDuePeriods(database: Database, now: Date = new Date()): Promise<number> {
  const due = await database
    .select({ id: sellerSubscriptions.id, version: sellerSubscriptions.version })
    .from(sellerSubscriptions)
    .where(and(eq(sellerSubscriptions.status, 'ACTIVE'), lt(sellerSubscriptions.endsAt, now)));

  let expired = 0;
  for (const row of due) {
    const updated = await database
      .update(sellerSubscriptions)
      .set({ status: 'EXPIRED', version: row.version + 1, updatedAt: now })
      .where(and(eq(sellerSubscriptions.id, row.id), eq(sellerSubscriptions.version, row.version)))
      .returning({ id: sellerSubscriptions.id });
    expired += updated.length;
  }
  return expired;
}
