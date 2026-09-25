/**
 * Delivery charges, return rights and balances, on their own — PROMPT-011.
 *
 * These are the places where being quietly wrong moves somebody's money: a
 * weight rounded the generous way, a return window that outlives the
 * exception meant to cut it short, a refund that leaves a balance negative, a
 * payout that pays a debt twice or not at all.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLedgerGroup,
  balancesOf,
  cadenceEffectiveFrom,
  cadenceInForce,
  clearingLines,
  deliveryLines,
  linesBalance,
  methodCovers,
  payoutBlockers,
  payoutLines,
  periodEnd,
  preparationDeadline,
  quoteShipping,
  refundForCondition,
  refundLines,
  returnDeadline,
  returnIsFinal,
  returnMovesFor,
  returnTransitionAllowed,
  saleLines,
  settlementLocksAccount,
  settlementMovesFrom,
  settlementReference,
  settlementTransitionAllowed,
  withinReturnWindow,
  type ShippingMethodTerms,
} from '../../src/commerce/fulfilment-model.ts';

const fixed = (over: Partial<ShippingMethodTerms> = {}): ShippingMethodTerms => ({
  kind: 'POST',
  coverageKind: 'WHOLE_COUNTRY',
  provinceCodes: [],
  pricingKind: 'FIXED',
  baseFeeToman: 45_000n,
  perKgToman: null,
  includedGrams: null,
  freeThresholdToman: null,
  preparationDays: 2,
  ...over,
});

test('a method reaches only where it says, and collection reaches nobody by post', () => {
  assert.ok(methodCovers(fixed(), 'THR'));
  assert.ok(methodCovers(fixed(), null));

  const limited = fixed({ coverageKind: 'PROVINCES', provinceCodes: ['THR', 'ISF'] });
  assert.ok(methodCovers(limited, 'THR'));
  assert.ok(!methodCovers(limited, 'FRS'));
  // No province named means nothing to match against, so a limited method
  // does not quietly cover everywhere.
  assert.ok(!methodCovers(limited, null));

  // Collection is not a delivery, so a province does not decide it.
  assert.ok(methodCovers(fixed({ kind: 'PICKUP', coverageKind: 'PROVINCES', provinceCodes: ['THR'] }), 'FRS'));
});

test('weight is charged by the started kilogram past what the method includes', () => {
  const byWeight = fixed({
    pricingKind: 'WEIGHT_BASED',
    baseFeeToman: 30_000n,
    perKgToman: 12_000n,
    includedGrams: 1_000,
  });
  const quote = (grams: readonly (number | null)[]) =>
    quoteShipping({ method: byWeight, itemsTotalToman: 1n, lineWeightsGrams: grams, provinceCode: 'THR' });

  // Inside the included weight: the base and nothing else.
  assert.deepEqual(quote([900]), { toman: 30_000n, waived: false, chargeableGrams: 900 });
  // One gram over is a started kilogram, which is what a courier charges for.
  assert.deepEqual(quote([1_001]), { toman: 42_000n, waived: false, chargeableGrams: 1_001 });
  assert.deepEqual(quote([2_000, 1_500]), { toman: 66_000n, waived: false, chargeableGrams: 3_500 });
});

test('a line nobody weighed does not become weightless', () => {
  const byWeight = fixed({
    pricingKind: 'WEIGHT_BASED',
    baseFeeToman: 30_000n,
    perKgToman: 12_000n,
    includedGrams: 0,
  });
  // Guessing a weight is guessing a price, so the quote refuses and says why.
  assert.deepEqual(
    quoteShipping({ method: byWeight, itemsTotalToman: 1n, lineWeightsGrams: [500, null], provinceCode: 'THR' }),
    { problem: 'WEIGHT_UNKNOWN' },
  );
  // A fixed method never needed the weight, so a missing one is nothing to it.
  assert.deepEqual(
    quoteShipping({ method: fixed(), itemsTotalToman: 1n, lineWeightsGrams: [null], provinceCode: 'THR' }),
    { toman: 45_000n, waived: false, chargeableGrams: 0 },
  );
});

test('free delivery, collection and the ceiling each answer before the arithmetic', () => {
  // The threshold is met exactly, not merely passed.
  assert.deepEqual(
    quoteShipping({
      method: fixed({ freeThresholdToman: 900_000n }),
      itemsTotalToman: 900_000n,
      lineWeightsGrams: [],
      provinceCode: 'THR',
    }),
    { toman: 0n, waived: true, chargeableGrams: 0 },
  );
  // Collection costs nothing because nothing is delivered.
  assert.deepEqual(
    quoteShipping({
      method: fixed({ kind: 'PICKUP' }),
      itemsTotalToman: 1n,
      lineWeightsGrams: [],
      provinceCode: null,
    }),
    { toman: 0n, waived: false, chargeableGrams: 0 },
  );
  // A method that cannot reach the address says so before it prices anything.
  assert.deepEqual(
    quoteShipping({
      method: fixed({ coverageKind: 'PROVINCES', provinceCodes: ['ISF'] }),
      itemsTotalToman: 1n,
      lineWeightsGrams: [],
      provinceCode: 'THR',
    }),
    { problem: 'NOT_COVERED' },
  );
  assert.deepEqual(
    quoteShipping({
      method: fixed({ baseFeeToman: 500_000n }),
      itemsTotalToman: 1n,
      lineWeightsGrams: [],
      provinceCode: 'THR',
      ceilingToman: 200_000n,
    }),
    { problem: 'ABOVE_CEILING' },
  );
});

test('a preparation promise is a moment, from the day it was paid for', () => {
  const paidAt = new Date('2026-09-25T10:00:00.000Z');
  assert.equal(preparationDeadline(paidAt, 2).toISOString(), '2026-09-27T10:00:00.000Z');
  assert.equal(preparationDeadline(paidAt, 0).toISOString(), paidAt.toISOString());
  assert.throws(() => preparationDeadline(paidAt, -1), RangeError);
});

// ── returns ────────────────────────────────────────────────────────────────

test('a category exception shortens the return window and can never lengthen it', () => {
  const deliveredAt = new Date('2026-09-01T00:00:00.000Z');
  const standard = returnDeadline({ deliveredAt, platformWindowDays: 7, rule: 'STANDARD', categoryWindowDays: null });
  assert.equal(standard!.toISOString(), '2026-09-08T00:00:00.000Z');

  // Shorter wins.
  const shortened = returnDeadline({ deliveredAt, platformWindowDays: 7, rule: 'SEALED_ONLY', categoryWindowDays: 3 });
  assert.equal(shortened!.toISOString(), '2026-09-04T00:00:00.000Z');
  // Longer does not: the platform's promise is a floor categories cut into.
  const attempted = returnDeadline({ deliveredAt, platformWindowDays: 7, rule: 'SEALED_ONLY', categoryWindowDays: 30 });
  assert.equal(attempted!.toISOString(), '2026-09-08T00:00:00.000Z');
  // A category that cannot be returned has no window at all.
  assert.equal(
    returnDeadline({ deliveredAt, platformWindowDays: 7, rule: 'NOT_RETURNABLE', categoryWindowDays: null }),
    null,
  );

  assert.ok(withinReturnWindow(standard, new Date('2026-09-08T00:00:00.000Z')));
  assert.ok(!withinReturnWindow(standard, new Date('2026-09-08T00:00:01.000Z')));
  assert.ok(!withinReturnWindow(null, deliveredAt));
});

test('what comes back decides what is refunded, and the exception is not decorative', () => {
  const line = 200_000n;
  assert.equal(refundForCondition({ lineRefundToman: line, condition: 'AS_SOLD', rule: 'STANDARD' }).toman, line);

  // Opened where only unopened was allowed: nothing. Refunding anyway would
  // make the whole exception a sentence nobody acts on.
  assert.equal(refundForCondition({ lineRefundToman: line, condition: 'OPENED', rule: 'SEALED_ONLY' }).toman, 0n);
  // Opened where the category has no seal rule: the ordinary right applies.
  assert.equal(refundForCondition({ lineRefundToman: line, condition: 'OPENED', rule: 'STANDARD' }).toman, line);

  // Damage and a parcel that never arrived are not the buyer's to lose.
  for (const condition of ['DAMAGED', 'NOT_AS_DESCRIBED', 'MISSING'] as const) {
    assert.equal(refundForCondition({ lineRefundToman: line, condition, rule: 'SEALED_ONLY' }).toman, line);
  }
});

test('a return is the buyer’s to ask for, the shop’s to decide, and an argument is either’s to open', () => {
  assert.ok(returnTransitionAllowed('REQUESTED', 'APPROVED', 'SELLER'));
  // A buyer cannot approve their own return.
  assert.ok(!returnTransitionAllowed('REQUESTED', 'APPROVED', 'BUYER'));
  // A shop cannot post the parcel back on the buyer's behalf.
  assert.ok(!returnTransitionAllowed('APPROVED', 'SHIPPED_BACK', 'SELLER'));
  assert.ok(returnTransitionAllowed('APPROVED', 'SHIPPED_BACK', 'BUYER'));
  // A refusal the buyer will not accept is not a closed matter.
  assert.ok(returnTransitionAllowed('REJECTED', 'DISPUTED', 'BUYER'));
  // Only an operator ends an argument.
  assert.ok(returnTransitionAllowed('DISPUTED', 'REFUNDED', 'OPERATOR'));
  assert.ok(!returnTransitionAllowed('DISPUTED', 'REFUNDED', 'SELLER'));

  assert.ok(returnIsFinal('REFUNDED'));
  assert.deepEqual(returnMovesFor('REFUNDED', 'OPERATOR'), []);
});

// ── the ledger ─────────────────────────────────────────────────────────────

test('a group that moves money sums to zero, and one that does not must say so', () => {
  const moved = deliveryLines({ netToman: 100_000n, clearsAt: new Date(), referenceFa: 'X' });
  assert.ok(linesBalance(moved));
  assert.doesNotThrow(() => assertLedgerGroup(moved, true));
  // Claiming a move when money appeared is the lie the check exists to catch.
  assert.throws(() => assertLedgerGroup(moved, false), RangeError);

  const entered = saleLines({ buyerTotalToman: 100_000n, commissionToman: 7_000n, referenceFa: 'X' });
  assert.ok(!linesBalance(entered));
  assert.doesNotThrow(() => assertLedgerGroup(entered, false));
  assert.throws(() => assertLedgerGroup(entered, true), RangeError);

  assert.throws(() => assertLedgerGroup([], false), RangeError);
});

test('a sale enters as pending, less the platform’s share, and clears in two steps', () => {
  const sale = saleLines({ buyerTotalToman: 1_000_000n, commissionToman: 70_000n, referenceFa: 'HS-1' });
  const afterSale = balancesOf(sale);
  assert.equal(afterSale.PENDING, 930_000n);
  assert.equal(afterSale.HELD, 0n);
  assert.equal(afterSale.AVAILABLE, 0n);

  // Delivery moves it to held, not to available: it may still come back.
  const delivered = deliveryLines({ netToman: 930_000n, clearsAt: new Date(), referenceFa: 'HS-1' });
  const afterDelivery = balancesOf([...sale, ...delivered]);
  assert.equal(afterDelivery.PENDING, 0n);
  assert.equal(afterDelivery.HELD, 930_000n);

  const cleared = clearingLines({ netToman: 930_000n, referenceFa: 'HS-1' });
  const afterClearing = balancesOf([...sale, ...delivered, ...cleared]);
  assert.equal(afterClearing.HELD, 0n);
  assert.equal(afterClearing.AVAILABLE, 930_000n);

  assert.throws(() => saleLines({ buyerTotalToman: 100n, commissionToman: 200n, referenceFa: 'X' }), RangeError);
});

test('a refund takes from held, then pending, then available, and the rest becomes a debt', () => {
  const partly = refundLines({
    refundToman: 300_000n,
    held: 100_000n,
    pending: 50_000n,
    available: 0n,
    referenceFa: 'R-1',
  });
  const balances = balancesOf(partly);
  assert.equal(balances.HELD, -100_000n);
  assert.equal(balances.PENDING, -50_000n);
  // The part nothing covered reads as what it is, rather than as a negative
  // balance that looks like money the shop has.
  assert.equal(balances.DEBT, 150_000n);

  const covered = refundLines({ refundToman: 80_000n, held: 100_000n, pending: 0n, available: 0n, referenceFa: 'R-2' });
  assert.equal(balancesOf(covered).DEBT, 0n);
  assert.equal(balancesOf(covered).HELD, -80_000n);

  assert.throws(
    () => refundLines({ refundToman: 0n, held: 1n, pending: 0n, available: 0n, referenceFa: 'X' }),
    RangeError,
  );
});

test('a payout recovers the debt first, and never twice', () => {
  const both = payoutLines({ availableToman: 500_000n, debtToman: 200_000n, referenceFa: 'B-1' });
  assert.equal(both.recoveredToman, 200_000n);
  assert.equal(both.payoutToman, 300_000n);
  const balances = balancesOf(both.lines);
  assert.equal(balances.AVAILABLE, -500_000n);
  // The debt goes down by what was recovered and no more.
  assert.equal(balances.DEBT, -200_000n);

  // A debt larger than the balance takes all of it and leaves the rest owed.
  const swallowed = payoutLines({ availableToman: 100_000n, debtToman: 250_000n, referenceFa: 'B-2' });
  assert.equal(swallowed.payoutToman, 0n);
  assert.equal(swallowed.recoveredToman, 100_000n);
  assert.equal(balancesOf(swallowed.lines).DEBT, -100_000n);

  assert.throws(() => payoutLines({ availableToman: 0n, debtToman: 0n, referenceFa: 'X' }), RangeError);
});

test('paying needs more than a balance', () => {
  const ready = {
    availableToman: 500_000n,
    ibanVerified: true,
    sellerActive: true,
    minimumToman: 100_000n,
    openBatch: false,
  };
  assert.deepEqual(payoutBlockers(ready), []);

  // An account nobody checked is not an account to send money to.
  assert.deepEqual(payoutBlockers({ ...ready, ibanVerified: false }), ['ACCOUNT_UNVERIFIED']);
  assert.deepEqual(payoutBlockers({ ...ready, sellerActive: false }), ['SELLER_NOT_ACTIVE']);
  assert.deepEqual(payoutBlockers({ ...ready, availableToman: 50_000n }), ['BELOW_MINIMUM']);
  assert.deepEqual(payoutBlockers({ ...ready, openBatch: true }), ['BATCH_ALREADY_OPEN']);
  // An unconfigured minimum is not enforced, rather than being read as zero
  // or as infinity.
  assert.deepEqual(payoutBlockers({ ...ready, availableToman: 1n, minimumToman: null }), []);
  assert.deepEqual(payoutBlockers({ ...ready, availableToman: 0n }), ['NOTHING_AVAILABLE']);
});

test('a cadence change starts at the end of the period, never inside it', () => {
  const asked = new Date('2026-09-25T12:00:00.000Z');
  const fromMonthly = cadenceEffectiveFrom(asked, 'MONTHLY');
  // The first of next month, not tomorrow: a shop cannot shorten a period it
  // is already halfway through by asking.
  assert.equal(fromMonthly.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(periodEnd(asked, 'MONTHLY').toISOString(), '2026-10-01T00:00:00.000Z');

  const weekly = periodEnd(asked, 'WEEKLY');
  assert.ok(weekly.getTime() > asked.getTime());
  assert.ok(weekly.getTime() - asked.getTime() <= 8 * 86_400_000);

  // Until the moment arrives, the old cadence is the one in force.
  const effectiveFrom = new Date('2026-10-01T00:00:00.000Z');
  assert.equal(
    cadenceInForce({ live: 'MONTHLY', requested: 'WEEKLY', effectiveFrom, now: asked }),
    'MONTHLY',
  );
  assert.equal(
    cadenceInForce({ live: 'MONTHLY', requested: 'WEEKLY', effectiveFrom, now: effectiveFrom }),
    'WEEKLY',
  );
  // Nothing chosen at all falls to weekly rather than to nothing.
  assert.equal(cadenceInForce({ live: null, requested: null, effectiveFrom: null }), 'WEEKLY');
});

test('a batch locks the account while money is on its way, and a failure is not the end', () => {
  for (const status of ['DRAFT', 'READY', 'PAID'] as const) assert.ok(settlementLocksAccount(status));
  for (const status of ['RECONCILED', 'FAILED', 'CANCELLED'] as const) {
    assert.ok(!settlementLocksAccount(status));
  }

  assert.ok(settlementTransitionAllowed('READY', 'PAID'));
  // A failed transfer never left, so the batch goes back to being ready.
  assert.ok(settlementTransitionAllowed('FAILED', 'READY'));
  assert.ok(settlementTransitionAllowed('PAID', 'FAILED'));
  // Reconciled is the end of it.
  assert.deepEqual(settlementMovesFrom('RECONCILED'), []);
  assert.ok(!settlementTransitionAllowed('DRAFT', 'PAID'));

  assert.match(settlementReference(new Date('2026-09-25T00:00:00.000Z'), 'ab12cd34'), /^HSS2609-[0-9A-Z]{6}$/);
});
