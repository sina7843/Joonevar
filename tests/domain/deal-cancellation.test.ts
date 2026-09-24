/**
 * What ending a deal costs, and what Hamzist will arbitrate — PROMPT-006.
 *
 * Every rule here is pure arithmetic over the policy frozen on one deal, so
 * this is where the exact behaviour of each branch is pinned.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canGiveReason,
  cancellationEffect,
  decisionRefund,
  needsReview,
  refundRetryable,
  sellerRestrictionUntil,
  CANCELLATION_OUTCOME_FA,
  CANCELLATION_REASONS,
  CANCELLATION_REASON_FA,
  DISPUTE_DECISIONS,
  DISPUTE_DECISION_FA,
  DISPUTE_SCOPES,
  DISPUTE_SCOPE_FA,
  MAX_AUTOMATIC_REFUND_ATTEMPTS,
  OUT_OF_SCOPE_FA,
  REFUND_STATUS_FA,
  type FrozenPolicy,
} from '../../src/marketplace/cancellation-model.ts';

const DEPOSIT = 600_000n;

const policy = (over: Partial<FrozenPolicy> = {}): FrozenPolicy => ({
  policyVersion: 'TEST-POLICY-1',
  buyerPenaltyBp: null,
  sellerPenaltyToman: null,
  sellerRestrictionDays: null,
  ...over,
});

test('every reason, outcome, scope and decision is named in Persian', () => {
  for (const reason of CANCELLATION_REASONS) assert.ok(CANCELLATION_REASON_FA[reason]);
  for (const scope of DISPUTE_SCOPES) assert.ok(DISPUTE_SCOPE_FA[scope]);
  for (const decision of DISPUTE_DECISIONS) assert.ok(DISPUTE_DECISION_FA[decision]);
  assert.ok(CANCELLATION_OUTCOME_FA.AWAITING_REVIEW);
  assert.ok(REFUND_STATUS_FA.MANUAL_REQUIRED);
});

test('a reason belongs to the side that can actually say it', () => {
  assert.ok(canGiveReason('BUYER_CANCELLED', 'BUYER'));
  assert.ok(!canGiveReason('BUYER_CANCELLED', 'SELLER'));
  assert.ok(canGiveReason('SELLER_CANCELLED', 'SELLER'));
  // A no-show is always claimed by the other party.
  assert.ok(canGiveReason('BUYER_NO_SHOW', 'SELLER'));
  assert.ok(canGiveReason('SELLER_NO_SHOW', 'BUYER'));
  assert.ok(!canGiveReason('SELLER_NO_SHOW', 'SELLER'));
});

test('a claim about the animal, the advert or a meeting never moves money by itself', () => {
  for (const reason of ['INFO_MISMATCH', 'FALSE_LISTING', 'HEALTH_ISSUE', 'BUYER_NO_SHOW', 'SELLER_NO_SHOW'] as const) {
    assert.ok(needsReview(reason), reason);
    const effect = cancellationEffect(reason, DEPOSIT, policy({ buyerPenaltyBp: 5_000 }));
    assert.equal(effect.outcome, 'AWAITING_REVIEW');
    assert.equal(effect.refundToman, 0n);
    assert.equal(effect.penaltyToman, 0n);
    assert.ok(effect.opensDispute);
  }
  assert.ok(!needsReview('BUYER_CANCELLED'));
  assert.ok(!needsReview('SELLER_CANCELLED'));
});

test('a buyer who changes their mind pays the penalty frozen on this deal', () => {
  // 25% of 600,000.
  const effect = cancellationEffect('BUYER_CANCELLED', DEPOSIT, policy({ buyerPenaltyBp: 2_500 }));
  assert.equal(effect.outcome, 'PARTIAL_REFUND');
  assert.equal(effect.penaltyToman, 150_000n);
  assert.equal(effect.refundToman, 450_000n);
  assert.equal(effect.sellerDebtToman, 0n);
  assert.ok(!effect.opensDispute);
});

test('an unset penalty is not a zero somebody could mistake for a decision', () => {
  const unset = cancellationEffect('BUYER_CANCELLED', DEPOSIT, policy({ buyerPenaltyBp: null }));
  assert.equal(unset.outcome, 'FULL_REFUND');
  assert.equal(unset.refundToman, DEPOSIT);
  assert.match(unset.noteFa, /تعیین نشده بود/);

  // A penalty an operator deliberately set to zero says so differently.
  const zero = cancellationEffect('BUYER_CANCELLED', DEPOSIT, policy({ buyerPenaltyBp: 0 }));
  assert.equal(zero.outcome, 'FULL_REFUND');
  assert.match(zero.noteFa, /صفر بود/);
});

test('a penalty can take the whole deposit but never more than it', () => {
  const whole = cancellationEffect('BUYER_CANCELLED', DEPOSIT, policy({ buyerPenaltyBp: 10_000 }));
  assert.equal(whole.outcome, 'NO_REFUND');
  assert.equal(whole.penaltyToman, DEPOSIT);
  assert.equal(whole.refundToman, 0n);
  // The arithmetic truncates rather than rounding up.
  const odd = cancellationEffect('BUYER_CANCELLED', 999n, policy({ buyerPenaltyBp: 1 }));
  assert.equal(odd.penaltyToman, 0n);
  assert.equal(odd.refundToman, 999n);
});

test('a seller who cancels returns everything and owes the penalty separately', () => {
  const withPenalty = cancellationEffect(
    'SELLER_CANCELLED',
    DEPOSIT,
    policy({ sellerPenaltyToman: 200_000n, buyerPenaltyBp: 5_000 }),
  );
  assert.equal(withPenalty.outcome, 'FULL_REFUND');
  assert.equal(withPenalty.refundToman, DEPOSIT, 'the buyer did nothing wrong');
  assert.equal(withPenalty.penaltyToman, 0n, 'nothing is deducted from money that is not the seller’s');
  assert.equal(withPenalty.sellerDebtToman, 200_000n);

  const noPenalty = cancellationEffect('SELLER_CANCELLED', DEPOSIT, policy());
  assert.equal(noPenalty.refundToman, DEPOSIT);
  assert.equal(noPenalty.sellerDebtToman, 0n);
  assert.match(noPenalty.noteFa, /جریمه‌ای/);
});

test('the seller restriction is progressive, and an unset base restricts nobody', () => {
  const from = new Date('2026-04-01T00:00:00.000Z');
  assert.equal(sellerRestrictionUntil(0, null, from), null);
  assert.equal(sellerRestrictionUntil(3, 0, from), null);

  const first = sellerRestrictionUntil(0, 7, from)!;
  const second = sellerRestrictionUntil(1, 7, from)!;
  const third = sellerRestrictionUntil(2, 7, from)!;
  assert.equal(first.toISOString(), '2026-04-08T00:00:00.000Z');
  assert.equal(second.toISOString(), '2026-04-15T00:00:00.000Z');
  assert.equal(third.toISOString(), '2026-04-22T00:00:00.000Z');
});

test('a decision returns at most the deposit, and out-of-scope returns nothing', () => {
  assert.equal(decisionRefund('NO_FAULT', DEPOSIT, null), DEPOSIT);
  assert.equal(decisionRefund('SELLER_FAVOURED', DEPOSIT, 900_000n), 0n);
  assert.equal(decisionRefund('OUT_OF_SCOPE', DEPOSIT, 900_000n), 0n);
  assert.equal(decisionRefund('BUYER_FAVOURED', DEPOSIT, null), DEPOSIT);
  assert.equal(decisionRefund('BUYER_FAVOURED', DEPOSIT, 250_000n), 250_000n);
  assert.equal(decisionRefund('BUYER_FAVOURED', DEPOSIT, 5_000_000n), DEPOSIT, 'never more than was paid');
  assert.equal(decisionRefund('BUYER_FAVOURED', DEPOSIT, -1n), 0n);
});

test('the limit of arbitration is stated, not implied', () => {
  assert.match(OUT_OF_SCOPE_FA, /بیعانه/);
  assert.match(OUT_OF_SCOPE_FA, /داوری نمی‌کند/);
});

test('a refund stops being retried automatically once a person is needed', () => {
  assert.ok(refundRetryable('PENDING', 0));
  assert.ok(refundRetryable('FAILED', MAX_AUTOMATIC_REFUND_ATTEMPTS - 1));
  assert.ok(!refundRetryable('FAILED', MAX_AUTOMATIC_REFUND_ATTEMPTS));
  assert.ok(!refundRetryable('PAID', 0));
  assert.ok(!refundRetryable('MANUAL_REQUIRED', 0), 'this one is owed and waits for a person');
  assert.ok(!refundRetryable('PROCESSING', 0));
});
