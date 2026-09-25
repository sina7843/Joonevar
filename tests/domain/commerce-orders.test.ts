/**
 * The order rules, on their own — PROMPT-010.
 *
 * What is tested here is the arithmetic and the state machine, because those
 * are the parts where being quietly wrong costs somebody money: a commission
 * rounded the generous way, a total that does not add up to its parts, a
 * status moved by a side it does not belong to.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptanceDeadline,
  acceptanceOverdue,
  checkoutBlocked,
  commissionFor,
  confirmationMatches,
  fulfillmentContactOf,
  lineTotal,
  orderMoney,
  orderReference,
  parentStatusFrom,
  refundableFor,
  shippingFor,
  subOrderEndedInRefund,
  subOrderIsFinal,
  subOrderIsOpen,
  subOrderMoney,
  subOrderMovesFor,
  subOrderReference,
  subOrderTransitionAllowed,
  CHECKOUT_HOLD_MINUTES,
  SUB_ORDER_STATUSES,
  type BasketChange,
} from '../../src/commerce/order-model.ts';

test('a line is unit price times quantity, less whatever was taken off it', () => {
  assert.equal(lineTotal({ unitPriceToman: 480_000n, quantity: 3 }), 1_440_000n);
  assert.equal(lineTotal({ unitPriceToman: 480_000n, quantity: 3, discountToman: 40_000n }), 1_400_000n);

  // A quantity is a count of things, so nothing else is one.
  assert.throws(() => lineTotal({ unitPriceToman: 1n, quantity: 0 }), RangeError);
  assert.throws(() => lineTotal({ unitPriceToman: 1n, quantity: 1.5 }), RangeError);
  // A discount larger than the line would make the buyer owed money by buying.
  assert.throws(() => lineTotal({ unitPriceToman: 100n, quantity: 1, discountToman: 101n }), RangeError);
});

test('an unstated delivery charge is not free delivery', () => {
  // The shop never said: the caller is meant to refuse, not to bill zero.
  assert.equal(shippingFor({ feeToman: null, freeThresholdToman: null, itemsTotalToman: 100n }), null);

  // Zero entered on purpose is free delivery, and reads as a charge of zero.
  assert.deepEqual(shippingFor({ feeToman: 0n, freeThresholdToman: null, itemsTotalToman: 100n }), {
    toman: 0n,
    waived: false,
  });

  assert.deepEqual(shippingFor({ feeToman: 45_000n, freeThresholdToman: null, itemsTotalToman: 900_000n }), {
    toman: 45_000n,
    waived: false,
  });
  // At the threshold, not merely past it.
  assert.deepEqual(shippingFor({ feeToman: 45_000n, freeThresholdToman: 900_000n, itemsTotalToman: 900_000n }), {
    toman: 0n,
    waived: true,
  });
  assert.deepEqual(shippingFor({ feeToman: 45_000n, freeThresholdToman: 900_000n, itemsTotalToman: 899_999n }), {
    toman: 45_000n,
    waived: false,
  });
});

test('the commission truncates in the shop’s favour and never exceeds the sale', () => {
  // 1,000,001 × 7% = 70,000.07 → the platform takes 70,000, not 70,001.
  assert.equal(commissionFor({ buyerTotalToman: 1_000_001n, percentBp: 700 }), 70_000n);
  assert.equal(commissionFor({ buyerTotalToman: 1_000_000n, percentBp: 0 }), 0n);

  // A minimum is a floor under the percentage, not a surcharge on top of it.
  assert.equal(commissionFor({ buyerTotalToman: 100_000n, percentBp: 100, minimumToman: 5_000n }), 5_000n);
  assert.equal(commissionFor({ buyerTotalToman: 1_000_000n, percentBp: 100, minimumToman: 5_000n }), 10_000n);

  // And it is capped at the sale, because a payout cannot go negative.
  assert.equal(commissionFor({ buyerTotalToman: 3_000n, percentBp: 0, minimumToman: 5_000n }), 3_000n);

  assert.throws(() => commissionFor({ buyerTotalToman: 1n, percentBp: 10_001 }), RangeError);
  assert.throws(() => commissionFor({ buyerTotalToman: 0n, percentBp: 100 }), RangeError);
});

test('one shop’s figures are complete, and its two shares are the whole of it', () => {
  const money = subOrderMoney({
    lines: [
      { unitPriceToman: 480_000n, quantity: 2 },
      { unitPriceToman: 125_000n, quantity: 1, discountToman: 25_000n },
    ],
    shippingToman: 45_000n,
    commissionPercentBp: 700,
  });
  assert.equal(money.itemsTotalToman, 1_085_000n);
  assert.equal(money.discountToman, 25_000n);
  assert.equal(money.buyerTotalToman, 1_105_000n);
  // The two shares add up to the whole, which is the constraint in the table.
  assert.equal(money.commissionToman + money.payoutToman, money.buyerTotalToman);
  assert.equal(money.commissionToman, 77_350n);
});

test('the order total is the sum of the shops, so nothing has to be allocated', () => {
  const first = subOrderMoney({
    lines: [{ unitPriceToman: 333_333n, quantity: 3 }],
    shippingToman: 19_999n,
    commissionPercentBp: 733,
  });
  const second = subOrderMoney({
    lines: [{ unitPriceToman: 111_111n, quantity: 7 }],
    shippingToman: 0n,
    commissionPercentBp: 250,
  });
  const totals = orderMoney([first, second]);

  assert.equal(totals.grandTotalToman, first.buyerTotalToman + second.buyerTotalToman);
  assert.equal(
    totals.grandTotalToman,
    totals.itemsTotalToman - totals.discountTotalToman + totals.shippingTotalToman,
  );
  // Awkward percentages on awkward figures still leave nothing unaccounted for:
  // the commissions and payouts together are exactly the money taken.
  assert.equal(
    first.commissionToman + first.payoutToman + second.commissionToman + second.payoutToman,
    totals.grandTotalToman,
  );
  assert.throws(() => orderMoney([]), RangeError);
});

test('a refund of one shop’s part is the whole of that part, delivery included', () => {
  const money = subOrderMoney({
    lines: [{ unitPriceToman: 200_000n, quantity: 1 }],
    shippingToman: 30_000n,
    commissionPercentBp: 1_000,
  });
  // Not the payout, and not the items alone: the buyer is not getting a
  // delivery either, and the platform's cut on a sale that did not happen is
  // not the platform's to keep.
  assert.equal(refundableFor(money), 230_000n);
});

test('only the system moves a paid sub-order into being paid, and only a seller accepts it', () => {
  assert.ok(subOrderTransitionAllowed('PENDING_PAYMENT', 'PAID', 'SYSTEM'));
  // Not a person, however senior: being paid is something a verified payment
  // did, not something anybody decides.
  assert.ok(!subOrderTransitionAllowed('PENDING_PAYMENT', 'PAID', 'OPERATOR'));
  assert.ok(!subOrderTransitionAllowed('PENDING_PAYMENT', 'PAID', 'SELLER'));
  assert.ok(!subOrderTransitionAllowed('PENDING_PAYMENT', 'PAID', 'BUYER'));

  assert.ok(subOrderTransitionAllowed('PAID', 'ACCEPTED_BY_SELLER', 'SELLER'));
  // A buyer cannot accept an order on the shop's behalf.
  assert.ok(!subOrderTransitionAllowed('PAID', 'ACCEPTED_BY_SELLER', 'BUYER'));
  // A shop cannot mark its own parcel returned before it was even shipped.
  assert.ok(!subOrderTransitionAllowed('PAID', 'RETURNED', 'SELLER'));
  // And a buyer cannot ship it.
  assert.ok(!subOrderTransitionAllowed('PREPARING', 'SHIPPED', 'BUYER'));
});

test('a return is the buyer’s to ask for and the shop’s to accept, and a refusal is a dispute', () => {
  assert.ok(subOrderTransitionAllowed('DELIVERED', 'RETURN_REQUESTED', 'BUYER'));
  assert.ok(!subOrderTransitionAllowed('DELIVERED', 'RETURN_REQUESTED', 'SELLER'));
  assert.ok(subOrderTransitionAllowed('RETURN_REQUESTED', 'RETURNED', 'SELLER'));
  // A shop that will not take it back has not closed the matter.
  assert.ok(subOrderTransitionAllowed('RETURN_REQUESTED', 'DISPUTED', 'SELLER'));
  assert.ok(subOrderTransitionAllowed('RETURN_REQUESTED', 'DISPUTED', 'BUYER'));

  // Refunded is the end of it, whichever road led there.
  assert.ok(subOrderIsFinal('REFUNDED'));
  assert.ok(!subOrderIsFinal('DISPUTED'));
  assert.deepEqual(subOrderMovesFor('REFUNDED', 'OPERATOR'), []);

  for (const status of SUB_ORDER_STATUSES) {
    // Nothing is offered to a side that the rule would then refuse.
    for (const move of subOrderMovesFor(status, 'SELLER')) {
      assert.ok(subOrderTransitionAllowed(status, move, 'SELLER'));
    }
  }
});

test('an open sub-order is one the shop still owes goods for', () => {
  assert.ok(subOrderIsOpen('PAID'));
  assert.ok(subOrderIsOpen('SHIPPED'));
  assert.ok(subOrderIsOpen('DISPUTED'));
  assert.ok(!subOrderIsOpen('DELIVERED'));
  assert.ok(!subOrderIsOpen('CANCELLED'));

  assert.ok(subOrderEndedInRefund('REFUNDED'));
  assert.ok(subOrderEndedInRefund('CANCELLED'));
  assert.ok(!subOrderEndedInRefund('DELIVERED'));
});

test('the parent says only what is still true of the whole order', () => {
  assert.equal(parentStatusFrom(false, ['PENDING_PAYMENT']), 'PENDING_PAYMENT');
  assert.equal(parentStatusFrom(true, ['PAID', 'SHIPPED']), 'PAID');
  // One shop refunding does not make the order refunded: the other is still
  // being delivered, and saying otherwise would be a lie to the buyer.
  assert.equal(parentStatusFrom(true, ['REFUNDED', 'DELIVERED']), 'PAID');
  assert.equal(parentStatusFrom(true, ['REFUNDED', 'REFUNDED']), 'REFUNDED');
});

test('a changed basket is shown; an unbuyable one stops the checkout', () => {
  const priceMoved: BasketChange = {
    kind: 'PRICE_CHANGED',
    skuId: 's',
    sellerId: null,
    labelFa: 'غذای خشک',
    detailFa: 'قیمت تغییر کرد',
    blocking: false,
  };
  const gone: BasketChange = { ...priceMoved, kind: 'UNAVAILABLE', blocking: true };

  assert.equal(checkoutBlocked([]), false);
  // A price that moved is the buyer's to accept or not, not a wall.
  assert.equal(checkoutBlocked([priceMoved]), false);
  assert.equal(checkoutBlocked([priceMoved, gone]), true);
});

test('a confirmation is of one exact figure and nothing else', () => {
  assert.ok(confirmationMatches(1_105_000n, 1_105_000n));
  // One toman out is not a confirmation of this amount.
  assert.ok(!confirmationMatches(1_105_000n, 1_105_001n));
  // And no answer is not agreement.
  assert.ok(!confirmationMatches(null, 1_105_000n));
});

test('an acceptance deadline is a moment, and silence past it is a refusal', () => {
  const paidAt = new Date('2026-09-25T10:00:00.000Z');
  const due = acceptanceDeadline(paidAt, 48);
  assert.equal(due.toISOString(), '2026-09-27T10:00:00.000Z');

  assert.ok(!acceptanceOverdue(due, new Date('2026-09-27T09:59:59.000Z')));
  assert.ok(acceptanceOverdue(due, due));
  // No deadline was ever set, so nothing is overdue: an unconfigured window
  // must not become an automatic cancellation.
  assert.ok(!acceptanceOverdue(null, new Date('2030-01-01T00:00:00.000Z')));
  assert.throws(() => acceptanceDeadline(paidAt, 0), RangeError);
});

test('a seller is given what a courier needs and nothing about the rest of the basket', () => {
  const contact = fulfillmentContactOf({
    recipientNameFa: 'گیرنده آزمایشی',
    recipientPhone: '09120000000',
    provinceFa: 'تهران',
    cityFa: 'تهران',
    addressFa: 'نشانی آزمایشی، پلاک ۱',
    postalCode: '1234567890',
    noteFa: null,
  });
  // Exactly the delivery fields. Anything else that ever gets added to an
  // order will fail this, which is the point of comparing the whole shape.
  assert.deepEqual(Object.keys(contact).sort(), [
    'addressFa',
    'cityFa',
    'noteFa',
    'postalCode',
    'provinceFa',
    'recipientNameFa',
    'recipientPhone',
  ]);
});

test('references are readable down a telephone and a sub-order carries its parent’s', () => {
  const reference = orderReference(new Date('2026-09-25T00:00:00.000Z'), 'a1b2c3d4e5');
  assert.match(reference, /^HS2609-[0-9A-Z]{6}$/);
  assert.equal(subOrderReference(reference, 0), reference + '-01');
  assert.equal(subOrderReference(reference, 10), reference + '-11');
  // Short randomness is padded rather than producing a shorter reference.
  assert.match(orderReference(new Date('2026-09-25T00:00:00.000Z'), 'a'), /^HS2609-A00000$/);
});

test('the hold lasts long enough to pay and not long enough to hoard', () => {
  assert.ok(CHECKOUT_HOLD_MINUTES >= 10 && CHECKOUT_HOLD_MINUTES <= 60);
});
