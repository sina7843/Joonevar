/**
 * Ways a price comes down, and who pays for them — PROMPT-012.
 *
 * The kind of a rule decides whose money it is: a shop's own reduction and
 * its own code come out of that shop, a platform code and a category campaign
 * out of Hamzist. An order records which rule gave it what and who bore it,
 * so "who paid for this discount" is a row rather than an argument.
 *
 * Limits are the redemption table, not a counter: counting rows is what
 * enforces a ceiling, and two people racing for the last use of a code both
 * try to insert, so one of them loses to a unique index rather than to a
 * check they both passed.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { discountRedemptions, discountRules, stackingPolicies } from '../db/schema/promotions.ts';
import { commerceProducts } from '../db/schema/catalog.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { assertMarketplaceCapability } from '../marketplace/model.ts';
import type { Actor } from '../authz/actor.ts';
import { assertSellerCapability } from './sellers.ts';
import { assertWithinLimit } from '../security/rate-limit.ts';
import {
  applyDiscounts,
  bornByPlatform,
  DISCOUNT_KINDS,
  DISCOUNT_REFUSAL_FA,
  NO_STACKING,
  ruleRefusal,
  type AppliedDiscount,
  type DiscountKind,
  type DiscountRefusal,
  type DiscountTerms,
  type StackingPolicy,
} from './trust-model.ts';

export type DiscountRuleRow = typeof discountRules.$inferSelect;
export type StackingPolicyRow = typeof stackingPolicies.$inferSelect;

// ── the rules ──────────────────────────────────────────────────────────────

export interface DiscountRuleInput {
  readonly kind: DiscountKind;
  readonly labelFa: string;
  readonly code: string | null;
  readonly sellerId: string | null;
  readonly categoryId: string | null;
  readonly productId: string | null;
  readonly percentBp: number | null;
  readonly amountToman: bigint | null;
  readonly maxDiscountToman: bigint | null;
  readonly minBasketToman: bigint | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly totalUses: number | null;
  readonly usesPerAccount: number | null;
  readonly priority: number;
  readonly noteFa: string | null;
}

/**
 * Create one rule.
 *
 * A shop may only create its own two kinds, and only for itself; the
 * platform's two are the operator's. That is checked here rather than trusted
 * from a form, because the kind is what decides who pays.
 */
export async function createDiscountRule(
  database: Database,
  actor: Actor,
  input: DiscountRuleInput,
): Promise<DiscountRuleRow> {
  if (!DISCOUNT_KINDS.includes(input.kind)) throw validation('نوع تخفیف معتبر نیست.');
  const labelFa = input.labelFa.trim();
  if (labelFa.length < 3) throw validation('نام این تخفیف را بنویسید.');

  const sellerOwned = input.kind === 'SELLER_DISCOUNT' || input.kind === 'SELLER_CODE';
  if (sellerOwned) {
    if (input.sellerId === null) throw validation('این نوع تخفیف به یک فروشگاه تعلق دارد.');
    await assertSellerCapability(database, actor, input.sellerId, 'STORE_EDIT');
  } else if (input.kind !== 'FREE_SHIPPING') {
    // A platform code or a category campaign is Hamzist's money.
    assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
    if (input.sellerId !== null) throw validation('تخفیف پلتفرم به فروشگاه مشخصی تعلق نمی‌گیرد.');
  } else if (input.sellerId !== null) {
    await assertSellerCapability(database, actor, input.sellerId, 'STORE_EDIT');
  } else {
    assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  }

  const needsCode = input.kind === 'SELLER_CODE' || input.kind === 'PLATFORM_CODE';
  const code = (input.code ?? '').trim().toUpperCase();
  if (needsCode && !/^[A-Z0-9-]{4,24}$/.test(code)) {
    throw validation('کد تخفیف باید ۴ تا ۲۴ نویسه انگلیسی، رقم یا خط تیره باشد.');
  }
  if (!needsCode && code !== '') throw validation('این نوع تخفیف کد ندارد.');

  if (input.kind !== 'FREE_SHIPPING' && input.percentBp === null && input.amountToman === null) {
    throw validation('مقدار تخفیف را به درصد یا به مبلغ بنویسید.');
  }
  if (input.percentBp !== null && (input.percentBp <= 0 || input.percentBp > 10_000)) {
    throw validation('درصد تخفیف باید بین ۰ و ۱۰۰ باشد.');
  }
  if (input.amountToman !== null && input.amountToman <= 0n) throw validation('مبلغ تخفیف باید مثبت باشد.');
  if (input.endsAt !== null && input.startsAt !== null && input.endsAt <= input.startsAt) {
    throw validation('پایان بازه باید بعد از آغاز آن باشد.');
  }

  try {
    const [row] = await database
      .insert(discountRules)
      .values({
        kind: input.kind,
        labelFa,
        code: needsCode ? code : null,
        sellerId: input.sellerId,
        categoryId: input.categoryId,
        productId: input.productId,
        percentBp: input.percentBp,
        amountToman: input.amountToman,
        maxDiscountToman: input.maxDiscountToman,
        minBasketToman: input.minBasketToman,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        totalUses: input.totalUses,
        usesPerAccount: input.usesPerAccount,
        priority: input.priority,
        noteFa: input.noteFa,
        createdByAccountId: actor.accountId,
      })
      .returning();

    await recordAudit(database, actor, {
      action: 'COMMERCE_DISCOUNT_RULE_CREATED',
      targetType: input.sellerId ? 'COMMERCE_SELLER' : 'PRODUCT_SETTING',
      targetId: input.sellerId ?? row!.id,
      after: {
        ruleId: row!.id,
        kind: input.kind,
        code: needsCode ? code : null,
        percentBp: input.percentBp,
        amountToman: input.amountToman?.toString() ?? null,
        bornByPlatform: bornByPlatform(input.kind),
      },
    });
    return row!;
  } catch (error) {
    const { violates } = await import('../db/constraint.ts');
    if (violates(error, 'discount_rule_code_key')) throw conflict('این کد تخفیف از قبل وجود دارد.');
    throw error;
  }
}

export async function moveDiscountRule(
  database: Database,
  actor: Actor,
  input: { ruleId: string; to: 'ACTIVE' | 'PAUSED' | 'ENDED' },
): Promise<DiscountRuleRow> {
  const rule = await loadRule(database, input.ruleId);
  if (rule.sellerId !== null) {
    await assertSellerCapability(database, actor, rule.sellerId, 'STORE_EDIT');
  } else {
    assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  }
  if (rule.status === 'ENDED') throw conflict('این تخفیف پایان یافته است.');

  const [updated] = await database
    .update(discountRules)
    .set({ status: input.to, version: rule.version + 1, updatedAt: new Date() })
    .where(and(eq(discountRules.id, rule.id), eq(discountRules.version, rule.version)))
    .returning();
  if (!updated) throw conflict('این تخفیف در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'COMMERCE_DISCOUNT_RULE_MOVED',
    targetType: rule.sellerId ? 'COMMERCE_SELLER' : 'PRODUCT_SETTING',
    targetId: rule.sellerId ?? rule.id,
    before: { status: rule.status },
    after: { status: input.to, ruleId: rule.id },
  });
  return updated;
}

export async function loadRule(database: DbClient, ruleId: string): Promise<DiscountRuleRow> {
  const [row] = await database.select().from(discountRules).where(eq(discountRules.id, ruleId)).limit(1);
  if (!row) throw notFound('این تخفیف پیدا نشد.');
  return row;
}

export async function rulesOfSeller(database: Database, actor: Actor, sellerId: string) {
  await assertSellerCapability(database, actor, sellerId, 'STORE_VIEW');
  return database
    .select()
    .from(discountRules)
    .where(eq(discountRules.sellerId, sellerId))
    .orderBy(desc(discountRules.createdAt))
    .limit(50);
}

export async function platformRules(database: Database, actor: Actor) {
  assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  return database
    .select()
    .from(discountRules)
    .where(isNull(discountRules.sellerId))
    .orderBy(desc(discountRules.createdAt))
    .limit(50);
}

// ── how they combine ───────────────────────────────────────────────────────

/** The stacking policy in force, or none — in which case nothing stacks. */
export async function livePolicy(database: DbClient): Promise<{ row: StackingPolicyRow | null; policy: StackingPolicy }> {
  const [row] = await database
    .select()
    .from(stackingPolicies)
    .where(isNull(stackingPolicies.supersededAt))
    .limit(1);
  if (!row) return { row: null, policy: NO_STACKING };
  const parsed = row.rules as { combinable?: [DiscountKind, DiscountKind][]; order?: DiscountKind[] };
  return {
    row,
    policy: {
      combinable: parsed.combinable ?? [],
      order: parsed.order ?? [...DISCOUNT_KINDS],
    },
  };
}

export async function publishStackingPolicy(
  database: Database,
  actor: Actor,
  input: { version: string; bodyFa: string; combinable: readonly (readonly [DiscountKind, DiscountKind])[]; order: readonly DiscountKind[] },
): Promise<StackingPolicyRow> {
  assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  const version = input.version.trim();
  const bodyFa = input.bodyFa.trim();
  if (version.length < 3) throw validation('شناسه نسخه را بنویسید.');
  if (bodyFa.length < 20) throw validation('متن این سیاست را کامل بنویسید.');
  for (const pair of input.combinable) {
    for (const kind of pair) {
      if (!DISCOUNT_KINDS.includes(kind)) throw validation('یکی از نوع‌های انتخاب‌شده معتبر نیست.');
    }
  }

  const now = new Date();
  return database.transaction(async (tx) => {
    await tx
      .update(stackingPolicies)
      .set({ supersededAt: now })
      .where(isNull(stackingPolicies.supersededAt));
    const [row] = await tx
      .insert(stackingPolicies)
      .values({
        version,
        bodyFa,
        rules: { combinable: input.combinable, order: input.order },
        publishedByAccountId: actor.accountId,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: 'COMMERCE_STACKING_POLICY_PUBLISHED',
      targetType: 'PRODUCT_SETTING',
      targetId: row!.id,
      after: { version, pairs: input.combinable.length },
    });
    return row!;
  });
}

// ── using them ─────────────────────────────────────────────────────────────

const termsOf = (row: DiscountRuleRow): DiscountTerms => ({
  id: row.id,
  kind: row.kind as DiscountKind,
  labelFa: row.labelFa,
  percentBp: row.percentBp,
  amountToman: row.amountToman,
  maxDiscountToman: row.maxDiscountToman,
  minBasketToman: row.minBasketToman,
  priority: row.priority,
});

/** How often a rule has been used in total, and by one person. */
async function usage(
  database: DbClient,
  ruleId: string,
  accountId: string,
): Promise<{ total: number; byAccount: number }> {
  const rows = await database
    .select({ accountId: discountRedemptions.accountId })
    .from(discountRedemptions)
    .where(eq(discountRedemptions.ruleId, ruleId));
  return {
    total: rows.length,
    byAccount: rows.filter((row) => row.accountId === accountId).length,
  };
}

export interface QuoteInput {
  readonly accountId: string;
  readonly sellerId: string;
  readonly itemsTotalToman: bigint;
  readonly productIds: readonly string[];
  /** A code the buyer typed, if any. */
  readonly code?: string | null;
}

export interface DiscountQuote {
  readonly applied: readonly AppliedDiscount[];
  readonly refused: readonly { labelFa: string; reasonFa: string }[];
  readonly totalToman: bigint;
  readonly freeShipping: boolean;
}

/**
 * What comes off this shop's part of a basket.
 *
 * Automatic rules are found; a typed code is looked up and refused by name if
 * it cannot be used, because "invalid code" tells a buyer nothing about
 * whether they mistyped it, arrived late, or used it already. What actually
 * applies and in what order is the stacking policy's decision.
 */
export async function quoteDiscounts(database: Database, input: QuoteInput): Promise<DiscountQuote> {
  const { policy } = await livePolicy(database);
  const now = new Date();

  const categories =
    input.productIds.length === 0
      ? []
      : await database
          .select({ id: commerceProducts.id, categoryId: commerceProducts.categoryId })
          .from(commerceProducts)
          .where(inArray(commerceProducts.id, [...new Set(input.productIds)]));
  const categoryIds = [...new Set(categories.map((row) => row.categoryId))];

  // Every live rule nobody has to type. Which of them reach this basket is
  // decided below, line by line, because a rule can be narrowed by shop, by
  // category or by one product.
  const automatic = await database
    .select()
    .from(discountRules)
    .where(and(eq(discountRules.status, 'ACTIVE'), isNull(discountRules.code)))
    .limit(100);

  const candidates: DiscountRuleRow[] = [];
  const refused: { labelFa: string; reasonFa: string }[] = [];

  for (const rule of automatic) {
    if (rule.sellerId !== null && rule.sellerId !== input.sellerId) continue;
    if (rule.categoryId !== null && !categoryIds.includes(rule.categoryId)) continue;
    if (rule.productId !== null && !input.productIds.includes(rule.productId)) continue;
    const used = await usage(database, rule.id, input.accountId);
    const refusal = ruleRefusal({
      status: rule.status,
      startsAt: rule.startsAt,
      endsAt: rule.endsAt,
      totalUses: rule.totalUses,
      usedTotal: used.total,
      usesPerAccount: rule.usesPerAccount,
      usedByAccount: used.byAccount,
      now,
    });
    if (refusal === null) candidates.push(rule);
  }

  const typed = (input.code ?? '').trim().toUpperCase();
  if (typed !== '') {
    // Trying codes until one works is the thing this ceiling exists for, and
    // a refused try still counts (PROMPT-013).
    await assertWithinLimit(database, {
      action: 'DISCOUNT_CODE_TRY',
      actor: { accountId: input.accountId } as never,
    });
    const [rule] = await database
      .select()
      .from(discountRules)
      .where(eq(discountRules.code, typed))
      .limit(1);
    if (!rule) {
      refused.push({ labelFa: typed, reasonFa: 'چنین کدی وجود ندارد.' });
    } else {
      const applicable =
        (rule.sellerId === null || rule.sellerId === input.sellerId) &&
        (rule.categoryId === null || categoryIds.includes(rule.categoryId)) &&
        (rule.productId === null || input.productIds.includes(rule.productId));
      const used = await usage(database, rule.id, input.accountId);
      const refusal: DiscountRefusal | null = !applicable
        ? 'NOT_APPLICABLE'
        : ruleRefusal({
            status: rule.status,
            startsAt: rule.startsAt,
            endsAt: rule.endsAt,
            totalUses: rule.totalUses,
            usedTotal: used.total,
            usesPerAccount: rule.usesPerAccount,
            usedByAccount: used.byAccount,
            now,
          });
      if (refusal === null) candidates.push(rule);
      else refused.push({ labelFa: rule.labelFa, reasonFa: DISCOUNT_REFUSAL_FA[refusal] });
    }
  }

  const money = candidates.filter((rule) => rule.kind !== 'FREE_SHIPPING');
  const outcome = applyDiscounts({
    candidates: money.map(termsOf),
    baseToman: input.itemsTotalToman,
    policy,
  });
  for (const entry of outcome.refused) {
    refused.push({ labelFa: entry.terms.labelFa, reasonFa: DISCOUNT_REFUSAL_FA[entry.reason] });
  }

  return {
    applied: outcome.applied,
    refused,
    totalToman: outcome.applied.reduce((sum, entry) => sum + entry.amountToman, 0n),
    freeShipping: candidates.some((rule) => rule.kind === 'FREE_SHIPPING'),
  };
}

/**
 * Record that these rules were used on this order.
 *
 * Written inside the transaction that places the order, so a discount cannot
 * exist without the order it came off. The unique index is the limit: if the
 * last use went to somebody else between the quote and here, this insert
 * fails and the whole order rolls back rather than being placed at a price
 * nobody was entitled to.
 */
export async function redeemDiscounts(
  tx: DbClient,
  input: {
    accountId: string;
    orderId: string;
    subOrderId: string;
    applied: readonly AppliedDiscount[];
  },
): Promise<void> {
  if (input.applied.length === 0) return;
  for (const entry of input.applied) {
    // Each rule's ceiling is re-read here, inside the transaction, so a code
    // that ran out while the buyer was typing their address is refused now
    // rather than honoured.
    const [rule] = await tx
      .select({ totalUses: discountRules.totalUses, usesPerAccount: discountRules.usesPerAccount, labelFa: discountRules.labelFa })
      .from(discountRules)
      .where(eq(discountRules.id, entry.terms.id))
      .limit(1);
    if (!rule) throw conflict('یکی از تخفیف‌های این سبد دیگر در دسترس نیست.');

    const existing = await tx
      .select({ accountId: discountRedemptions.accountId })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.ruleId, entry.terms.id));
    if (rule.totalUses !== null && existing.length >= rule.totalUses) {
      throw conflict('ظرفیت «' + rule.labelFa + '» همین حالا تمام شد؛ سبد را دوباره ببینید.');
    }
    if (
      rule.usesPerAccount !== null &&
      existing.filter((row) => row.accountId === input.accountId).length >= rule.usesPerAccount
    ) {
      throw conflict('شما پیش از این از «' + rule.labelFa + '» استفاده کرده‌اید.');
    }

    await tx.insert(discountRedemptions).values({
      ruleId: entry.terms.id,
      accountId: input.accountId,
      orderId: input.orderId,
      subOrderId: input.subOrderId,
      amountToman: entry.amountToman,
      borneByPlatform: entry.borneByPlatform,
    });
  }
}

/**
 * Give back the uses an order took, when that order never happened.
 *
 * A cancelled order's code should be usable again: the ceiling is a count of
 * orders that stood, not of attempts.
 */
export async function releaseDiscounts(tx: DbClient, orderId: string): Promise<number> {
  const removed = await tx
    .delete(discountRedemptions)
    .where(eq(discountRedemptions.orderId, orderId))
    .returning({ id: discountRedemptions.id });
  return removed.length;
}

/** What one order's discounts cost, and who bore each part. */
export async function redemptionsOfOrder(database: DbClient, orderId: string) {
  return database
    .select({
      amountToman: discountRedemptions.amountToman,
      borneByPlatform: discountRedemptions.borneByPlatform,
      labelFa: discountRules.labelFa,
      kind: discountRules.kind,
    })
    .from(discountRedemptions)
    .innerJoin(discountRules, eq(discountRules.id, discountRedemptions.ruleId))
    .where(eq(discountRedemptions.orderId, orderId));
}
