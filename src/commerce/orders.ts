/**
 * Paying for an order, and what each shop does with its part — PROMPT-010.
 *
 * The payment is one batch for the whole basket. Its amount is read on the
 * server from the order row, never from anything the browser sends, and the
 * only thing that turns a hold into a sale is `verifyAttempt` succeeding: a
 * browser coming back from a gateway proves nothing at all.
 *
 * Because that verification applies its effect inside the transaction that
 * moves the attempt out of PENDING, a replayed callback, a second tab and a
 * provider retry all reach the same place and find the work done. Nothing here
 * has to detect a duplicate, which is why nothing here can fail to.
 *
 * After payment the sub-orders go their own ways. One shop refusing, running
 * out of time or being argued with does not touch the others: it cancels and
 * refunds its own part, and the rest of the order carries on.
 */
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import {
  commerceOrderItems,
  commerceOrders,
  commerceSubOrders,
  subOrderEvents,
} from '../db/schema/orders.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { offerSkus, sellerOffers } from '../db/schema/catalog.ts';
import { depositRefunds } from '../db/schema/deals.ts';
import { paymentBatches } from '../db/schema/billing.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt } from '../settings/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { assertFlagEnabled } from '../marketplace/flags.ts';
import { assertMarketplaceCapability, hasMarketplaceCapability } from '../marketplace/model.ts';
import { openRefund } from '../marketplace/refunds.ts';
import type { Actor } from '../authz/actor.ts';
import { createBatch, type BatchRecord, type PaidEffects } from '../billing/payments.ts';
import { applyMove, consumeReservation } from './inventory.ts';
import { assertSellerCapability, membershipOf } from './sellers.ts';
import {
  acceptanceDeadline,
  acceptanceOverdue,
  fulfillmentContactOf,
  parentStatusFrom,
  subOrderTransitionAllowed,
  subOrderMovesFor,
  SUB_ORDER_STATUS_FA,
  type FulfillmentContact,
  type OrderMover,
  type SubOrderStatus,
} from './order-model.ts';
import type { OrderItemRow, OrderRow, SubOrderRow } from './cart.ts';

export const ACCEPTANCE_WINDOW_KEY = 'market.shop.suborder_acceptance_window_hours';

export async function loadOrder(database: DbClient, orderId: string): Promise<OrderRow> {
  const [row] = await database.select().from(commerceOrders).where(eq(commerceOrders.id, orderId)).limit(1);
  if (!row) throw notFound('این سفارش پیدا نشد.');
  return row;
}

export async function loadSubOrder(database: DbClient, subOrderId: string): Promise<SubOrderRow> {
  const [row] = await database.select().from(commerceSubOrders).where(eq(commerceSubOrders.id, subOrderId)).limit(1);
  if (!row) throw notFound('این زیرسفارش پیدا نشد.');
  return row;
}

// ── paying ─────────────────────────────────────────────────────────────────

/**
 * Open the one payment that covers the whole order.
 *
 * The amount is not passed in. `createBatch` reads it from the order row,
 * exactly as the animal deposit is read from its deal, so a browser that
 * rewrites a hidden field changes nothing about what is charged.
 */
export async function startOrderPayment(
  database: Database,
  actor: Actor,
  orderId: string,
): Promise<BatchRecord> {
  await assertFlagEnabled(database, 'market.flag.commerce_checkout_enabled');
  const order = await loadOrder(database, orderId);
  if (order.buyerAccountId !== actor.accountId) throw forbidden('این سفارش متعلق به شما نیست.');
  if (order.status === 'PAID') throw conflict('این سفارش پرداخت شده است.');
  if (order.status !== 'PENDING_PAYMENT') throw conflict('این سفارش دیگر قابل پرداخت نیست.');
  if (order.holdsExpireAt.getTime() <= Date.now()) {
    throw conflict('مهلت نگه‌داشتن کالاهای این سفارش تمام شده است؛ سبد را دوباره ببندید.');
  }

  // A batch already opened for this order is reused rather than duplicated, so
  // a buyer who pressed pay twice has one payment to finish, not two.
  if (order.paymentBatchId) {
    const [existing] = await database
      .select({ status: paymentBatches.status })
      .from(paymentBatches)
      .where(eq(paymentBatches.id, order.paymentBatchId))
      .limit(1);
    if (existing && existing.status !== 'CANCELLED') {
      const { findBatch } = await import('../billing/payments.ts');
      const batch = await findBatch(database, order.paymentBatchId);
      if (batch) return batch;
    }
  }

  const batch = await createBatch(database, actor, {
    service: 'COMMERCE_ORDER',
    items: [{ targetType: 'COMMERCE_ORDER', targetId: order.id, orderId: order.id }],
    resume: {
      entity: { type: 'COMMERCE_ORDER', id: order.id },
      step: 'PAYMENT',
      originRoute: '/account/orders/' + order.id,
    },
  });

  await database
    .update(commerceOrders)
    .set({ paymentBatchId: batch.id, version: order.version + 1, updatedAt: new Date() })
    .where(and(eq(commerceOrders.id, order.id), eq(commerceOrders.version, order.version)));
  return batch;
}

/**
 * What a verified payment does to an order, applied inside the verifying
 * transaction and therefore exactly once.
 *
 * Every hold becomes a sale here. `consumeReservation` closes the hold and
 * writes the SELL movement in the same statement-run as the status change, so
 * there is no moment where an order is paid but the goods are still merely
 * reserved, and no way for a second callback to sell the same units twice —
 * the second one never reaches this function.
 */
export function orderPaidEffects(): PaidEffects {
  return {
    async onPaid(tx: DbClient, batch: BatchRecord): Promise<void> {
      if (batch.service !== 'COMMERCE_ORDER') return;
      const [order] = await tx
        .select()
        .from(commerceOrders)
        .where(eq(commerceOrders.paymentBatchId, batch.id))
        .limit(1);
      if (!order) return;
      if (order.status === 'PAID') return;

      const windowHours = await readInt(tx, ACCEPTANCE_WINDOW_KEY).catch(() => null);
      const paidAt = new Date();
      const dueAt = windowHours === null ? null : acceptanceDeadline(paidAt, windowHours);

      const items = await tx
        .select({
          id: commerceOrderItems.id,
          reservationId: commerceOrderItems.reservationId,
          subOrderId: commerceOrderItems.subOrderId,
        })
        .from(commerceOrderItems)
        .innerJoin(commerceSubOrders, eq(commerceSubOrders.id, commerceOrderItems.subOrderId))
        .where(eq(commerceSubOrders.orderId, order.id));

      for (const item of items) {
        if (item.reservationId === null) throw conflict('این سفارش رزرو معتبری ندارد.');
        await consumeReservation(tx, item.reservationId, 'COMMERCE_ORDER', order.id);
      }

      await tx
        .update(commerceOrders)
        .set({ status: 'PAID', paidAt, version: order.version + 1, updatedAt: paidAt })
        .where(eq(commerceOrders.id, order.id));

      const subOrders = await tx
        .select()
        .from(commerceSubOrders)
        .where(eq(commerceSubOrders.orderId, order.id));

      for (const subOrder of subOrders) {
        await tx
          .update(commerceSubOrders)
          .set({
            status: 'PAID',
            acceptanceDueAt: dueAt,
            version: subOrder.version + 1,
            updatedAt: paidAt,
          })
          .where(eq(commerceSubOrders.id, subOrder.id));
        await tx.insert(subOrderEvents).values({
          subOrderId: subOrder.id,
          fromStatus: 'PENDING_PAYMENT',
          toStatus: 'PAID',
          actorAccountId: null,
          reasonFa: 'تأیید پرداخت روی سرور',
        });
        await notifySellerTeam(tx, subOrder.sellerId, {
          kind: 'COMMERCE_SUBORDER_PAID',
          titleFa: 'سفارش تازه‌ای برای فروشگاه شما ثبت شد',
          bodyFa:
            'زیرسفارش ' +
            subOrder.reference +
            (dueAt === null
              ? ' در انتظار پذیرش شماست.'
              : ' تا ' + dueAt.toLocaleDateString('fa-IR') + ' باید پذیرفته شود.'),
          subOrderId: subOrder.id,
        });
      }

      await createNotification(tx, {
        recipientAccountId: order.buyerAccountId,
        kind: 'COMMERCE_ORDER_PAID',
        titleFa: 'پرداخت سفارش شما تأیید شد',
        bodyFa: 'سفارش ' + order.reference + ' پرداخت شد و برای فروشندگان ارسال شد.',
        resume: {
          entity: { type: 'COMMERCE_ORDER', id: order.id },
          step: 'PAID',
          originRoute: '/account/orders/' + order.id,
        },
      });

      await recordAudit(tx, null, {
        action: 'COMMERCE_ORDER_PAID',
        targetType: 'COMMERCE_ORDER',
        targetId: order.id,
        before: { status: order.status },
        after: {
          status: 'PAID',
          subOrders: subOrders.length,
          grandTotalToman: order.grandTotalToman.toString(),
          acceptanceDueAt: dueAt?.toISOString() ?? null,
        },
      });
    },
  };
}

/** Everyone who works in a shop hears about that shop's own sub-order, and nothing else. */
async function notifySellerTeam(
  tx: DbClient,
  sellerId: string,
  input: { kind: string; titleFa: string; bodyFa: string; subOrderId: string },
): Promise<void> {
  const { sellerMembers } = await import('../db/schema/commerce.ts');
  const members = await tx
    .select({ accountId: sellerMembers.accountId })
    .from(sellerMembers)
    .where(and(eq(sellerMembers.sellerId, sellerId), eq(sellerMembers.status, 'ACTIVE')));
  for (const member of members) {
    await createNotification(tx, {
      recipientAccountId: member.accountId,
      kind: input.kind,
      titleFa: input.titleFa,
      bodyFa: input.bodyFa,
      resume: {
        entity: { type: 'COMMERCE_SUBORDER', id: input.subOrderId },
        step: 'FULFILMENT',
        originRoute: '/account/seller/orders',
      },
    });
  }
}

// ── the sub-order's life ───────────────────────────────────────────────────

/** What this actor is, as far as this sub-order is concerned. */
async function moverFor(
  database: DbClient,
  actor: Actor,
  subOrder: SubOrderRow,
  order: OrderRow,
): Promise<OrderMover> {
  if (actor.accountId && order.buyerAccountId === actor.accountId) return 'BUYER';
  if (actor.accountId && (await membershipOf(database, subOrder.sellerId, actor.accountId)) !== null) {
    return 'SELLER';
  }
  if (hasMarketplaceCapability(actor, 'ORDER_VIEW')) return 'OPERATOR';
  // Not "forbidden to move it": not able to see it at all.
  throw notFound('این زیرسفارش پیدا نشد.');
}

export interface MoveInput {
  readonly subOrderId: string;
  readonly to: SubOrderStatus;
  readonly reasonFa?: string | null;
  readonly trackingCode?: string | null;
  readonly expectedVersion?: number;
}

/**
 * Move one sub-order, and only that one.
 *
 * The state machine decides what may follow what and who may do it; this adds
 * the two things a state machine cannot know — that the version has not moved
 * under the actor, and that a refusal or a cancellation has to say why. What
 * it deliberately does not do is touch the parent order or any sibling: a
 * shop's decision is about that shop.
 */
export async function moveSubOrder(
  database: Database,
  actor: Actor,
  input: MoveInput,
): Promise<SubOrderRow> {
  const subOrder = await loadSubOrder(database, input.subOrderId);
  const order = await loadOrder(database, subOrder.orderId);
  const mover = await moverFor(database, actor, subOrder, order);

  const from = subOrder.status as SubOrderStatus;
  if (!subOrderTransitionAllowed(from, input.to, mover)) {
    throw conflict(
      'از وضعیت «' + SUB_ORDER_STATUS_FA[from] + '» این تغییر برای شما ممکن نیست.',
      { allowed: subOrderMovesFor(from, mover) },
    );
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== subOrder.version) {
    throw conflict('این زیرسفارش در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');
  }

  const reason = (input.reasonFa ?? '').trim();
  const needsReason = input.to === 'CANCELLED' || input.to === 'RETURN_REQUESTED' || input.to === 'DISPUTED';
  if (needsReason && reason.length < 5) throw validation('دلیل این تغییر را بنویسید.');
  if (input.to === 'SHIPPED' && (input.trackingCode ?? '').trim().length < 3) {
    throw validation('کد رهگیری مرسوله را وارد کنید.');
  }

  const now = new Date();
  const patch: Record<string, unknown> = {
    status: input.to,
    statusReasonFa: reason || subOrder.statusReasonFa,
    version: subOrder.version + 1,
    updatedAt: now,
  };
  if (input.to === 'ACCEPTED_BY_SELLER') patch.acceptedAt = now;
  if (input.to === 'SHIPPED') {
    patch.shippedAt = now;
    patch.trackingCode = (input.trackingCode ?? '').trim();
  }
  if (input.to === 'DELIVERED') patch.deliveredAt = now;

  const moved = await database.transaction(async (tx) => {
    const [row] = await tx
      .update(commerceSubOrders)
      .set(patch)
      .where(and(eq(commerceSubOrders.id, subOrder.id), eq(commerceSubOrders.version, subOrder.version)))
      .returning();
    if (!row) throw conflict('این زیرسفارش در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await tx.insert(subOrderEvents).values({
      subOrderId: subOrder.id,
      fromStatus: from,
      toStatus: input.to,
      actorAccountId: actor.accountId ?? null,
      reasonFa: reason || null,
    });

    // Goods coming back go back on the shelf, through the ledger like
    // everything else, so the count and its reason stay readable.
    if (input.to === 'RETURNED') await returnItemsToStock(tx, actor, subOrder, 'مرجوعی زیرسفارش ' + subOrder.reference);
    if (input.to === 'CANCELLED' && from !== 'PENDING_PAYMENT') {
      await returnItemsToStock(tx, actor, subOrder, 'لغو زیرسفارش ' + subOrder.reference);
    }

    // Money owed is recorded the moment it is owed, and paid separately, so a
    // provider failing later is visible as a debt rather than as nothing.
    if ((input.to === 'RETURNED' || input.to === 'CANCELLED') && order.status === 'PAID') {
      await openSubOrderRefund(tx, order, row);
    }

    await refreshParentStatus(tx, order.id);
    await recordAudit(tx, actor, {
      action: 'COMMERCE_SUBORDER_MOVED',
      targetType: 'COMMERCE_SUBORDER',
      targetId: subOrder.id,
      targetVersion: subOrder.version + 1,
      before: { status: from },
      after: { status: input.to, reasonFa: reason || null, mover },
    });
    return row;
  });

  await announceMove(database, order, moved, mover);
  return moved;
}

/** Put a sub-order's goods back, one ledger row per line. */
async function returnItemsToStock(
  tx: DbClient,
  actor: Actor | null,
  subOrder: SubOrderRow,
  reasonFa: string,
): Promise<void> {
  const items = await tx
    .select({ id: commerceOrderItems.id, skuId: commerceOrderItems.offerSkuId, quantity: commerceOrderItems.quantity })
    .from(commerceOrderItems)
    .where(eq(commerceOrderItems.subOrderId, subOrder.id));
  for (const item of items) {
    await applyMove(tx, actor, {
      skuId: item.skuId,
      kind: 'RETURN',
      quantity: item.quantity,
      reasonFa,
      refType: 'COMMERCE_SUBORDER',
      refId: subOrder.id,
    });
    await tx
      .update(commerceOrderItems)
      .set({ returnedQuantity: item.quantity })
      .where(eq(commerceOrderItems.id, item.id));
  }
}

/**
 * Record that this shop's part of the money is owed back.
 *
 * The amount is the whole of that sub-order, delivery included, because the
 * buyer is not receiving a delivery either. It uses the same refund record the
 * animal deposit does, so the retrying, the ceiling on automatic attempts and
 * the manual entry with a bank reference are the ones already built and tested.
 */
async function openSubOrderRefund(tx: DbClient, order: OrderRow, subOrder: SubOrderRow): Promise<void> {
  if (order.paymentBatchId === null) return;
  const [existing] = await tx
    .select({ id: depositRefunds.id })
    .from(depositRefunds)
    .where(eq(depositRefunds.subOrderId, subOrder.id))
    .limit(1);
  if (existing) return;
  await openRefund(tx, {
    inquiryId: null,
    subOrderId: subOrder.id,
    cancellationId: null,
    paymentBatchId: order.paymentBatchId,
    recipientAccountId: order.buyerAccountId,
    amountToman: subOrder.buyerTotalToman,
  });
}

/**
 * Say what the parent order is, from what its parts say.
 *
 * It is a reading rather than a decision: the only sentence still true about a
 * whole order once its shops disagree is whether every one of them ended with
 * the money going back.
 */
async function refreshParentStatus(tx: DbClient, orderId: string): Promise<void> {
  const [order] = await tx.select().from(commerceOrders).where(eq(commerceOrders.id, orderId)).limit(1);
  if (!order || order.status === 'CANCELLED') return;
  const parts = await tx
    .select({ status: commerceSubOrders.status })
    .from(commerceSubOrders)
    .where(eq(commerceSubOrders.orderId, orderId));
  const next = parentStatusFrom(order.paidAt !== null, parts.map((part) => part.status as SubOrderStatus));
  if (next === order.status) return;
  await tx
    .update(commerceOrders)
    .set({ status: next, version: order.version + 1, updatedAt: new Date() })
    .where(eq(commerceOrders.id, orderId));
}

/** Tell whoever did not do it. */
async function announceMove(
  database: Database,
  order: OrderRow,
  subOrder: SubOrderRow,
  mover: OrderMover,
): Promise<void> {
  const label = SUB_ORDER_STATUS_FA[subOrder.status as SubOrderStatus];
  if (mover !== 'BUYER') {
    await createNotification(database, {
      recipientAccountId: order.buyerAccountId,
      kind: 'COMMERCE_SUBORDER_MOVED',
      titleFa: 'وضعیت بخشی از سفارش شما تغییر کرد',
      bodyFa: 'زیرسفارش ' + subOrder.reference + ' اکنون «' + label + '» است.',
      resume: {
        entity: { type: 'COMMERCE_ORDER', id: order.id },
        step: 'TRACK',
        originRoute: '/account/orders/' + order.id,
      },
    });
  }
  if (mover !== 'SELLER') {
    await notifySellerTeam(database, subOrder.sellerId, {
      kind: 'COMMERCE_SUBORDER_MOVED',
      titleFa: 'وضعیت یک زیرسفارش تغییر کرد',
      bodyFa: 'زیرسفارش ' + subOrder.reference + ' اکنون «' + label + '» است.',
      subOrderId: subOrder.id,
    });
  }
}

/**
 * Cancel the sub-orders no shop answered in time — and only those.
 *
 * Silence past the deadline is a refusal, so the goods go back on the shelf
 * and the money is recorded as owed. The rest of the same order is untouched,
 * which is the whole reason a sub-order exists as its own record.
 *
 * A missing acceptance window means no deadline was ever set, and nothing is
 * cancelled: an unconfigured figure must not become an automatic refusal.
 */
export async function expireUnacceptedSubOrders(
  database: Database,
  now: Date = new Date(),
): Promise<number> {
  const due = await database
    .select({ subOrder: commerceSubOrders, order: commerceOrders })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .where(
      and(
        eq(commerceSubOrders.status, 'PAID'),
        isNotNull(commerceSubOrders.acceptanceDueAt),
        sql`${commerceSubOrders.acceptanceDueAt} <= ${now}`,
      ),
    )
    .limit(200);

  let cancelled = 0;
  for (const row of due) {
    if (!acceptanceOverdue(row.subOrder.acceptanceDueAt, now)) continue;
    const done = await database.transaction(async (tx) => {
      const [moved] = await tx
        .update(commerceSubOrders)
        .set({
          status: 'CANCELLED',
          statusReasonFa: 'فروشنده در مهلت مقرر این زیرسفارش را نپذیرفت.',
          version: row.subOrder.version + 1,
          updatedAt: now,
        })
        .where(and(eq(commerceSubOrders.id, row.subOrder.id), eq(commerceSubOrders.status, 'PAID')))
        .returning();
      if (!moved) return false;

      await tx.insert(subOrderEvents).values({
        subOrderId: moved.id,
        fromStatus: 'PAID',
        toStatus: 'CANCELLED',
        actorAccountId: null,
        reasonFa: 'پایان مهلت پذیرش',
      });
      await returnItemsToStock(tx, null, moved, 'لغو خودکار زیرسفارش ' + moved.reference);
      await openSubOrderRefund(tx, row.order, moved);
      await refreshParentStatus(tx, row.order.id);
      await recordAudit(tx, null, {
        action: 'COMMERCE_SUBORDER_ACCEPTANCE_EXPIRED',
        targetType: 'COMMERCE_SUBORDER',
        targetId: moved.id,
        after: {
          dueAt: row.subOrder.acceptanceDueAt?.toISOString() ?? null,
          refundToman: moved.buyerTotalToman.toString(),
        },
      });
      return true;
    });
    if (done) cancelled += 1;
  }
  return cancelled;
}

// ── reading ────────────────────────────────────────────────────────────────

export interface SubOrderView {
  readonly subOrder: SubOrderRow;
  readonly items: readonly OrderItemRow[];
  readonly sellerNameFa: string;
  readonly moves: readonly SubOrderStatus[];
}

export interface OrderView {
  readonly order: OrderRow;
  readonly parts: readonly SubOrderView[];
  readonly refundedToman: bigint;
}

/**
 * One order as its buyer sees it: everything in it, from every shop.
 *
 * An operator with `ORDER_VIEW` reads the same thing. A seller does not reach
 * this at all — they have their own view, which is one sub-order wide.
 */
export async function orderForBuyer(database: Database, actor: Actor, orderId: string): Promise<OrderView> {
  const order = await loadOrder(database, orderId);
  const mine = actor.accountId !== null && order.buyerAccountId === actor.accountId;
  if (!mine && !hasMarketplaceCapability(actor, 'ORDER_VIEW')) throw notFound('این سفارش پیدا نشد.');
  const mover: OrderMover = mine ? 'BUYER' : 'OPERATOR';

  const subOrders = await database
    .select({ subOrder: commerceSubOrders, sellerNameFa: commerceSellers.displayNameFa })
    .from(commerceSubOrders)
    .innerJoin(commerceSellers, eq(commerceSellers.id, commerceSubOrders.sellerId))
    .where(eq(commerceSubOrders.orderId, order.id))
    .orderBy(commerceSubOrders.reference);

  const items = subOrders.length
    ? await database
        .select()
        .from(commerceOrderItems)
        .where(inArray(commerceOrderItems.subOrderId, subOrders.map((row) => row.subOrder.id)))
    : [];

  const refunded = await database
    .select({ amountToman: depositRefunds.amountToman, status: depositRefunds.status })
    .from(depositRefunds)
    .innerJoin(commerceSubOrders, eq(commerceSubOrders.id, depositRefunds.subOrderId))
    .where(eq(commerceSubOrders.orderId, order.id));

  return {
    order,
    parts: subOrders.map((row) => ({
      subOrder: row.subOrder,
      sellerNameFa: row.sellerNameFa ?? 'فروشگاه',
      items: items.filter((item) => item.subOrderId === row.subOrder.id),
      moves: subOrderMovesFor(row.subOrder.status as SubOrderStatus, mover),
    })),
    refundedToman: refunded
      .filter((row) => row.status === 'PAID')
      .reduce((sum, row) => sum + row.amountToman, 0n),
  };
}

export interface SellerOrderView extends SubOrderView {
  readonly orderReference: string;
  readonly placedAt: Date;
  /** Only what is needed to deliver a parcel. Nothing about the rest of the basket. */
  readonly contact: FulfillmentContact;
}

/**
 * One shop's queue.
 *
 * A seller sees their own sub-orders and, on each, the name, telephone and
 * address the parcel goes to. They do not see the order's total, which shops
 * else was in the basket, or what was bought from them: none of that is needed
 * to send a parcel, and the test that proves it is the point of this shape.
 */
export async function sellerOrders(
  database: Database,
  actor: Actor,
  sellerId: string,
): Promise<readonly SellerOrderView[]> {
  await assertSellerCapability(database, actor, sellerId, 'STORE_OPERATE');
  const rows = await database
    .select({ subOrder: commerceSubOrders, order: commerceOrders, sellerNameFa: commerceSellers.displayNameFa })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .innerJoin(commerceSellers, eq(commerceSellers.id, commerceSubOrders.sellerId))
    .where(and(eq(commerceSubOrders.sellerId, sellerId), sql`${commerceSubOrders.status} <> 'PENDING_PAYMENT'`))
    .orderBy(desc(commerceSubOrders.createdAt))
    .limit(100);

  const items = rows.length
    ? await database
        .select()
        .from(commerceOrderItems)
        .where(inArray(commerceOrderItems.subOrderId, rows.map((row) => row.subOrder.id)))
    : [];

  return rows.map((row) => ({
    subOrder: row.subOrder,
    sellerNameFa: row.sellerNameFa ?? 'فروشگاه',
    items: items.filter((item) => item.subOrderId === row.subOrder.id),
    moves: subOrderMovesFor(row.subOrder.status as SubOrderStatus, 'SELLER'),
    orderReference: row.order.reference,
    placedAt: row.order.createdAt,
    contact: fulfillmentContactOf(row.order),
  }));
}

/** Everything an operator may look at, which is the orders and not the money rails. */
export async function operatorOrders(database: Database, actor: Actor) {
  assertMarketplaceCapability(actor, 'ORDER_VIEW');
  return database
    .select({
      order: commerceOrders,
      subOrders: sql<number>`count(${commerceSubOrders.id})`.as('sub_orders'),
    })
    .from(commerceOrders)
    .leftJoin(commerceSubOrders, eq(commerceSubOrders.orderId, commerceOrders.id))
    .groupBy(commerceOrders.id)
    .orderBy(desc(commerceOrders.createdAt))
    .limit(50);
}

/** The history of one sub-order, for whoever is entitled to the sub-order itself. */
export async function subOrderHistory(database: Database, actor: Actor, subOrderId: string) {
  const subOrder = await loadSubOrder(database, subOrderId);
  const order = await loadOrder(database, subOrder.orderId);
  await moverFor(database, actor, subOrder, order);
  return database
    .select()
    .from(subOrderEvents)
    .where(eq(subOrderEvents.subOrderId, subOrderId))
    .orderBy(subOrderEvents.createdAt);
}

/** Which SKUs a shop has sold, so a stock question can be traced back to an order. */
export async function soldFromSku(database: Database, actor: Actor, skuId: string) {
  const [row] = await database
    .select({ sellerId: sellerOffers.sellerId })
    .from(offerSkus)
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .where(eq(offerSkus.id, skuId))
    .limit(1);
  if (!row) throw notFound('این قلم کالا پیدا نشد.');
  await assertSellerCapability(database, actor, row.sellerId, 'STORE_OPERATE');
  return database
    .select({
      subOrderId: commerceOrderItems.subOrderId,
      quantity: commerceOrderItems.quantity,
      reference: commerceSubOrders.reference,
      status: commerceSubOrders.status,
    })
    .from(commerceOrderItems)
    .innerJoin(commerceSubOrders, eq(commerceSubOrders.id, commerceOrderItems.subOrderId))
    .where(eq(commerceOrderItems.offerSkuId, skuId))
    .orderBy(desc(commerceSubOrders.createdAt))
    .limit(50);
}
