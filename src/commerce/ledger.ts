/**
 * A shop's money, as a ledger rather than a number — PROMPT-011.
 *
 * No balance is stored. Each one is the sum of its entries, so "where did
 * this figure come from" is always answerable by reading rows in order, and a
 * balance cannot drift away from its own history because there is no second
 * copy of it to drift.
 *
 * Every event writes its entries in one transaction under one group id, and
 * says whether that group is balanced — whether it merely moved money between
 * this shop's own balances, or brought money in or took it out. Nothing here
 * writes a pair across two shops, which is why one shop's money can never
 * reach another's: there is no operation that could.
 */
import { randomUUID, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import {
  sellerLedgerEntries,
  settlementBatchLines,
  settlementBatches,
} from '../db/schema/fulfilment.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { commerceSubOrders } from '../db/schema/orders.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt, readMoney, readText } from '../settings/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { assertMarketplaceCapability, hasMarketplaceCapability } from '../marketplace/model.ts';
import type { Actor } from '../authz/actor.ts';
import { assertSellerCapability, loadSeller } from './sellers.ts';
import {
  assertLedgerGroup,
  balancesOf,
  cadenceEffectiveFrom,
  cadenceInForce,
  clearingLines,
  deliveryLines,
  emptyBalances,
  payoutBlockers,
  payoutLines,
  periodEnd,
  refundLines,
  saleLines,
  settlementLocksAccount,
  settlementReference,
  settlementTransitionAllowed,
  type Balances,
  type Cadence,
  type LedgerBucket,
  type LedgerLine,
  type SettlementStatus,
} from './fulfilment-model.ts';

export type LedgerEntryRow = typeof sellerLedgerEntries.$inferSelect;
export type SettlementBatchRow = typeof settlementBatches.$inferSelect;

export const CADENCE_KEY = 'market.settlement.default_cadence';
export const HOLD_DAYS_KEY = 'market.settlement.hold_days_after_delivery';
export const MINIMUM_PAYOUT_KEY = 'market.settlement.minimum_payout_toman';

export interface WriteGroupInput {
  readonly sellerId: string;
  readonly lines: readonly LedgerLine[];
  readonly balanced: boolean;
  readonly subOrderId?: string | null;
  readonly returnId?: string | null;
  readonly settlementBatchId?: string | null;
  readonly actorAccountId?: string | null;
}

/**
 * Write one event's entries, together.
 *
 * The arithmetic is checked before anything is written and again by the
 * database, because a ledger that can be half-written is not a ledger. The
 * group id is what makes the entries readable afterwards as the one thing
 * that happened rather than as several unrelated figures.
 */
export async function writeLedgerGroup(tx: DbClient, input: WriteGroupInput): Promise<string> {
  assertLedgerGroup(input.lines, input.balanced);
  const groupId = randomUUID();
  await tx.insert(sellerLedgerEntries).values(
    input.lines.map((line) => ({
      sellerId: input.sellerId,
      groupId,
      balanced: input.balanced,
      bucket: line.bucket,
      kind: line.kind,
      amountToman: line.amountToman,
      descriptionFa: line.descriptionFa,
      subOrderId: input.subOrderId ?? null,
      returnId: input.returnId ?? null,
      settlementBatchId: input.settlementBatchId ?? null,
      actorAccountId: input.actorAccountId ?? null,
      clearsAt: line.clearsAt ?? null,
    })),
  );
  return groupId;
}

/** Every balance, summed from the entries and nowhere else. */
export async function balancesFor(database: DbClient, sellerId: string): Promise<Balances> {
  const rows = await database
    .select({
      bucket: sellerLedgerEntries.bucket,
      total: sql<string>`sum(${sellerLedgerEntries.amountToman})`.as('total'),
    })
    .from(sellerLedgerEntries)
    .where(eq(sellerLedgerEntries.sellerId, sellerId))
    .groupBy(sellerLedgerEntries.bucket);
  const balances = emptyBalances();
  for (const row of rows) balances[row.bucket as LedgerBucket] = BigInt(row.total ?? '0');
  return balances;
}

/**
 * A paid sub-order enters the shop's world.
 *
 * Called inside the transaction that verified the payment, so money and its
 * record arrive together. The unique index on (sub-order, kind) means a second
 * call writes nothing rather than paying the shop twice.
 */
export async function accrueSale(
  tx: DbClient,
  input: { sellerId: string; subOrderId: string; referenceFa: string; buyerTotalToman: bigint; commissionToman: bigint },
): Promise<void> {
  const existing = await tx
    .select({ id: sellerLedgerEntries.id })
    .from(sellerLedgerEntries)
    .where(and(eq(sellerLedgerEntries.subOrderId, input.subOrderId), eq(sellerLedgerEntries.kind, 'SALE')))
    .limit(1);
  if (existing.length > 0) return;

  await writeLedgerGroup(tx, {
    sellerId: input.sellerId,
    // Money entered here; it did not move from anywhere this shop already had.
    balanced: false,
    subOrderId: input.subOrderId,
    lines: saleLines({
      buyerTotalToman: input.buyerTotalToman,
      commissionToman: input.commissionToman,
      referenceFa: input.referenceFa,
    }),
  });
}

/**
 * Delivered goods move the shop's share from pending to held.
 *
 * Held, not available: the buyer may still send it back, and paying out money
 * that is about to be refunded is how a marketplace ends up chasing its own
 * sellers for it.
 */
export async function holdOnDelivery(
  tx: DbClient,
  input: { sellerId: string; subOrderId: string; referenceFa: string; clearsAt: Date },
): Promise<void> {
  const rows = await tx
    .select({ bucket: sellerLedgerEntries.bucket, amountToman: sellerLedgerEntries.amountToman })
    .from(sellerLedgerEntries)
    .where(eq(sellerLedgerEntries.subOrderId, input.subOrderId));
  const pending = rows
    .filter((row) => row.bucket === 'PENDING')
    .reduce((sum, row) => sum + row.amountToman, 0n);
  if (pending <= 0n) return;

  await writeLedgerGroup(tx, {
    sellerId: input.sellerId,
    balanced: true,
    subOrderId: input.subOrderId,
    lines: deliveryLines({ netToman: pending, clearsAt: input.clearsAt, referenceFa: input.referenceFa }),
  });
}

/**
 * Let go of held money whose window has closed.
 *
 * Read-time rather than on a timer, like every other expiry in this product:
 * an operator opening the settlement screen sweeps what is due, and nothing
 * is settleable merely because a job ran.
 *
 * Money on a sub-order with a live argument stays held however long it has
 * been: that is what "disputed amounts stay held" has to mean to be true.
 */
export async function clearDueHolds(database: Database, now: Date = new Date()): Promise<number> {
  const due = await database
    .select({
      id: sellerLedgerEntries.id,
      sellerId: sellerLedgerEntries.sellerId,
      subOrderId: sellerLedgerEntries.subOrderId,
      amountToman: sellerLedgerEntries.amountToman,
      status: commerceSubOrders.status,
      reference: commerceSubOrders.reference,
    })
    .from(sellerLedgerEntries)
    .leftJoin(commerceSubOrders, eq(commerceSubOrders.id, sellerLedgerEntries.subOrderId))
    .where(
      and(
        eq(sellerLedgerEntries.bucket, 'HELD'),
        eq(sellerLedgerEntries.kind, 'RELEASE'),
        sql`${sellerLedgerEntries.amountToman} > 0`,
        sql`${sellerLedgerEntries.clearsAt} is not null and ${sellerLedgerEntries.clearsAt} <= ${now}`,
      ),
    )
    .limit(200);

  let cleared = 0;
  for (const row of due) {
    // An argued sub-order keeps its money held, whatever the date says.
    if (row.status === 'DISPUTED' || row.status === 'RETURN_REQUESTED') continue;
    // And so does one with a return still being argued about. A refused
    // return puts the sub-order back to delivered, so the sub-order's own
    // status stops being the whole answer the moment anybody disagrees —
    // which is exactly when holding the money matters.
    if (await hasLiveReturn(database, row.subOrderId!)) continue;
    const done = await database.transaction(async (tx) => {
      const balance = await heldBalanceOf(tx, row.subOrderId!);
      if (balance <= 0n) return false;
      // Already cleared by another sweep running beside this one.
      const alreadyCleared = await tx
        .select({ id: sellerLedgerEntries.id })
        .from(sellerLedgerEntries)
        .where(
          and(
            eq(sellerLedgerEntries.subOrderId, row.subOrderId!),
            eq(sellerLedgerEntries.bucket, 'AVAILABLE'),
            eq(sellerLedgerEntries.kind, 'RELEASE'),
          ),
        )
        .limit(1);
      if (alreadyCleared.length > 0) return false;

      await writeLedgerGroup(tx, {
        sellerId: row.sellerId,
        balanced: true,
        subOrderId: row.subOrderId,
        lines: clearingLines({ netToman: balance, referenceFa: row.reference ?? '' }),
      });
      return true;
    });
    if (done) cleared += 1;
  }
  return cleared;
}

/** Whether anything about this sub-order's goods is still unsettled. */
async function hasLiveReturn(database: DbClient, subOrderId: string): Promise<boolean> {
  const { orderReturns } = await import('../db/schema/fulfilment.ts');
  const rows = await database
    .select({ status: orderReturns.status })
    .from(orderReturns)
    .where(eq(orderReturns.subOrderId, subOrderId));
  // A refunded or rejected-and-accepted return is finished with; anything
  // else is still open, and an argued one is open however old it is.
  return rows.some((row) => row.status !== 'REFUNDED' && row.status !== 'REJECTED');
}

async function heldBalanceOf(tx: DbClient, subOrderId: string): Promise<bigint> {
  const rows = await tx
    .select({ amountToman: sellerLedgerEntries.amountToman })
    .from(sellerLedgerEntries)
    .where(and(eq(sellerLedgerEntries.subOrderId, subOrderId), eq(sellerLedgerEntries.bucket, 'HELD')));
  return rows.reduce((sum, row) => sum + row.amountToman, 0n);
}

/**
 * Money going back to a buyer, taken from wherever the shop has it.
 *
 * Held first, then pending, then available, and anything left over becomes a
 * debt rather than a negative balance — a negative balance reads like money
 * the shop has, and this one is the opposite of that.
 */
export async function chargeRefund(
  tx: DbClient,
  input: {
    sellerId: string;
    subOrderId: string | null;
    returnId: string | null;
    referenceFa: string;
    refundToman: bigint;
  },
): Promise<void> {
  const balances = await balancesFor(tx, input.sellerId);
  await writeLedgerGroup(tx, {
    sellerId: input.sellerId,
    // Money left the shop's world, so this is not a move between its balances.
    balanced: false,
    subOrderId: input.subOrderId,
    returnId: input.returnId,
    lines: refundLines({
      refundToman: input.refundToman,
      held: balances.HELD,
      pending: balances.PENDING,
      available: balances.AVAILABLE,
      referenceFa: input.referenceFa,
    }),
  });
}

/**
 * An operator's own entry: a promotion charge, a penalty, or a correction.
 *
 * Every one needs a reason in the words the shop will read, because an
 * unexplained figure on somebody's balance is the thing a ledger exists to
 * make impossible. There is no transfer between shops here and no operation
 * anywhere that writes one.
 */
export async function recordOperatorEntry(
  database: Database,
  actor: Actor,
  input: {
    sellerId: string;
    kind: 'PROMOTION_CHARGE' | 'PENALTY' | 'ADJUSTMENT';
    amountToman: bigint;
    reasonFa: string;
  },
): Promise<void> {
  assertMarketplaceCapability(actor, 'LEDGER_VIEW');
  assertMarketplaceCapability(actor, 'SETTLEMENT_RUN');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa.length < 5) throw validation('دلیل این ثبت را بنویسید؛ فروشنده همین متن را می‌خواند.');
  if (input.amountToman === 0n) throw validation('مبلغ نمی‌تواند صفر باشد.');
  await loadSeller(database, input.sellerId);

  // A charge or a penalty is owed; a correction may go either way, and the
  // sign the operator entered is the one that is written.
  const owed = input.kind === 'ADJUSTMENT' ? input.amountToman : abs(input.amountToman);
  const bucket: LedgerBucket = input.kind === 'ADJUSTMENT' && input.amountToman > 0n ? 'AVAILABLE' : 'DEBT';

  await database.transaction(async (tx) => {
    await writeLedgerGroup(tx, {
      sellerId: input.sellerId,
      balanced: false,
      actorAccountId: actor.accountId,
      lines: [{ bucket, kind: input.kind, amountToman: bucket === 'DEBT' ? abs(owed) : owed, descriptionFa: reasonFa }],
    });
    await recordAudit(tx, actor, {
      action: 'COMMERCE_LEDGER_ENTRY_RECORDED',
      targetType: 'COMMERCE_SELLER',
      targetId: input.sellerId,
      after: { kind: input.kind, bucket, amountToman: owed.toString(), reasonFa },
    });
  });

  await createNotification(database, {
    recipientAccountId: (await loadSeller(database, input.sellerId)).ownerAccountId,
    kind: 'COMMERCE_LEDGER_ENTRY',
    titleFa: 'ثبت تازه‌ای در دفتر مالی فروشگاه شما',
    bodyFa: reasonFa,
    resume: {
      entity: { type: 'COMMERCE_SELLER', id: input.sellerId },
      step: 'LEDGER',
      originRoute: '/account/seller/finance',
    },
  });
}

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

// ── cadence ────────────────────────────────────────────────────────────────

/** Which cadence this shop is actually on right now. */
export async function liveCadence(database: DbClient, sellerId: string): Promise<Cadence> {
  const seller = await loadSeller(database, sellerId);
  const fallback = await readText(database, CADENCE_KEY).catch(() => null);
  const live =
    (seller.settlementCadence as Cadence | null) ??
    (fallback === 'MONTHLY' || fallback === 'WEEKLY' ? (fallback as Cadence) : null);
  return cadenceInForce({
    live,
    requested: seller.requestedCadence as Cadence | null,
    effectiveFrom: seller.cadenceEffectiveFrom,
    });
}

/**
 * Ask for a different cadence, which starts at the end of the current period.
 *
 * Not at once: a shop halfway through a month cannot turn it into a week by
 * asking, and the date it will start is written down so the answer to "when"
 * is a fact rather than a promise.
 */
export async function requestCadence(
  database: Database,
  actor: Actor,
  input: { sellerId: string; cadence: Cadence },
): Promise<Date> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_BILLING');
  if (input.cadence !== 'WEEKLY' && input.cadence !== 'MONTHLY') throw validation('دوره تسویه معتبر نیست.');
  const seller = await loadSeller(database, input.sellerId);
  const current = await liveCadence(database, input.sellerId);
  const effectiveFrom = cadenceEffectiveFrom(new Date(), current);

  await database
    .update(commerceSellers)
    .set({
      // The live cadence is written down the first time, so the shop stops
      // depending on a platform default that could later change under it.
      settlementCadence: seller.settlementCadence ?? current,
      requestedCadence: input.cadence,
      cadenceEffectiveFrom: effectiveFrom,
      version: seller.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(commerceSellers.id, seller.id));

  await recordAudit(database, actor, {
    action: 'COMMERCE_SETTLEMENT_CADENCE_REQUESTED',
    targetType: 'COMMERCE_SELLER',
    targetId: seller.id,
    before: { cadence: current },
    after: { requested: input.cadence, effectiveFrom: effectiveFrom.toISOString() },
  });
  return effectiveFrom;
}

// ── settlement ─────────────────────────────────────────────────────────────

/** Whether this shop's bank account is locked because money is on its way to it. */
export async function accountLocked(database: DbClient, sellerId: string): Promise<boolean> {
  const rows = await database
    .select({ status: settlementBatches.status })
    .from(settlementBatches)
    .where(eq(settlementBatches.sellerId, sellerId));
  return rows.some((row) => settlementLocksAccount(row.status as SettlementStatus));
}

export interface SettlementPreview {
  readonly availableToman: bigint;
  readonly debtToman: bigint;
  readonly payoutToman: bigint;
  readonly blockers: readonly string[];
  readonly cadence: Cadence;
  readonly periodEnd: Date;
}

export async function settlementPreview(
  database: Database,
  sellerId: string,
  now: Date = new Date(),
): Promise<SettlementPreview> {
  const [seller, balances, cadence] = await Promise.all([
    loadSeller(database, sellerId),
    balancesFor(database, sellerId),
    liveCadence(database, sellerId),
  ]);
  const minimum = await readMoney(database, MINIMUM_PAYOUT_KEY);
  const open = await accountLocked(database, sellerId);
  const blockers = payoutBlockers({
    availableToman: balances.AVAILABLE,
    ibanVerified: seller.ibanVerifiedAt !== null,
    sellerActive: seller.status === 'ACTIVE',
    minimumToman: minimum.configured ? minimum.toman : null,
    openBatch: open,
  });
  const recovered = balances.DEBT > balances.AVAILABLE ? balances.AVAILABLE : balances.DEBT;
  return {
    availableToman: balances.AVAILABLE,
    debtToman: balances.DEBT,
    payoutToman: balances.AVAILABLE > 0n ? balances.AVAILABLE - recovered : 0n,
    blockers: blockers.map(String),
    cadence,
    periodEnd: periodEnd(now, cadence),
  };
}

/**
 * Gather one shop's settleable money into a batch.
 *
 * Only entries that are actually settleable are gathered, and the unique
 * index on the batch line is the whole of the idempotency: an entry belongs
 * to one batch and no other, so running this twice produces one batch's worth
 * of money however many times the caller asks.
 *
 * The bank details are copied onto the batch, because where money was sent is
 * a fact about that payment and not about the shop's current account.
 */
export async function openSettlementBatch(
  database: Database,
  actor: Actor,
  sellerId: string,
  now: Date = new Date(),
): Promise<SettlementBatchRow> {
  assertMarketplaceCapability(actor, 'SETTLEMENT_RUN');
  const seller = await loadSeller(database, sellerId);
  const preview = await settlementPreview(database, sellerId, now);
  if (preview.blockers.length > 0) {
    throw conflict('این فروشگاه در حال حاضر قابل تسویه نیست.', { blockers: preview.blockers });
  }
  if (seller.settlementIban === null || seller.settlementHolderNameFa === null) {
    throw conflict('حساب تسویه این فروشگاه کامل ثبت نشده است.');
  }

  const cadence = preview.cadence;
  const start = new Date(now.getTime() - (cadence === 'WEEKLY' ? 7 : 31) * 86_400_000);

  return database.transaction(async (tx) => {
    const settleable = await tx
      .select({ id: sellerLedgerEntries.id, amountToman: sellerLedgerEntries.amountToman })
      .from(sellerLedgerEntries)
      .leftJoin(settlementBatchLines, eq(settlementBatchLines.ledgerEntryId, sellerLedgerEntries.id))
      .where(
        and(
          eq(sellerLedgerEntries.sellerId, sellerId),
          eq(sellerLedgerEntries.bucket, 'AVAILABLE'),
          sql`${sellerLedgerEntries.amountToman} > 0`,
          isNull(settlementBatchLines.id),
        ),
      );
    const total = settleable.reduce((sum, row) => sum + row.amountToman, 0n);
    if (total <= 0n) throw conflict('مبلغ تسویه‌نشده‌ای برای این فروشگاه نمانده است.');

    const [batch] = await tx
      .insert(settlementBatches)
      .values({
        sellerId,
        reference: settlementReference(now, randomBytes(6).toString('hex')),
        cadence,
        periodStart: start,
        periodEnd: now,
        totalToman: total,
        ibanSnapshot: seller.settlementIban!,
        holderNameSnapshot: seller.settlementHolderNameFa!,
      })
      .returning();

    await tx.insert(settlementBatchLines).values(
      settleable.map((row) => ({ batchId: batch!.id, ledgerEntryId: row.id, amountToman: row.amountToman })),
    );

    await recordAudit(tx, actor, {
      action: 'COMMERCE_SETTLEMENT_BATCH_OPENED',
      targetType: 'COMMERCE_SELLER',
      targetId: sellerId,
      after: {
        batchId: batch!.id,
        reference: batch!.reference,
        totalToman: total.toString(),
        lines: settleable.length,
        cadence,
      },
    });
    return batch!;
  });
}

export async function loadBatch(database: DbClient, batchId: string): Promise<SettlementBatchRow> {
  const [row] = await database.select().from(settlementBatches).where(eq(settlementBatches.id, batchId)).limit(1);
  if (!row) throw notFound('این دسته تسویه پیدا نشد.');
  return row;
}

/**
 * Move a batch along, and take the money out of the ledger when it is paid.
 *
 * A payment is only recorded with the bank's own reference, and recording it
 * is what writes the payout entries: until a person has actually sent money
 * and said where, the shop's settleable balance is untouched. The database
 * check refuses a PAID batch without a reference, so this cannot be skipped.
 */
export async function moveBatch(
  database: Database,
  actor: Actor,
  input: {
    batchId: string;
    to: SettlementStatus;
    bankReference?: string | null;
    reasonFa?: string | null;
    expectedVersion?: number;
  },
): Promise<SettlementBatchRow> {
  assertMarketplaceCapability(actor, 'SETTLEMENT_RUN');
  const batch = await loadBatch(database, input.batchId);
  const from = batch.status as SettlementStatus;
  if (!settlementTransitionAllowed(from, input.to)) {
    throw conflict('این تغییر وضعیت برای این دسته تسویه ممکن نیست.');
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== batch.version) {
    throw conflict('این دسته در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');
  }

  const bankReference = (input.bankReference ?? '').trim();
  if (input.to === 'PAID' && bankReference.length < 4) {
    throw validation('شماره پیگیری بانکی را وارد کنید؛ بدون آن این واریز ثبت نمی‌شود.');
  }
  const reasonFa = (input.reasonFa ?? '').trim();
  if ((input.to === 'FAILED' || input.to === 'CANCELLED') && reasonFa.length < 5) {
    throw validation('دلیل این وضعیت را بنویسید.');
  }

  const now = new Date();
  return database.transaction(async (tx) => {
    const [moved] = await tx
      .update(settlementBatches)
      .set({
        status: input.to,
        bankReference: input.to === 'PAID' ? bankReference : batch.bankReference,
        paidAt: input.to === 'PAID' ? now : batch.paidAt,
        paidByAccountId: input.to === 'PAID' ? actor.accountId : batch.paidByAccountId,
        reconciledAt: input.to === 'RECONCILED' ? now : batch.reconciledAt,
        reconciledByAccountId: input.to === 'RECONCILED' ? actor.accountId : batch.reconciledByAccountId,
        failureReasonFa: input.to === 'FAILED' || input.to === 'CANCELLED' ? reasonFa : batch.failureReasonFa,
        version: batch.version + 1,
        updatedAt: now,
      })
      .where(and(eq(settlementBatches.id, batch.id), eq(settlementBatches.version, batch.version)))
      .returning();
    if (!moved) throw conflict('این دسته در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    // Paying is what takes the money out of the ledger, and it happens once:
    // a batch that is already PAID cannot reach this branch again, because
    // PAID does not transition to itself.
    if (input.to === 'PAID') {
      const balances = await balancesFor(tx, batch.sellerId);
      const { lines } = payoutLines({
        availableToman: batch.totalToman,
        debtToman: balances.DEBT > 0n ? balances.DEBT : 0n,
        referenceFa: batch.reference,
      });
      await writeLedgerGroup(tx, {
        sellerId: batch.sellerId,
        // Money left for a bank account: it did not move between balances.
        balanced: false,
        settlementBatchId: batch.id,
        actorAccountId: actor.accountId,
        lines,
      });

      // The shop is told the money left, with the reference it left under
      // (PROMPT-013). This is one of the few things worth an SMS.
      const [owner] = await tx
        .select({ ownerAccountId: commerceSellers.ownerAccountId })
        .from(commerceSellers)
        .where(eq(commerceSellers.id, batch.sellerId))
        .limit(1);
      if (owner) {
        await createNotification(tx, {
          recipientAccountId: owner.ownerAccountId,
          kind: 'COMMERCE_SETTLEMENT_PAID',
          titleFa: 'تسویه فروشگاه شما واریز شد',
          bodyFa: 'دسته ' + batch.reference + ' با شماره پیگیری ' + bankReference + ' واریز شد.',
          resume: {
            entity: { type: 'COMMERCE_SELLER', id: batch.sellerId },
            step: 'SETTLEMENT',
            originRoute: '/account/seller/finance',
          },
        });
      }
    }

    // A transfer that failed never left, so the money goes back to being
    // settleable and the batch lines are released for the next attempt.
    if (input.to === 'FAILED' || input.to === 'CANCELLED') {
      if (from === 'PAID') {
        await writeLedgerGroup(tx, {
          sellerId: batch.sellerId,
          balanced: false,
          settlementBatchId: batch.id,
          actorAccountId: actor.accountId,
          lines: [
            {
              bucket: 'AVAILABLE',
              kind: 'ADJUSTMENT',
              amountToman: batch.totalToman,
              descriptionFa: 'بازگشت مبلغ دسته تسویه ناموفق ' + batch.reference,
            },
          ],
        });
      }
      if (input.to === 'CANCELLED') {
        await tx.delete(settlementBatchLines).where(eq(settlementBatchLines.batchId, batch.id));
      }
    }

    await recordAudit(tx, actor, {
      action: 'COMMERCE_SETTLEMENT_BATCH_MOVED',
      targetType: 'COMMERCE_SELLER',
      targetId: batch.sellerId,
      targetVersion: batch.version + 1,
      before: { status: from },
      after: {
        status: input.to,
        batchId: batch.id,
        bankReference: input.to === 'PAID' ? bankReference : undefined,
        reasonFa: reasonFa || undefined,
      },
    });
    return moved;
  });
}

// ── reading ────────────────────────────────────────────────────────────────

export interface FinanceView {
  readonly balances: Balances;
  readonly entries: readonly LedgerEntryRow[];
  readonly batches: readonly SettlementBatchRow[];
  readonly preview: SettlementPreview;
  readonly accountLocked: boolean;
}

/** One shop's own money, for the people who work in that shop. */
export async function financeFor(database: Database, actor: Actor, sellerId: string): Promise<FinanceView> {
  await assertSellerCapability(database, actor, sellerId, 'STORE_BILLING');
  const [balances, entries, batches, preview, locked] = await Promise.all([
    balancesFor(database, sellerId),
    database
      .select()
      .from(sellerLedgerEntries)
      .where(eq(sellerLedgerEntries.sellerId, sellerId))
      .orderBy(desc(sellerLedgerEntries.createdAt))
      .limit(100),
    database
      .select()
      .from(settlementBatches)
      .where(eq(settlementBatches.sellerId, sellerId))
      .orderBy(desc(settlementBatches.createdAt))
      .limit(20),
    settlementPreview(database, sellerId),
    accountLocked(database, sellerId),
  ]);
  return { balances, entries, batches, preview, accountLocked: locked };
}

export interface SettlementQueueRow {
  readonly sellerId: string;
  readonly sellerNameFa: string;
  readonly availableToman: bigint;
  readonly debtToman: bigint;
  readonly blockers: readonly string[];
  readonly openBatch: SettlementBatchRow | null;
}

/**
 * Every shop with money in it, for the finance operator.
 *
 * Reading this sweeps the holds whose windows have closed, because nothing in
 * this product runs on a timer and an operator looking at settleable money
 * should be looking at what is settleable now.
 */
export async function settlementQueue(
  database: Database,
  actor: Actor,
): Promise<readonly SettlementQueueRow[]> {
  assertMarketplaceCapability(actor, 'SETTLEMENT_RUN');
  await clearDueHolds(database);

  const sellers = await database
    .select({ id: commerceSellers.id, nameFa: commerceSellers.displayNameFa })
    .from(commerceSellers)
    .where(eq(commerceSellers.status, 'ACTIVE'));

  const rows: SettlementQueueRow[] = [];
  for (const seller of sellers) {
    const balances = await balancesFor(database, seller.id);
    if (balances.AVAILABLE === 0n && balances.DEBT === 0n && balances.HELD === 0n && balances.PENDING === 0n) continue;
    const preview = await settlementPreview(database, seller.id);
    const [open] = await database
      .select()
      .from(settlementBatches)
      .where(
        and(
          eq(settlementBatches.sellerId, seller.id),
          inArray(settlementBatches.status, ['DRAFT', 'READY', 'PAID']),
        ),
      )
      .limit(1);
    rows.push({
      sellerId: seller.id,
      sellerNameFa: seller.nameFa ?? 'فروشگاه',
      availableToman: balances.AVAILABLE,
      debtToman: balances.DEBT,
      blockers: preview.blockers,
      openBatch: open ?? null,
    });
  }
  return rows;
}

/** The entries one batch is paying for, for whoever may see that batch. */
export async function batchLines(database: Database, actor: Actor, batchId: string) {
  const batch = await loadBatch(database, batchId);
  if (!hasMarketplaceCapability(actor, 'SETTLEMENT_RUN')) {
    // A shop may read its own batch; anybody else is told it does not exist.
    const membership = await import('./sellers.ts').then((m) =>
      actor.accountId ? m.membershipOf(database, batch.sellerId, actor.accountId) : null,
    );
    if (membership === null) throw notFound('این دسته تسویه پیدا نشد.');
  }
  return database
    .select({
      amountToman: settlementBatchLines.amountToman,
      descriptionFa: sellerLedgerEntries.descriptionFa,
      createdAt: sellerLedgerEntries.createdAt,
    })
    .from(settlementBatchLines)
    .innerJoin(sellerLedgerEntries, eq(sellerLedgerEntries.id, settlementBatchLines.ledgerEntryId))
    .where(eq(settlementBatchLines.batchId, batchId))
    .orderBy(asc(sellerLedgerEntries.createdAt));
}

/** Refuse a change of bank details while a batch is on its way to the old one. */
export async function assertAccountUnlocked(database: DbClient, sellerId: string): Promise<void> {
  if (await accountLocked(database, sellerId)) {
    throw conflict(
      'تا پایان تسویه جاری، تغییر حساب بانکی این فروشگاه ممکن نیست؛ پس از ثبت واریز و مغایرت‌گیری دوباره تلاش کنید.',
    );
  }
}
