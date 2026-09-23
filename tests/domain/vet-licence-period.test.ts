/** The arithmetic of a paid licence period — Phase 2.5 PROMPT-008. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LICENCE_PERIOD_SERVICE,
  LICENCE_TARIFF_KEY,
  addDays,
  daysLeft,
  holdsLicensedTag,
  periodEnd,
  periodStanding,
  periodStart,
  reminderDue,
} from '../../src/vets/licence-period-model.ts';

const at = (iso: string) => new Date(iso);
const paid = (endsAt: string, graceDays: number | null = null) =>
  ({ status: 'ACTIVE', startsAt: at('2026-01-01T00:00:00Z'), endsAt: at(endsAt), graceDays }) as const;

test('a renewal starts where the live period ends, so no paid day is lost and no day is bought twice', () => {
  const liveEnd = at('2026-06-01T00:00:00Z');
  const now = at('2026-05-20T00:00:00Z');
  assert.deepEqual(periodStart(liveEnd, now), liveEnd, 'renewing early continues the live period');
  assert.deepEqual(periodEnd(periodStart(liveEnd, now), 365), addDays(liveEnd, 365));

  // A period that already ended buys time from now, not from the past.
  assert.deepEqual(periodStart(at('2026-05-01T00:00:00Z'), now), now);
  assert.deepEqual(periodStart(null, now), now, 'a first activation starts now');
  assert.throws(() => periodEnd(now, 0), /طول دوره/);
});

test('a period is active until it ends, then sits in whatever grace was bought, then is expired', () => {
  const ends = '2026-06-01T00:00:00Z';
  assert.equal(periodStanding(paid(ends), at('2026-05-31T23:00:00Z')), 'ACTIVE');
  assert.equal(periodStanding(paid(ends), at('2026-06-01T00:00:01Z')), 'EXPIRED', 'no grace means the downgrade is at the end');
  assert.equal(periodStanding(paid(ends, 10), at('2026-06-05T00:00:00Z')), 'GRACE');
  assert.equal(periodStanding(paid(ends, 10), at('2026-06-11T00:00:01Z')), 'EXPIRED');
  assert.equal(periodStanding(null, at(ends)), 'NONE');
  assert.equal(periodStanding({ status: 'PENDING_PAYMENT', startsAt: null, endsAt: null, graceDays: null }, at(ends)), 'PENDING_PAYMENT');
  assert.equal(periodStanding({ status: 'CANCELLED', startsAt: null, endsAt: null, graceDays: null }, at(ends)), 'CANCELLED');

  assert.deepEqual((['ACTIVE', 'GRACE'] as const).map(holdsLicensedTag), [true, true], 'grace still carries the licensed tag');
  assert.deepEqual((['NONE', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'] as const).map(holdsLicensedTag), [false, false, false, false]);
});

test('a reminder is due only inside a configured window before the end, and never invented', () => {
  const period = paid('2026-06-01T00:00:00Z');
  assert.equal(reminderDue(period, null, at('2026-05-30T00:00:00Z')), false, 'no configured window, no reminder');
  assert.equal(reminderDue(period, 30, at('2026-04-01T00:00:00Z')), false, 'still outside the window');
  assert.equal(reminderDue(period, 30, at('2026-05-10T00:00:00Z')), true);
  assert.equal(reminderDue(period, 30, at('2026-06-02T00:00:00Z')), false, 'past the end it is an expiry, not a reminder');
  assert.equal(reminderDue({ status: 'PENDING_PAYMENT', startsAt: null, endsAt: null, graceDays: null }, 30, at('2026-05-10T00:00:00Z')), false);
});

test('days left never goes negative, and each kind is paid under its own service and tariff key', () => {
  assert.equal(daysLeft(at('2026-06-01T00:00:00Z'), at('2026-05-30T00:00:00Z')), 2);
  assert.equal(daysLeft(at('2026-05-01T00:00:00Z'), at('2026-06-01T00:00:00Z')), 0);
  assert.deepEqual(LICENCE_PERIOD_SERVICE, { ACTIVATION: 'VET_LICENSE_ACTIVATION', RENEWAL: 'VET_LICENSE_RENEWAL' });
  assert.deepEqual(LICENCE_TARIFF_KEY, { ACTIVATION: 'vet_licence.activation_toman', RENEWAL: 'vet_licence.renewal_toman' });
});
