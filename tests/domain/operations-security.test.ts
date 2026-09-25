/**
 * Aggregates, signals, redaction and the notification catalogue — PROMPT-013.
 *
 * Four things that are easy to get quietly wrong: a rate computed from a
 * denominator that is sometimes zero, a breakdown small enough to be about
 * one person, a record that keeps a number it should not, and a message that
 * leaves the product carrying text nobody reviewed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  averageToman,
  cellFa,
  funnelSteps,
  redactSmallGroups,
  riskSignals,
  share,
  BELOW_THRESHOLD_FA,
} from '../../src/analytics/metrics.ts';
import { maskTail, redact, redactText } from '../../src/security/redaction.ts';
import { subjectHash, windowStart, RATE_LIMIT_ACTIONS, RATE_LIMIT_KEYS } from '../../src/security/rate-limit.ts';
import {
  channelsFor,
  inAppOnlyKinds,
  renderSms,
  smsKinds,
  templatedKinds,
  templateFor,
} from '../../src/notifications/templates.ts';

// ── aggregates ─────────────────────────────────────────────────────────────

test('a share of nothing is not zero per cent', () => {
  assert.equal(share(3, 12), 25);
  assert.equal(share(1, 3), 33.3);
  // Zero per cent is a claim about a population that exists; this one does not.
  assert.equal(share(0, 0), null);
  assert.equal(share(5, 0), null);
});

test('an average over no rows is nothing, and money truncates', () => {
  assert.equal(averageToman(1_000_000n, 3), 333_333n);
  assert.equal(averageToman(1_000_000n, 0), 0n);
  assert.equal(averageToman(0n, 5), 0n);
});

test('a funnel shows each step against the one before it and against the top', () => {
  const steps = funnelSteps({ listed: 100, enquired: 50, accepted: 20, reserved: 10, completed: 8 });
  assert.equal(steps.length, 5);
  assert.equal(steps[0]!.ofPrevious, null);
  assert.equal(steps[1]!.ofPrevious, 50);
  // Twenty of fifty is forty per cent of the step before, twenty of the top.
  assert.equal(steps[2]!.ofPrevious, 40);
  assert.equal(steps[2]!.ofTop, 20);
  assert.equal(steps[4]!.ofTop, 8);
});

test('a breakdown too small to be a statistic is withheld, and its row stays', () => {
  const rows = [
    { labelFa: 'تهران', count: 40 },
    { labelFa: 'یزد', count: 2 },
  ];
  const redacted = redactSmallGroups(rows, 5);
  assert.equal(redacted.length, 2, 'the row stays: its absence would be as telling as its value');
  assert.equal(redacted[0]!.suppressed, false);
  assert.equal(redacted[1]!.suppressed, true);
  assert.equal(cellFa(redacted[1]!), BELOW_THRESHOLD_FA);
  // A suppressed cell never prints a bare zero, which would read as a fact.
  assert.notEqual(cellFa(redacted[1]!), '۰');

  // A threshold of one suppresses nothing, because every row is already a
  // group of at least one.
  assert.ok(redactSmallGroups(rows, 1).every((row) => !row.suppressed));
});

// ── risk ───────────────────────────────────────────────────────────────────

test('a signal is a reason to look, and never fires on nothing', () => {
  const quiet = riskSignals({
    failedPayments: 0,
    cancelledDeals: 0,
    reportsAgainst: 0,
    refunds: 0,
    rateLimitTrips: 0,
  });
  assert.deepEqual(quiet, []);

  const noisy = riskSignals({
    failedPayments: 9,
    cancelledDeals: 0,
    reportsAgainst: 4,
    refunds: 0,
    rateLimitTrips: 2,
  });
  assert.deepEqual(
    noisy.map((signal) => signal.kind).sort(),
    ['MANY_FAILED_PAYMENTS', 'MANY_REPORTS_AGAINST', 'RATE_LIMIT_TRIPPED'],
  );
  // Every one says what it might mean, so nobody reads a count as a verdict.
  assert.ok(noisy.every((signal) => signal.noteFa.length > 20));

  // Under the threshold, nothing is raised.
  assert.deepEqual(
    riskSignals({ failedPayments: 2, cancelledDeals: 1, reportsAgainst: 1, refunds: 1, rateLimitTrips: 0 }),
    [],
  );
});

// ── redaction ──────────────────────────────────────────────────────────────

test('a record keeps neither secrets nor identifying numbers', () => {
  const redacted = redact({
    token: 'abc',
    password: 'hunter2',
    nationalId: '1234567890',
    settlementIban: 'IR820540102680020817909002',
    buyerNationalId: '0011223344',
    keep: 'ordinary text',
    nested: { authorization: 'Bearer x', recipientPhone: '09120000000', alsoKeep: 7 },
  }) as Record<string, unknown>;

  assert.equal(redacted.token, '[redacted]');
  assert.equal(redacted.password, '[redacted]');
  assert.equal(redacted.nationalId, '[redacted]');
  // Suffix matching, so a field nobody thought of is caught too.
  assert.equal(redacted.settlementIban, '[redacted]');
  assert.equal(redacted.buyerNationalId, '[redacted]');
  assert.equal(redacted.keep, 'ordinary text');
  const nested = redacted.nested as Record<string, unknown>;
  assert.equal(nested.authorization, '[redacted]');
  assert.equal(nested.recipientPhone, '[redacted]');
  assert.equal(nested.alsoKeep, 7);
});

test('a number typed into free text does not survive either', () => {
  assert.match(redactText('تماس بگیرید ۰۹۱۲۳۴۵۶۷۸۹'), /\[redacted\]/);
  assert.match(redactText('call me on 09123456789 please'), /\[redacted\]/);
  assert.match(redactText('شبا IR820540102680020817909002'), /\[redacted\]/);
  assert.match(redactText('6037 9912 3456 7890'), /\[redacted\]/);
  // Ordinary text and small numbers are left alone.
  assert.equal(redactText('سفارش شماره ۳ آماده است'), 'سفارش شماره ۳ آماده است');
});

test('masking keeps enough to recognise a record and no more', () => {
  assert.equal(maskTail('09123456789'), '*******6789');
  assert.equal(maskTail('12', 4), '**');
  // Long values do not become a wall of stars the width of the original.
  assert.ok(maskTail('IR820540102680020817909002').length <= 16);
});

// ── limits ─────────────────────────────────────────────────────────────────

test('a window is a bucket, and a subject is never stored as given', () => {
  const at = new Date('2026-09-26T10:37:12.000Z');
  assert.equal(windowStart(at, 60).toISOString(), '2026-09-26T10:00:00.000Z');
  assert.equal(windowStart(at, 15).toISOString(), '2026-09-26T10:30:00.000Z');

  const hash = subjectHash('SEARCH_QUERY', '203.0.113.9');
  assert.notEqual(hash, '203.0.113.9');
  assert.equal(hash.length, 32);
  // The same visitor under two actions does not hash the same, so one action
  // cannot be used to follow them across another.
  assert.notEqual(hash, subjectHash('REPORT_SUBMIT', '203.0.113.9'));
  assert.equal(hash, subjectHash('SEARCH_QUERY', '203.0.113.9'));
});

test('every limited action names the settings that govern it', () => {
  for (const action of RATE_LIMIT_ACTIONS) {
    const keys = RATE_LIMIT_KEYS[action];
    assert.ok(keys.ceiling.startsWith('market.limit.'), action + ' has a managed ceiling');
    assert.ok(keys.window.startsWith('market.limit.'), action + ' has a managed window');
  }
});

// ── what leaves the product ────────────────────────────────────────────────

test('a kind with no template stays in the app, however it is asked', () => {
  assert.deepEqual(channelsFor('SOMETHING_NOBODY_REVIEWED', { smsEnabled: true }), ['IN_APP']);
  assert.equal(renderSms('SOMETHING_NOBODY_REVIEWED'), null);
});

test('SMS is a short, reviewed list, and every sentence is complete without a record', () => {
  const sms = smsKinds();
  assert.ok(sms.length > 0);
  // Far fewer than the catalogue: most of what a marketplace says belongs in
  // the app, where the record is.
  assert.ok(sms.length < templatedKinds().length);

  for (const kind of sms) {
    const text = renderSms(kind);
    assert.ok(text !== null && text.length > 10, kind + ' has a sentence');
    // No placeholder of any shape, because a template that interpolates is a
    // template that eventually interpolates a national id.
    assert.ok(!/[{}$]|%s/.test(text!), kind + ' interpolates nothing');
    assert.match(text!, /^همزیست:/, kind + ' says who is writing');
  }
});

test('the Phase 3 kinds are all registered, and the loud ones are the few that matter', () => {
  const registered = new Set(templatedKinds());
  // Every kind the marketplace emits is in the catalogue, so "what does this
  // send?" is answered by one file rather than by a search.
  for (const kind of [
    'LISTING_INQUIRY_CREATED',
    'LISTING_INQUIRY_ACCEPTED',
    'ANIMAL_LISTING_RESERVED',
    'ANIMAL_OWNERSHIP_TRANSFERRED',
    'COMMERCE_ORDER_PAID',
    'COMMERCE_SUBORDER_MOVED',
    'COMMERCE_RETURN_MOVED',
    'COMMERCE_PRICE_DROP',
    'COMMERCE_LOYALTY_ADJUSTED',
    'COMMERCE_SETTLEMENT_PAID',
  ]) {
    assert.ok(registered.has(kind), kind + ' is registered');
  }

  // A negotiation message is not an SMS: that is how people turn notifications
  // off entirely.
  const quiet = new Set(inAppOnlyKinds());
  assert.ok(quiet.has('INQUIRY_MESSAGE_POSTED'));
  assert.ok(quiet.has('COMMERCE_SUBORDER_MOVED'));
  assert.ok(quiet.has('COMMERCE_PRICE_DROP'));

  // And the loud ones are money, a deadline, or goods changing hands.
  const loud = new Set(smsKinds());
  assert.ok(loud.has('LISTING_INQUIRY_ACCEPTED'));
  assert.ok(loud.has('ANIMAL_OWNERSHIP_TRANSFERRED'));
  assert.ok(loud.has('COMMERCE_SETTLEMENT_PAID'));
  assert.ok(!loud.has('INQUIRY_MESSAGE_POSTED'));
});

test('SMS stays off entirely while the channel is off', () => {
  for (const kind of smsKinds()) {
    assert.deepEqual(channelsFor(kind, { smsEnabled: false }), ['IN_APP'], kind);
  }
  assert.ok(templateFor('COMMERCE_SETTLEMENT_PAID') !== null);
});
