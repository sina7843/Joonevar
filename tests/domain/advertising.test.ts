/**
 * Advertising package rules — Phase 2 PROMPT-011.
 *
 * The pure half of §14: how long a period is, when a package is live, where a
 * renewal starts, and why a purchase may not begin. None of it touches a
 * database, and none of it decides anything about verification or trust.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AD_PERIOD_DAYS,
  AD_PLAN_CATALOGUE,
  adState,
  isLivePackage,
  packageEnd,
  packageStart,
  planCapacityProblem,
  purchaseProblem,
  remainingDays,
} from '../../src/advertising/model.ts';

const NOW = new Date('2026-09-12T10:00:00.000Z');
const buyer = 'acc-owner';

test('the catalogue is the two paid tiers in the three periods of §14, each priced from its own setting', () => {
  assert.equal(AD_PLAN_CATALOGUE.length, 6);
  assert.deepEqual(
    AD_PLAN_CATALOGUE.map((plan) => plan.priceSettingKey),
    [
      'advertising.featured_30_toman',
      'advertising.featured_90_toman',
      'advertising.featured_365_toman',
      'advertising.pro_30_toman',
      'advertising.pro_90_toman',
      'advertising.pro_365_toman',
    ],
  );
  assert.deepEqual(AD_PERIOD_DAYS, { D30: 30, D90: 90, D365: 365 });
  // Every plan says how long it lasts in the same place the price comes from.
  for (const plan of AD_PLAN_CATALOGUE) {
    assert.equal(plan.priceSettingKey.includes(String(plan.durationDays)), true);
  }
});

test('a period ends by its own date, and nothing writes the expiry down', () => {
  const startsAt = new Date('2026-09-12T10:00:00.000Z');
  const endsAt = packageEnd(startsAt, 30);
  assert.equal(endsAt.toISOString(), '2026-10-12T10:00:00.000Z');
  assert.equal(packageEnd(startsAt, 365).toISOString(), '2027-09-12T10:00:00.000Z');

  const live = { status: 'ACTIVE', endsAt };
  assert.equal(adState(live, NOW), 'ACTIVE');
  assert.equal(isLivePackage(live, NOW), true);
  assert.equal(remainingDays(endsAt, NOW), 30);

  // The same stored row, read after its last moment, is simply not live.
  const later = new Date('2026-10-12T10:00:01.000Z');
  assert.equal(adState(live, later), 'EXPIRED');
  assert.equal(isLivePackage(live, later), false);
  assert.equal(remainingDays(endsAt, later), 0);

  // A stored status other than ACTIVE is reported as it stands.
  assert.equal(adState({ status: 'PENDING_PAYMENT', endsAt: null }, NOW), 'PENDING_PAYMENT');
  assert.equal(adState({ status: 'CANCELLED', endsAt }, NOW), 'CANCELLED');
  assert.equal(adState({ status: 'PAYMENT_FAILED', endsAt: null }, NOW), 'PAYMENT_FAILED');
});

test('renewing early keeps the days already paid for; a lapsed package starts now', () => {
  const liveEnd = new Date('2026-10-12T10:00:00.000Z');
  assert.equal(packageStart(liveEnd, NOW).toISOString(), liveEnd.toISOString());
  assert.equal(packageEnd(packageStart(liveEnd, NOW), 30).toISOString(), '2026-11-11T10:00:00.000Z');

  const lapsed = new Date('2026-09-01T10:00:00.000Z');
  assert.equal(packageStart(lapsed, NOW).toISOString(), NOW.toISOString());
  assert.equal(packageStart(null, NOW).toISOString(), NOW.toISOString());
});

test('only the manager of a claimed record buys, and only a priced plan with a free slot', () => {
  const ok = {
    ownerAccountId: buyer,
    actorAccountId: buyer,
    planActive: true,
    priceConfigured: true,
    pendingExists: false,
    activeOfPlan: 0,
    slotCapacity: null,
  };
  assert.equal(purchaseProblem(ok), null);

  assert.match(purchaseProblem({ ...ok, ownerAccountId: null }) ?? '', /مدیری ندارد/);
  assert.match(purchaseProblem({ ...ok, actorAccountId: 'acc-other' }) ?? '', /مدیر خودش/);
  assert.match(purchaseProblem({ ...ok, planActive: false }) ?? '', /ارائه نمی‌شود/);
  assert.match(purchaseProblem({ ...ok, priceConfigured: false }) ?? '', /قیمت/);
  assert.match(purchaseProblem({ ...ok, pendingExists: true }) ?? '', /در انتظار پرداخت/);
  assert.match(purchaseProblem({ ...ok, activeOfPlan: 3, slotCapacity: 3 }) ?? '', /ظرفیت/);
  // A free slot under the ceiling still sells.
  assert.equal(purchaseProblem({ ...ok, activeOfPlan: 2, slotCapacity: 3 }), null);
  // No ceiling recorded is not a decision to sell an unlimited number.
  assert.equal(purchaseProblem({ ...ok, activeOfPlan: 99, slotCapacity: null }), null);
});

test('capacity is a whole number the panel may leave unset', () => {
  assert.equal(planCapacityProblem(null), null);
  assert.equal(planCapacityProblem(0), null);
  assert.equal(planCapacityProblem(25), null);
  assert.match(planCapacityProblem(-1) ?? '', /صفر یا بیشتر/);
  assert.match(planCapacityProblem(2.5) ?? '', /عدد صحیح/);
  assert.match(planCapacityProblem(20_000) ?? '', /بزرگ/);
});
