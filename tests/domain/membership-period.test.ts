/**
 * The shared period arithmetic and the membership validity rule — Phase 2.5 PROMPT-009.
 *
 * Boundary instants matter here: a membership that ends at midnight is not valid
 * at midnight, and a period bought in Tehran is bought as an instant, not as a
 * wall-clock date, so the same instant reads the same everywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysLeft, periodEnd, periodStanding, periodStart, reminderDue, stillHolds } from '../../src/domain/period.ts';
import {
  APPLICABLE_MEMBERSHIP_STATUSES,
  MEMBERSHIP_DECISION_OUTCOME,
  MEMBERSHIP_TARIFF_KEY,
  PAYABLE_MEMBERSHIP_STATUSES,
  membershipIsValid,
} from '../../src/billing/membership-model.ts';

const at = (iso: string) => new Date(iso);

test('a period ends at its instant: valid a millisecond before, over at the instant itself', () => {
  const ends = at('2026-06-01T00:00:00Z');
  const timed = { status: 'ACTIVE' as const, lifetime: false, currentPeriodEndsAt: ends };
  assert.equal(membershipIsValid(timed, new Date(ends.getTime() - 1)), true);
  assert.equal(membershipIsValid(timed, ends), false, 'the boundary instant is already outside');
  assert.equal(membershipIsValid(timed, new Date(ends.getTime() + 1)), false);
});

test('the same instant is the same membership everywhere, whatever the local clock reads', () => {
  // 2026-05-31T20:31:00Z is already 2026-06-01 in Tehran (+03:30) but not in London.
  const ends = at('2026-05-31T20:31:00Z');
  const timed = { status: 'ACTIVE' as const, lifetime: false, currentPeriodEndsAt: ends };
  const justBefore = at('2026-05-31T20:30:59Z');
  assert.equal(membershipIsValid(timed, justBefore), true);
  assert.equal(justBefore.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' }), '2026-06-01', 'Tehran already calls it tomorrow');
  assert.equal(justBefore.toLocaleDateString('en-CA', { timeZone: 'UTC' }), '2026-05-31', 'UTC still calls it today');
  assert.equal(membershipIsValid(timed, ends), false, 'validity follows the instant, not either calendar');
});

test('a lifetime membership never expires, and suspension or revocation outranks any window', () => {
  const far = at('2099-01-01T00:00:00Z');
  assert.equal(membershipIsValid({ status: 'ACTIVE', lifetime: true, currentPeriodEndsAt: null }, far), true);
  assert.equal(membershipIsValid({ status: 'SUSPENDED', lifetime: true, currentPeriodEndsAt: null }, far), false);
  assert.equal(membershipIsValid({ status: 'REVOKED', lifetime: false, currentPeriodEndsAt: addDays(far, 365) }, far), false);
  assert.equal(membershipIsValid({ status: 'SUSPENDED', lifetime: false, currentPeriodEndsAt: addDays(far, 365) }, far), false);
  assert.equal(membershipIsValid({ status: 'EXPIRED', lifetime: false, currentPeriodEndsAt: addDays(far, 365) }, far), false, 'an expired row is not valid even with a window');
  assert.equal(membershipIsValid({ status: 'ACTIVE', lifetime: false, currentPeriodEndsAt: null }, far), false, 'a timed membership without a window is not valid');
});

test('renewal stacks: the next period starts where the live one ends, and a lapsed one starts today', () => {
  const liveEnd = at('2026-06-01T00:00:00Z');
  const early = at('2026-05-01T00:00:00Z');
  assert.deepEqual(periodStart(liveEnd, early), liveEnd, 'no paid day is lost and none is bought twice');
  assert.deepEqual(periodEnd(periodStart(liveEnd, early), 365), addDays(liveEnd, 365));
  const late = at('2026-08-01T00:00:00Z');
  assert.deepEqual(periodStart(liveEnd, late), late, 'a lapsed membership buys from today');
  assert.deepEqual(periodStart(null, late), late);
  assert.throws(() => periodEnd(late, 0, 'طول دوره عضویت معتبر نیست.'), /طول دوره عضویت/);
});

test('grace delays the consequence, and a reminder exists only inside a configured window', () => {
  const period = { status: 'ACTIVE' as const, startsAt: at('2025-06-01T00:00:00Z'), endsAt: at('2026-06-01T00:00:00Z'), graceDays: 10 };
  assert.equal(periodStanding(period, at('2026-05-31T23:59:59Z')), 'ACTIVE');
  assert.equal(periodStanding(period, at('2026-06-05T00:00:00Z')), 'GRACE');
  assert.equal(periodStanding(period, at('2026-06-11T00:00:01Z')), 'EXPIRED');
  assert.equal(periodStanding({ ...period, graceDays: null }, at('2026-06-01T00:00:01Z')), 'EXPIRED', 'no configured grace means none');
  assert.deepEqual((['ACTIVE', 'GRACE'] as const).map(stillHolds), [true, true]);
  assert.deepEqual((['NONE', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'] as const).map(stillHolds), [false, false, false, false]);

  assert.equal(reminderDue(period, null, at('2026-05-30T00:00:00Z')), false, 'no window, no reminder');
  assert.equal(reminderDue(period, 30, at('2026-04-01T00:00:00Z')), false);
  assert.equal(reminderDue(period, 30, at('2026-05-03T00:00:00Z')), true);
  assert.equal(reminderDue(period, 30, at('2026-06-02T00:00:00Z')), false, 'past the end it is an expiry, not a reminder');
  assert.equal(daysLeft(at('2026-06-01T00:00:00Z'), at('2026-05-30T06:00:00Z')), 2);
  assert.equal(daysLeft(at('2026-05-01T00:00:00Z'), at('2026-06-01T00:00:00Z')), 0);
});

test('the review decides what happens next, and each kind is paid under its own tariff key', () => {
  assert.deepEqual(MEMBERSHIP_DECISION_OUTCOME.APPROVE, { application: 'APPROVED', membership: 'APPROVED_AWAITING_PAYMENT' });
  assert.deepEqual(MEMBERSHIP_DECISION_OUTCOME.REQUEST_CORRECTION, { application: 'NEEDS_CORRECTION', membership: 'NEEDS_CORRECTION' });
  assert.deepEqual(MEMBERSHIP_DECISION_OUTCOME.REJECT, { application: 'REJECTED', membership: 'REJECTED' });
  assert.ok(!PAYABLE_MEMBERSHIP_STATUSES.includes('PENDING_REVIEW'), 'a case still in review pays nothing');
  assert.ok(!PAYABLE_MEMBERSHIP_STATUSES.includes('SUSPENDED'), 'a suspended membership is not renewed by paying');
  assert.ok(APPLICABLE_MEMBERSHIP_STATUSES.includes('EXPIRED'));
  assert.deepEqual(MEMBERSHIP_TARIFF_KEY, { INITIAL: 'fee.membership_toman', RENEWAL: 'membership.renewal_toman' });
});
