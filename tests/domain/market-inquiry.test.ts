/**
 * The negotiation rules that need no database — PROMPT-005.
 *
 * The lifecycle, the arithmetic of the deposit, and the disclosure policy.
 * Everything here is a pure function, so these tests are where the exact
 * behaviour is pinned and the database tests can be about persistence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyContactPolicy,
  acceptsInquiries,
  canMoveInquiry,
  canRespondToOffer,
  CONTACT_BLOCKED_FA,
  deadlinePassed,
  depositForPrice,
  failedDepositDecision,
  inquiryMovesFrom,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_FA,
  isThreadWritable,
  offerProblem,
  paymentDeadline,
} from '../../src/marketplace/inquiry-model.ts';

test('every status a request can hold is named in Persian', () => {
  for (const status of INQUIRY_STATUSES) assert.ok(INQUIRY_STATUS_FA[status]);
});

test('a reservation is never something a person presses', () => {
  // CONVERTED belongs to the system alone: it is written inside the transaction
  // that verified the deposit, so neither side can reach it by asking.
  assert.ok(canMoveInquiry('ACCEPTED', 'CONVERTED', 'SYSTEM'));
  assert.ok(!canMoveInquiry('ACCEPTED', 'CONVERTED', 'SELLER'));
  assert.ok(!canMoveInquiry('ACCEPTED', 'CONVERTED', 'BUYER'));

  // An expiry is a deadline passing, not a decision either side makes.
  assert.ok(canMoveInquiry('ACCEPTED', 'EXPIRED', 'SYSTEM'));
  assert.ok(!canMoveInquiry('ACCEPTED', 'EXPIRED', 'SELLER'));

  /*
   * A reserved deal has exactly one way forward, and it is not a button: the
   * handover of PROMPT-007 writes COMPLETED inside the transaction that moved
   * the ownership, so the system owns that step the way it owns CONVERTED.
   */
  assert.deepEqual(inquiryMovesFrom('CONVERTED', 'SYSTEM'), ['COMPLETED']);
  assert.deepEqual(inquiryMovesFrom('CONVERTED', 'BUYER'), []);
  assert.deepEqual(inquiryMovesFrom('CONVERTED', 'SELLER'), []);

  // And nothing comes back from a finished request.
  for (const status of ['COMPLETED', 'EXPIRED', 'DECLINED', 'WITHDRAWN', 'CLOSED'] as const) {
    assert.deepEqual(inquiryMovesFrom(status, 'SELLER'), []);
    assert.deepEqual(inquiryMovesFrom(status, 'BUYER'), []);
    assert.deepEqual(inquiryMovesFrom(status, 'SYSTEM'), []);
  }
});

test('the thread is writable exactly while the deal is still being worked out', () => {
  assert.ok(isThreadWritable('OPEN'));
  assert.ok(isThreadWritable('ACCEPTED'));
  // After a deal forms the transcript is frozen: it is what a dispute is
  // argued from, so nothing is appended to what both sides agreed to.
  assert.ok(!isThreadWritable('CONVERTED'));
  assert.ok(!isThreadWritable('EXPIRED'));
});

test('only a published advert takes new requests', () => {
  assert.ok(acceptsInquiries('PUBLISHED'));
  for (const status of ['DRAFT', 'PAUSED', 'RESERVED', 'SOLD', 'EXPIRED', 'SUSPENDED', 'REMOVED'] as const) {
    assert.ok(!acceptsInquiries(status), status + ' must not take requests');
  }
});

test('accepting your own offer is not agreement', () => {
  assert.ok(canRespondToOffer('BUYER', 'SELLER'));
  assert.ok(canRespondToOffer('SELLER', 'BUYER'));
  assert.ok(!canRespondToOffer('BUYER', 'BUYER'));
  assert.ok(!canRespondToOffer('SELLER', 'SELLER'));
});

test('an offer has to be a real amount', () => {
  assert.equal(offerProblem(1n), null);
  assert.ok(offerProblem(0n));
  assert.ok(offerProblem(-1n));
  assert.ok(offerProblem(10n ** 13n));
});

test('the deposit is the commission, computed in exact integers', () => {
  const inputs = { fixedToman: 100_000n, percentBp: 250, minToman: null, maxToman: null };
  // 2.5% of 20,000,000 is 500,000, plus the fixed 100,000.
  assert.equal(depositForPrice(20_000_000n, inputs), 600_000n);

  // The floor and the ceiling clamp, and each one alone.
  assert.equal(depositForPrice(1_000n, { ...inputs, minToman: 500_000n }), 500_000n);
  assert.equal(depositForPrice(900_000_000n, { ...inputs, maxToman: 2_000_000n }), 2_000_000n);

  // Basis points, not percent: 10000 is the whole price.
  assert.equal(depositForPrice(1_000_000n, { fixedToman: 0n, percentBp: 10_000, minToman: null, maxToman: null }), 1_000_000n);

  // The division truncates, so the figure never exceeds what the formula says.
  assert.equal(depositForPrice(999n, { fixedToman: 0n, percentBp: 1, minToman: null, maxToman: null }), 0n);
});

test('the payment deadline is the window applied to the moment of acceptance', () => {
  const accepted = new Date('2026-03-01T10:00:00.000Z');
  const deadline = paymentDeadline(accepted, 48);
  assert.equal(deadline.toISOString(), '2026-03-03T10:00:00.000Z');
  assert.ok(!deadlinePassed(deadline, new Date('2026-03-03T09:59:59.000Z')));
  assert.ok(deadlinePassed(deadline, new Date('2026-03-03T10:00:00.000Z')));
  // No deadline is not a passed deadline.
  assert.ok(!deadlinePassed(null, new Date()));
});

// ── the disclosure policy ──────────────────────────────────────────────────

test('a telephone number is withheld however it is written', () => {
  for (const body of [
    'شماره من 09121234567 است',
    'تماس: ۰۹۱۲۱۲۳۴۵۶۷',
    'بزن 0912 123 45 67',
    'با +98 912 123 4567 هماهنگ کن',
    '0912-123-45-67',
  ]) {
    const result = applyContactPolicy(body, false);
    assert.ok(result.redacted, 'not caught: ' + body);
    assert.ok(!/\d{6}/u.test(result.text), 'digits survived: ' + result.text);
  }
});

test('card numbers, IBANs and links are withheld too', () => {
  const card = applyContactPolicy('6037 9912 3456 7890 بریز', false);
  assert.ok(card.redacted);
  assert.ok(card.codes.includes('CARD') || card.codes.includes('LONG_NUMBER'));

  const iban = applyContactPolicy('IR820540102680020817909002', false);
  assert.ok(iban.redacted);

  const link = applyContactPolicy('اینجا پرداخت کن https://example.invalid/pay/123', false);
  assert.ok(link.redacted);
  assert.ok(link.codes.includes('URL'));
  assert.ok(!link.text.includes('example.invalid'));
});

test('ordinary conversation passes through untouched', () => {
  const body = 'سلام، ۳ ماهشه؟ واکسن‌ها رو کامل زده؟';
  const result = applyContactPolicy(body, false);
  assert.equal(result.redacted, false);
  assert.equal(result.text, body);
  assert.deepEqual([...result.codes], []);
});

test('after a verified deposit nothing is withheld any more', () => {
  const body = 'شماره‌ام 09121234567، هماهنگ کنیم';
  const revealed = applyContactPolicy(body, true);
  assert.equal(revealed.redacted, false);
  assert.equal(revealed.text, body);
});

test('the policy returns only what will be stored — never the removed text', () => {
  const result = applyContactPolicy('کارت: 6037991234567890', false);
  assert.ok(result.redacted);
  assert.ok(!result.text.includes('6037991234567890'));
  // What is recorded beside the message is which rule fired, not the value.
  assert.ok(result.codes.length > 0);
  assert.ok(CONTACT_BLOCKED_FA.length > 0);
});

test('the policy is applied to every message independently', () => {
  // A /g regex carries lastIndex between calls; a second identical message must
  // be redacted exactly like the first.
  const first = applyContactPolicy('09121234567', false);
  const second = applyContactPolicy('09121234567', false);
  assert.deepEqual(first.text, second.text);
  assert.deepEqual([...first.codes], [...second.codes]);
});

// ── the bounded risk control ───────────────────────────────────────────────

test('a limit nobody has set is not enforced as zero', () => {
  assert.equal(failedDepositDecision(9, null, null).blocked, false);
  assert.equal(failedDepositDecision(9, 3, null).blocked, false);
  assert.equal(failedDepositDecision(9, null, 30).blocked, false);
});

test('the limit blocks only at the limit, and says why', () => {
  assert.equal(failedDepositDecision(2, 3, 30).blocked, false);
  const blocked = failedDepositDecision(3, 3, 30);
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.reasonFa && blocked.reasonFa.includes('۳۰'));
});
