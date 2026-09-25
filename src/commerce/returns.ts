/**
 * Sending goods back — PROMPT-011.
 *
 * The right to return is the platform's promise to the buyer, and a shop
 * cannot take it away. A category can narrow it where the goods make
 * returning them unreasonable — opened food, hygiene goods, things that
 * perish — and every narrowing carries the sentence the buyer reads on the
 * product page. That sentence is frozen onto the item when it is bought, so a
 * policy published next month does not reach backwards.
 *
 * A request names items and quantities, not a whole sub-order, because
 * sending one of three things back is the ordinary case. What the refund
 * comes to is decided when the goods are seen, not when they are asked for.
 */
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import {
  categoryReturnRules,
  orderReturnItems,
  orderReturns,
  returnEvidence,
  returnPolicyVersions,
} from '../db/schema/fulfilment.ts';
import { commerceOrderItems, commerceOrders, commerceSubOrders, subOrderEvents } from '../db/schema/orders.ts';
import { commerceProducts, productCategories } from '../db/schema/catalog.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { putPrivateFile, safeOriginalName } from '../files/storage.ts';
import { readInt } from '../settings/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { assertMarketplaceCapability, hasMarketplaceCapability } from '../marketplace/model.ts';
import { openRefund } from '../marketplace/refunds.ts';
import type { Actor } from '../authz/actor.ts';
import { assertSellerCapability, membershipOf } from './sellers.ts';
import { chargeRefund } from './ledger.ts';
import {
  refundForCondition,
  returnDeadline,
  returnMovesFor,
  returnReference,
  returnTransitionAllowed,
  withinReturnWindow,
  RETURN_RULE_FA,
  type ReturnRule,
  type ReturnStatus,
  type ReturnedCondition,
} from './fulfilment-model.ts';

export type ReturnRow = typeof orderReturns.$inferSelect;
export type ReturnItemRow = typeof orderReturnItems.$inferSelect;
export type PolicyRow = typeof returnPolicyVersions.$inferSelect;

export const RETURN_WINDOW_KEY = 'market.shop.return_window_days';

// ── the policy ─────────────────────────────────────────────────────────────

/** The version in force, or nothing at all when none has been published. */
export async function livePolicy(database: DbClient): Promise<PolicyRow | null> {
  const [row] = await database
    .select()
    .from(returnPolicyVersions)
    .where(isNull(returnPolicyVersions.supersededAt))
    .limit(1);
  return row ?? null;
}

export interface PublishPolicyInput {
  readonly version: string;
  readonly windowDays: number;
  readonly bodyFa: string;
  readonly exceptions: readonly {
    categoryId: string;
    rule: ReturnRule;
    windowDays: number | null;
    reasonFa: string;
  }[];
}

/**
 * Publish a version of the return promise, with its category exceptions.
 *
 * A version is immutable once published, like the commission rule and the
 * seller agreement: buyers bought under the text that was in force, and that
 * text has to stay readable. Changing anything means publishing another one.
 */
export async function publishReturnPolicy(
  database: Database,
  actor: Actor,
  input: PublishPolicyInput,
): Promise<PolicyRow> {
  assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  const version = input.version.trim();
  const bodyFa = input.bodyFa.trim();
  if (version.length < 3) throw validation('شناسه نسخه سیاست مرجوعی را بنویسید.');
  if (bodyFa.length < 20) throw validation('متن سیاست مرجوعی را کامل بنویسید؛ خریدار همین را می‌خواند.');
  if (!Number.isInteger(input.windowDays) || input.windowDays < 0 || input.windowDays > 365) {
    throw validation('مهلت مرجوعی باید عددی بین صفر تا ۳۶۵ روز باشد.');
  }
  for (const exception of input.exceptions) {
    if (exception.reasonFa.trim().length < 5) {
      throw validation('برای هر استثنای دسته، دلیلش را بنویسید؛ همین جمله روی صفحه کالا نوشته می‌شود.');
    }
    if (
      exception.windowDays !== null &&
      (!Number.isInteger(exception.windowDays) || exception.windowDays < 0 || exception.windowDays > input.windowDays)
    ) {
      // An exception narrows the promise; one that lengthened it would be a
      // different promise wearing the word "exception".
      throw validation('مهلت استثنای دسته نمی‌تواند از مهلت عمومی بیشتر باشد.');
    }
  }

  const now = new Date();
  return database.transaction(async (tx) => {
    await tx
      .update(returnPolicyVersions)
      .set({ supersededAt: now })
      .where(isNull(returnPolicyVersions.supersededAt));

    const [row] = await tx
      .insert(returnPolicyVersions)
      .values({
        version,
        windowDays: input.windowDays,
        bodyFa,
        publishedByAccountId: actor.accountId,
      })
      .returning();

    if (input.exceptions.length > 0) {
      await tx.insert(categoryReturnRules).values(
        input.exceptions.map((exception) => ({
          policyVersionId: row!.id,
          categoryId: exception.categoryId,
          rule: exception.rule,
          windowDays: exception.windowDays,
          reasonFa: exception.reasonFa.trim(),
        })),
      );
    }

    await recordAudit(tx, actor, {
      action: 'COMMERCE_RETURN_POLICY_PUBLISHED',
      targetType: 'PRODUCT_SETTING',
      targetId: row!.id,
      after: { version, windowDays: input.windowDays, exceptions: input.exceptions.length },
    });
    return row!;
  });
}

export interface CategoryRule {
  readonly rule: ReturnRule;
  readonly windowDays: number | null;
  readonly reasonFa: string;
}

/**
 * What this category does to the promise, under the version in force.
 *
 * No exception means the ordinary right, said in the ordinary words. No
 * policy at all means nothing has been promised yet, and the caller is
 * expected to say so rather than inventing a window.
 */
export async function ruleForCategory(
  database: DbClient,
  categoryId: string,
  policyVersionId?: string,
): Promise<CategoryRule> {
  const versionId = policyVersionId ?? (await livePolicy(database))?.id;
  if (!versionId) {
    return { rule: 'STANDARD', windowDays: null, reasonFa: RETURN_RULE_FA.STANDARD };
  }
  const [row] = await database
    .select()
    .from(categoryReturnRules)
    .where(
      and(eq(categoryReturnRules.policyVersionId, versionId), eq(categoryReturnRules.categoryId, categoryId)),
    )
    .limit(1);
  if (!row) return { rule: 'STANDARD', windowDays: null, reasonFa: RETURN_RULE_FA.STANDARD };
  return { rule: row.rule as ReturnRule, windowDays: row.windowDays, reasonFa: row.reasonFa };
}

export async function policyExceptions(database: DbClient, policyVersionId: string) {
  return database
    .select({
      categoryId: categoryReturnRules.categoryId,
      categoryNameFa: productCategories.nameFa,
      rule: categoryReturnRules.rule,
      windowDays: categoryReturnRules.windowDays,
      reasonFa: categoryReturnRules.reasonFa,
    })
    .from(categoryReturnRules)
    .innerJoin(productCategories, eq(productCategories.id, categoryReturnRules.categoryId))
    .where(eq(categoryReturnRules.policyVersionId, policyVersionId))
    .orderBy(asc(productCategories.nameFa));
}

// ── one return ─────────────────────────────────────────────────────────────

export interface ReturnLineInput {
  readonly orderItemId: string;
  readonly quantity: number;
  readonly reasonFa: string;
}

/**
 * Ask for goods to go back.
 *
 * Every line is checked against three things that can each make it
 * impossible: the quantity has to be one actually bought and not already
 * returned, the window has to be open, and the category's own rule has to
 * allow a return at all. A line that fails any of them is refused with the
 * sentence that applies to it, which for a category exception is the sentence
 * frozen onto the item when it was bought.
 */
export async function requestReturn(
  database: Database,
  actor: Actor,
  input: { subOrderId: string; reasonFa: string; lines: readonly ReturnLineInput[] },
): Promise<ReturnRow> {
  if (!actor.accountId) throw forbidden('برای ثبت مرجوعی باید وارد حساب شوید.');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa.length < 5) throw validation('دلیل مرجوعی را بنویسید.');
  if (input.lines.length === 0) throw validation('حداقل یک قلم برای مرجوعی انتخاب کنید.');

  const [row] = await database
    .select({ subOrder: commerceSubOrders, order: commerceOrders })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .where(eq(commerceSubOrders.id, input.subOrderId))
    .limit(1);
  if (!row) throw notFound('این زیرسفارش پیدا نشد.');
  if (row.order.buyerAccountId !== actor.accountId) throw notFound('این زیرسفارش پیدا نشد.');
  if (row.subOrder.status !== 'DELIVERED') {
    throw conflict('مرجوعی فقط پس از تحویل کالا قابل ثبت است.');
  }
  if (row.subOrder.deliveredAt === null) throw conflict('زمان تحویل این زیرسفارش ثبت نشده است.');

  const platformWindow = await readInt(database, RETURN_WINDOW_KEY).catch(() => null);
  if (platformWindow === null) {
    throw conflict('مهلت مرجوعی هنوز در تنظیمات ثبت نشده است؛ تا ثبت آن، مرجوعی باز نمی‌شود.');
  }

  const items = await database
    .select()
    .from(commerceOrderItems)
    .where(
      and(
        eq(commerceOrderItems.subOrderId, input.subOrderId),
        inArray(commerceOrderItems.id, input.lines.map((line) => line.orderItemId)),
      ),
    );
  if (items.length !== input.lines.length) throw notFound('یکی از قلم‌های انتخاب‌شده در این زیرسفارش نیست.');

  const prepared: { line: ReturnLineInput; lineRefundToman: bigint }[] = [];
  for (const line of input.lines) {
    const item = items.find((candidate) => candidate.id === line.orderItemId)!;
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw validation('تعداد مرجوعی معتبر نیست.');
    const remaining = item.quantity - item.returnedQuantity;
    if (line.quantity > remaining) {
      throw conflict(
        'از «' + item.productNameFa + '» تنها ' + remaining.toLocaleString('fa-IR') + ' عدد قابل مرجوع است.',
      );
    }
    if (line.reasonFa.trim().length < 5) throw validation('برای هر قلم، دلیل مرجوعی را بنویسید.');

    const rule = (item.returnRuleCode ?? 'STANDARD') as ReturnRule;
    if (rule === 'NOT_RETURNABLE') {
      throw conflict(item.returnRuleReasonFa ?? 'این کالا قابل مرجوع نیست.');
    }
    const deadline = returnDeadline({
      deliveredAt: row.subOrder.deliveredAt,
      platformWindowDays: platformWindow,
      rule,
      categoryWindowDays: null,
    });
    if (!withinReturnWindow(deadline)) {
      throw conflict('مهلت مرجوعی این کالا به پایان رسیده است.');
    }
    // What this many of this line is worth back, from the price actually paid.
    const unit = item.unitPriceToman;
    prepared.push({ line, lineRefundToman: unit * BigInt(line.quantity) });
  }

  const now = new Date();
  return database.transaction(async (tx) => {
    const [created] = await tx
      .insert(orderReturns)
      .values({
        subOrderId: input.subOrderId,
        reference: returnReference(now, randomBytes(6).toString('hex')),
        requestedByAccountId: actor.accountId!,
        reasonFa,
      })
      .returning();

    await tx.insert(orderReturnItems).values(
      prepared.map((entry) => ({
        returnId: created!.id,
        orderItemId: entry.line.orderItemId,
        quantity: entry.line.quantity,
        reasonFa: entry.line.reasonFa.trim(),
        lineRefundToman: entry.lineRefundToman,
      })),
    );

    // The sub-order says a return is open on it, so its money stays held.
    await tx
      .update(commerceSubOrders)
      .set({ status: 'RETURN_REQUESTED', version: row.subOrder.version + 1, updatedAt: now })
      .where(eq(commerceSubOrders.id, input.subOrderId));
    await tx.insert(subOrderEvents).values({
      subOrderId: input.subOrderId,
      fromStatus: 'DELIVERED',
      toStatus: 'RETURN_REQUESTED',
      actorAccountId: actor.accountId,
      reasonFa,
    });

    await recordAudit(tx, actor, {
      action: 'COMMERCE_RETURN_REQUESTED',
      targetType: 'COMMERCE_SUBORDER',
      targetId: input.subOrderId,
      after: {
        returnId: created!.id,
        reference: created!.reference,
        lines: prepared.length,
        askedToman: prepared.reduce((sum, entry) => sum + entry.lineRefundToman, 0n).toString(),
      },
    });
    return created!;
  });
}

export async function loadReturn(database: DbClient, returnId: string): Promise<ReturnRow> {
  const [row] = await database.select().from(orderReturns).where(eq(orderReturns.id, returnId)).limit(1);
  if (!row) throw notFound('این مرجوعی پیدا نشد.');
  return row;
}

type Mover = 'BUYER' | 'SELLER' | 'OPERATOR';

async function moverFor(database: DbClient, actor: Actor, row: ReturnRow): Promise<Mover> {
  const [context] = await database
    .select({ buyerAccountId: commerceOrders.buyerAccountId, sellerId: commerceSubOrders.sellerId })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .where(eq(commerceSubOrders.id, row.subOrderId))
    .limit(1);
  if (!context) throw notFound('این مرجوعی پیدا نشد.');
  if (actor.accountId && context.buyerAccountId === actor.accountId) return 'BUYER';
  if (actor.accountId && (await membershipOf(database, context.sellerId, actor.accountId)) !== null) return 'SELLER';
  if (hasMarketplaceCapability(actor, 'ORDER_VIEW')) return 'OPERATOR';
  throw notFound('این مرجوعی پیدا نشد.');
}

export interface MoveReturnInput {
  readonly returnId: string;
  readonly to: ReturnStatus;
  readonly noteFa?: string | null;
  readonly trackingCode?: string | null;
  readonly condition?: ReturnedCondition | null;
  readonly expectedVersion?: number;
}

/**
 * Move one return along.
 *
 * The state machine decides what may follow what and who may do it; this adds
 * the facts a state machine cannot know. Two of those matter most: receiving
 * goods means saying what condition they arrived in, because that is what the
 * refund figure depends on, and refunding writes the money back through the
 * ledger rather than asserting it happened.
 */
export async function moveReturn(
  database: Database,
  actor: Actor,
  input: MoveReturnInput,
): Promise<ReturnRow> {
  const row = await loadReturn(database, input.returnId);
  const mover = await moverFor(database, actor, row);
  const from = row.status as ReturnStatus;
  if (!returnTransitionAllowed(from, input.to, mover)) {
    throw conflict('این تغییر برای شما در وضعیت فعلی این مرجوعی ممکن نیست.', {
      allowed: returnMovesFor(from, mover),
    });
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== row.version) {
    throw conflict('این مرجوعی در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');
  }

  const noteFa = (input.noteFa ?? '').trim();
  if ((input.to === 'REJECTED' || input.to === 'DISPUTED') && noteFa.length < 5) {
    throw validation('دلیل این تصمیم را بنویسید؛ طرف مقابل همین متن را می‌خواند.');
  }
  if (input.to === 'SHIPPED_BACK' && (input.trackingCode ?? '').trim().length < 3) {
    throw validation('کد رهگیری مرسوله بازگشتی را وارد کنید.');
  }
  if (input.to === 'RECEIVED' && !input.condition) {
    throw validation('وضعیت کالای دریافت‌شده را انتخاب کنید؛ مبلغ بازپرداخت به همین بستگی دارد.');
  }

  const now = new Date();
  const moved = await database.transaction(async (tx) => {
    const patch: Record<string, unknown> = {
      status: input.to,
      version: row.version + 1,
      updatedAt: now,
    };
    if (input.to === 'APPROVED' || input.to === 'REJECTED') {
      patch.decidedByAccountId = actor.accountId;
      patch.decidedAt = now;
      patch.decisionNoteFa = noteFa || null;
    }
    if (input.to === 'SHIPPED_BACK') {
      patch.returnTrackingCode = (input.trackingCode ?? '').trim();
      patch.shippedBackAt = now;
    }
    if (input.to === 'RECEIVED') {
      patch.receivedAt = now;
      patch.receivedCondition = input.condition;
      patch.receivedNoteFa = noteFa || null;
      patch.refundAmountToman = await refundDueFor(tx, row.id, input.condition!);
    }
    if (input.to === 'DISPUTED') {
      patch.disputed = true;
      patch.decisionNoteFa = noteFa || row.decisionNoteFa;
    }

    const [updated] = await tx
      .update(orderReturns)
      .set(patch)
      .where(and(eq(orderReturns.id, row.id), eq(orderReturns.version, row.version)))
      .returning();
    if (!updated) throw conflict('این مرجوعی در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    if (input.to === 'REFUNDED') await settleRefund(tx, actor, updated);
    if (input.to === 'REJECTED') await closeSubOrderBack(tx, actor, updated, 'مرجوعی پذیرفته نشد: ' + noteFa);
    if (input.to === 'RECEIVED') await returnGoodsToStock(tx, actor, updated);

    await recordAudit(tx, actor, {
      action: 'COMMERCE_RETURN_MOVED',
      targetType: 'COMMERCE_SUBORDER',
      targetId: row.subOrderId,
      targetVersion: row.version + 1,
      before: { status: from },
      after: {
        status: input.to,
        returnId: row.id,
        mover,
        condition: input.condition ?? undefined,
        refundToman: (patch.refundAmountToman as bigint | undefined)?.toString(),
        noteFa: noteFa || undefined,
      },
    });
    return updated;
  });

  await announce(database, moved, mover);
  return moved;
}

/** What comes back, line by line, from what actually arrived. */
async function refundDueFor(
  tx: DbClient,
  returnId: string,
  condition: ReturnedCondition,
): Promise<bigint> {
  const lines = await tx
    .select({
      lineRefundToman: orderReturnItems.lineRefundToman,
      ruleCode: commerceOrderItems.returnRuleCode,
    })
    .from(orderReturnItems)
    .innerJoin(commerceOrderItems, eq(commerceOrderItems.id, orderReturnItems.orderItemId))
    .where(eq(orderReturnItems.returnId, returnId));

  return lines.reduce((sum, line) => {
    const { toman } = refundForCondition({
      lineRefundToman: line.lineRefundToman,
      condition,
      rule: (line.ruleCode ?? 'STANDARD') as ReturnRule,
    });
    return sum + toman;
  }, 0n);
}

/** Received goods go back on the shelf, counted through the inventory ledger. */
async function returnGoodsToStock(tx: DbClient, actor: Actor, row: ReturnRow): Promise<void> {
  const { applyMove } = await import('./inventory.ts');
  const lines = await tx
    .select({
      orderItemId: orderReturnItems.orderItemId,
      quantity: orderReturnItems.quantity,
      skuId: commerceOrderItems.offerSkuId,
      returned: commerceOrderItems.returnedQuantity,
    })
    .from(orderReturnItems)
    .innerJoin(commerceOrderItems, eq(commerceOrderItems.id, orderReturnItems.orderItemId))
    .where(eq(orderReturnItems.returnId, row.id));

  for (const line of lines) {
    // Goods that never arrived are not goods to put back.
    if (row.receivedCondition === 'MISSING') continue;
    await applyMove(tx, actor, {
      skuId: line.skuId,
      kind: 'RETURN',
      quantity: line.quantity,
      reasonFa: 'مرجوعی ' + row.reference,
      refType: 'ORDER_RETURN',
      refId: row.id,
    });
    await tx
      .update(commerceOrderItems)
      .set({ returnedQuantity: line.returned + line.quantity })
      .where(eq(commerceOrderItems.id, line.orderItemId));
  }
}

/**
 * Pay the refund, through the ledger and through the refund record.
 *
 * Two things happen and both are records rather than assertions: the shop's
 * balances are charged, and a refund row is opened for the money actually to
 * be sent back with its own retrying and its own operator queue.
 */
async function settleRefund(tx: DbClient, actor: Actor, row: ReturnRow): Promise<void> {
  const amount = row.refundAmountToman ?? 0n;
  const [context] = await tx
    .select({
      sellerId: commerceSubOrders.sellerId,
      subOrderVersion: commerceSubOrders.version,
      subOrderStatus: commerceSubOrders.status,
      buyerAccountId: commerceOrders.buyerAccountId,
      paymentBatchId: commerceOrders.paymentBatchId,
    })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .where(eq(commerceSubOrders.id, row.subOrderId))
    .limit(1);
  if (!context) return;

  if (amount > 0n && context.paymentBatchId !== null) {
    await chargeRefund(tx, {
      sellerId: context.sellerId,
      subOrderId: row.subOrderId,
      returnId: row.id,
      referenceFa: row.reference,
      refundToman: amount,
    });
    const [existing] = await tx
      .select({ id: orderReturns.refundId })
      .from(orderReturns)
      .where(eq(orderReturns.id, row.id))
      .limit(1);
    if (!existing?.id) {
      const refundId = await openRefund(tx, {
        inquiryId: null,
        subOrderId: row.subOrderId,
        cancellationId: null,
        paymentBatchId: context.paymentBatchId,
        recipientAccountId: context.buyerAccountId,
        amountToman: amount,
      });
      await tx.update(orderReturns).set({ refundId }).where(eq(orderReturns.id, row.id));
    }
  }

  // A fully returned sub-order is returned; a partly returned one goes back to
  // being delivered, because the rest of it was and still is.
  const fully = await wholeSubOrderReturned(tx, row.subOrderId);
  const next = fully ? 'RETURNED' : 'DELIVERED';
  await tx
    .update(commerceSubOrders)
    .set({ status: next, version: context.subOrderVersion + 1, updatedAt: new Date() })
    .where(eq(commerceSubOrders.id, row.subOrderId));
  await tx.insert(subOrderEvents).values({
    subOrderId: row.subOrderId,
    fromStatus: context.subOrderStatus,
    toStatus: next,
    actorAccountId: actor.accountId ?? null,
    reasonFa: 'بازپرداخت مرجوعی ' + row.reference,
  });
}

async function wholeSubOrderReturned(tx: DbClient, subOrderId: string): Promise<boolean> {
  const items = await tx
    .select({ quantity: commerceOrderItems.quantity, returned: commerceOrderItems.returnedQuantity })
    .from(commerceOrderItems)
    .where(eq(commerceOrderItems.subOrderId, subOrderId));
  return items.length > 0 && items.every((item) => item.returned >= item.quantity);
}

/** A refused return leaves the sub-order where it was: delivered. */
async function closeSubOrderBack(tx: DbClient, actor: Actor, row: ReturnRow, reasonFa: string): Promise<void> {
  const [current] = await tx
    .select({ version: commerceSubOrders.version, status: commerceSubOrders.status })
    .from(commerceSubOrders)
    .where(eq(commerceSubOrders.id, row.subOrderId))
    .limit(1);
  if (!current || current.status !== 'RETURN_REQUESTED') return;
  await tx
    .update(commerceSubOrders)
    .set({ status: 'DELIVERED', version: current.version + 1, updatedAt: new Date() })
    .where(eq(commerceSubOrders.id, row.subOrderId));
  await tx.insert(subOrderEvents).values({
    subOrderId: row.subOrderId,
    fromStatus: 'RETURN_REQUESTED',
    toStatus: 'DELIVERED',
    actorAccountId: actor.accountId ?? null,
    reasonFa,
  });
}

async function announce(database: Database, row: ReturnRow, mover: Mover): Promise<void> {
  const [context] = await database
    .select({ buyerAccountId: commerceOrders.buyerAccountId, sellerId: commerceSubOrders.sellerId })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .where(eq(commerceSubOrders.id, row.subOrderId))
    .limit(1);
  if (!context) return;

  if (mover !== 'BUYER') {
    await createNotification(database, {
      recipientAccountId: context.buyerAccountId,
      kind: 'COMMERCE_RETURN_MOVED',
      titleFa: 'وضعیت مرجوعی شما تغییر کرد',
      bodyFa: 'مرجوعی ' + row.reference + ' به‌روزرسانی شد.',
      resume: {
        entity: { type: 'COMMERCE_SUBORDER', id: row.subOrderId },
        step: 'RETURN',
        originRoute: '/account/orders',
      },
    });
  }
  if (mover !== 'SELLER') {
    const { sellerMembers } = await import('../db/schema/commerce.ts');
    const members = await database
      .select({ accountId: sellerMembers.accountId })
      .from(sellerMembers)
      .where(and(eq(sellerMembers.sellerId, context.sellerId), eq(sellerMembers.status, 'ACTIVE')));
    for (const member of members) {
      await createNotification(database, {
        recipientAccountId: member.accountId,
        kind: 'COMMERCE_RETURN_MOVED',
        titleFa: 'وضعیت یک مرجوعی تغییر کرد',
        bodyFa: 'مرجوعی ' + row.reference + ' به‌روزرسانی شد.',
        resume: {
          entity: { type: 'COMMERCE_SUBORDER', id: row.subOrderId },
          step: 'RETURN',
          originRoute: '/account/seller/returns',
        },
      });
    }
  }
}

/** What the buyer or the shop showed. Files are private and record-scoped. */
export async function addReturnEvidence(
  database: Database,
  root: string,
  actor: Actor,
  input: { returnId: string; noteFa: string | null; bytes: Uint8Array; originalName: string },
): Promise<void> {
  const row = await loadReturn(database, input.returnId);
  await moverFor(database, actor, row);
  const stored = await putPrivateFile(database, root, actor, {
    purpose: 'RETURN_EVIDENCE',
    ownerAccountId: actor.accountId!,
    bytes: input.bytes,
    originalName: safeOriginalName(input.originalName),
  });
  await database.insert(returnEvidence).values({
    returnId: row.id,
    addedByAccountId: actor.accountId!,
    fileId: stored.id,
    noteFa: (input.noteFa ?? '').trim() || null,
  });
}

export interface ReturnView {
  readonly row: ReturnRow;
  readonly items: readonly (ReturnItemRow & { productNameFa: string })[];
  readonly evidence: readonly { id: string; fileId: string | null; noteFa: string | null; createdAt: Date }[];
  readonly moves: readonly ReturnStatus[];
  readonly subOrderReference: string;
  readonly sellerNameFa: string;
}

async function viewOf(database: Database, actor: Actor, row: ReturnRow): Promise<ReturnView> {
  const mover = await moverFor(database, actor, row);
  const [context] = await database
    .select({ reference: commerceSubOrders.reference, sellerNameFa: commerceSellers.displayNameFa })
    .from(commerceSubOrders)
    .innerJoin(commerceSellers, eq(commerceSellers.id, commerceSubOrders.sellerId))
    .where(eq(commerceSubOrders.id, row.subOrderId))
    .limit(1);
  const items = await database
    .select({
      item: orderReturnItems,
      productNameFa: commerceOrderItems.productNameFa,
    })
    .from(orderReturnItems)
    .innerJoin(commerceOrderItems, eq(commerceOrderItems.id, orderReturnItems.orderItemId))
    .where(eq(orderReturnItems.returnId, row.id));
  const evidence = await database
    .select({
      id: returnEvidence.id,
      fileId: returnEvidence.fileId,
      noteFa: returnEvidence.noteFa,
      createdAt: returnEvidence.createdAt,
    })
    .from(returnEvidence)
    .where(eq(returnEvidence.returnId, row.id))
    .orderBy(asc(returnEvidence.createdAt));

  return {
    row,
    items: items.map((entry) => ({ ...entry.item, productNameFa: entry.productNameFa })),
    evidence,
    moves: returnMovesFor(row.status as ReturnStatus, mover),
    subOrderReference: context?.reference ?? '',
    sellerNameFa: context?.sellerNameFa ?? 'فروشگاه',
  };
}

export async function returnDetail(database: Database, actor: Actor, returnId: string): Promise<ReturnView> {
  return viewOf(database, actor, await loadReturn(database, returnId));
}

/** The returns one shop has to answer. */
export async function sellerReturns(
  database: Database,
  actor: Actor,
  sellerId: string,
): Promise<readonly ReturnView[]> {
  await assertSellerCapability(database, actor, sellerId, 'STORE_OPERATE');
  const rows = await database
    .select({ row: orderReturns })
    .from(orderReturns)
    .innerJoin(commerceSubOrders, eq(commerceSubOrders.id, orderReturns.subOrderId))
    .where(eq(commerceSubOrders.sellerId, sellerId))
    .orderBy(desc(orderReturns.createdAt))
    .limit(50);
  return Promise.all(rows.map((entry) => viewOf(database, actor, entry.row)));
}

/** The buyer's own returns. */
export async function myReturns(database: Database, actor: Actor): Promise<readonly ReturnView[]> {
  if (!actor.accountId) throw forbidden('برای دیدن مرجوعی‌ها باید وارد حساب شوید.');
  const rows = await database
    .select()
    .from(orderReturns)
    .where(eq(orderReturns.requestedByAccountId, actor.accountId))
    .orderBy(desc(orderReturns.createdAt))
    .limit(50);
  return Promise.all(rows.map((row) => viewOf(database, actor, row)));
}

/** Arguments an operator has to settle, where money is being held meanwhile. */
export async function disputedReturns(database: Database, actor: Actor): Promise<readonly ReturnView[]> {
  assertMarketplaceCapability(actor, 'ORDER_VIEW');
  const rows = await database
    .select()
    .from(orderReturns)
    .where(eq(orderReturns.status, 'DISPUTED'))
    .orderBy(asc(orderReturns.createdAt))
    .limit(50);
  return Promise.all(rows.map((row) => viewOf(database, actor, row)));
}
