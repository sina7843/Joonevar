/**
 * Advertising packages — Phase 2 PROMPT-011.
 *
 * Runs against a freshly migrated database: the seeded catalogue with no price
 * yet, who may buy, what a verified payment activates, what a replayed callback
 * does not do a second time, how a renewal stacks, how a slot ceiling refuses a
 * sale, and what cancelling keeps.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor, payingGateway } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { adPlans, adSubscriptions } from '../../src/db/schema/advertising.ts';
import { paymentItems } from '../../src/db/schema/billing.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { assignCommunityOwner, createCommunity } from '../../src/communities/service.ts';
import {
  allPackages,
  cancelPackage,
  listPlans,
  livePackage,
  myPackages,
  myTargets,
  promotedTargetIds,
  startPackagePurchase,
  subscriptionsOf,
  updatePlan,
} from '../../src/advertising/service.ts';
import { adState, remainingDays } from '../../src/advertising/model.ts';
import type { Actor } from '../../src/authz/actor.ts';

const FEATURED_30 = 'advertising.featured_30_toman';
const PRO_30 = 'advertising.pro_30_toman';

let testDb: TestDb;
let admin: Actor;
let owner: Actor;
let ownerMobile: string;
let stranger: Actor;
let counter = 0;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  admin = actorFor(await createTestAccount(testDb.db, '09990660001'), 'SUPERADMIN');
  ownerMobile = '09990660002';
  owner = actorFor(await createTestAccount(testDb.db, ownerMobile));
  stranger = actorFor(await createTestAccount(testDb.db, '09990660003'));
});

after(async () => {
  await testDb?.drop();
});

/** A club handed to the buyer, which is what a package is bought for. */
async function ownedCommunity(label: string, ownerActor: Actor = owner, mobile: string = ownerMobile) {
  counter += 1;
  const created = await createCommunity(testDb.db, admin, {
    kind: 'CLUB',
    displayNameFa: label + ' ' + counter,
    reason: 'ثبت برای آزمون بسته',
  });
  const handed = await assignCommunityOwner(testDb.db, admin, {
    communityId: created.id,
    expectedVersion: created.version,
    mobile,
    reason: 'واگذاری برای آزمون',
  });
  assert.equal(handed.ownerAccountId, ownerActor.accountId);
  return handed;
}

async function planIdFor(settingKey: string): Promise<string> {
  const [row] = await testDb.db.select().from(adPlans).where(eq(adPlans.priceSettingKey, settingKey)).limit(1);
  return row!.id;
}

async function setPrice(settingKey: string, toman: string | null): Promise<void> {
  const current = (await listPlans(testDb.db)).find((entry) => entry.plan.priceSettingKey === settingKey)!;
  await updateSetting(testDb.db, admin, {
    key: settingKey,
    value: toman,
    reason: 'مبلغ واقعی بسته برای آزمون',
    expectedVersion: undefined,
  });
  assert.ok(current);
}

/** Take one purchase all the way through a verified payment. */
async function buyAndPay(targetId: string, settingKey: string, amountToman: bigint) {
  const intent = await startPackagePurchase(testDb.db, owner, {
    targetType: 'COMMUNITY',
    targetId,
    planId: await planIdFor(settingKey),
  });
  const gateway = payingGateway(amountToman * 10n);
  const started = await startAttempt(
    testDb.db,
    owner,
    { batchId: intent.batch.id, callbackUrl: '/account/packages/return' },
    gateway,
    'test-gateway',
  );
  const outcome = await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);
  return { intent, started, outcome, gateway };
}

test('the catalogue is seeded with no price at all, and an unpriced plan cannot be sold', async () => {
  const plans = await listPlans(testDb.db);
  assert.equal(plans.length, 6);
  assert.equal(
    plans.every((entry) => entry.price.configured === false),
    true,
    'a seeded plan must never carry an invented tariff',
  );
  assert.equal(plans.every((entry) => entry.plan.isActive === 1), true);

  const community = await ownedCommunity('کلاب بی‌قیمت');
  await assert.rejects(
    startPackagePurchase(testDb.db, owner, {
      targetType: 'COMMUNITY',
      targetId: community.id,
      planId: await planIdFor(FEATURED_30),
    }),
    /قیمت/,
  );
  // Nothing was written for a purchase that could not start.
  assert.equal((await subscriptionsOf(testDb.db, 'COMMUNITY', community.id)).length, 0);
});

test('only the manager of a claimed record buys, and the amount is frozen from managed settings', async () => {
  await setPrice(FEATURED_30, '500000');
  const community = await ownedCommunity('کلاب خرید');
  const planId = await planIdFor(FEATURED_30);

  await assert.rejects(
    startPackagePurchase(testDb.db, stranger, { targetType: 'COMMUNITY', targetId: community.id, planId }),
    /مدیر خودش/,
  );
  await assert.rejects(
    startPackagePurchase(testDb.db, admin, { targetType: 'COMMUNITY', targetId: community.id, planId }),
    /از این محیط ممکن نیست/,
  );
  const unowned = await createCommunity(testDb.db, admin, {
    kind: 'CLUB',
    displayNameFa: 'کلاب بدون مالک ' + Date.now(),
    reason: 'آزمون',
  });
  await assert.rejects(
    startPackagePurchase(testDb.db, owner, { targetType: 'COMMUNITY', targetId: unowned.id, planId }),
    /مدیری ندارد/,
  );
  await assert.rejects(
    startPackagePurchase(testDb.db, owner, { targetType: 'COMMUNITY', targetId: community.id, planId: community.id }),
    /بسته پیدا نشد/,
  );

  const intent = await startPackagePurchase(testDb.db, owner, { targetType: 'COMMUNITY', targetId: community.id, planId });
  assert.equal(intent.subscription.status, 'PENDING_PAYMENT');
  assert.equal(intent.subscription.startsAt, null);
  assert.equal(intent.batch.service, 'ADVERTISING_PACKAGE');
  const [item] = await testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, intent.batch.id));
  assert.equal(item!.amountToman, '500000');
  assert.equal(item!.settingKey, FEATURED_30);
  assert.equal(item!.targetType, 'AD_SUBSCRIPTION');

  // A second intent for the same record would hide the first one.
  await assert.rejects(
    startPackagePurchase(testDb.db, owner, { targetType: 'COMMUNITY', targetId: community.id, planId }),
    /در انتظار پرداخت/,
  );
  // Raising the tariff afterwards does not rewrite what this purchase froze.
  await setPrice(FEATURED_30, '900000');
  const [again] = await testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, intent.batch.id));
  assert.equal(again!.amountToman, '500000');
  await setPrice(FEATURED_30, '500000');
});

test('a verified payment activates the package once, and a replayed return changes nothing', async () => {
  await setPrice(FEATURED_30, '500000');
  const community = await ownedCommunity('کلاب پرداخت');
  const { intent, started, outcome, gateway } = await buyAndPay(community.id, FEATURED_30, 500_000n);
  assert.equal(outcome.state, 'PAID');

  const [active] = await testDb.db.select().from(adSubscriptions).where(eq(adSubscriptions.id, intent.subscription.id));
  assert.equal(active!.status, 'ACTIVE');
  assert.ok(active!.startsAt instanceof Date);
  assert.ok(active!.endsAt instanceof Date);
  assert.equal(remainingDays(active!.endsAt), 30);
  assert.equal(adState(active!), 'ACTIVE');

  const live = await livePackage(testDb.db, 'COMMUNITY', community.id);
  assert.equal(live?.id, intent.subscription.id);
  assert.equal((await promotedTargetIds(testDb.db, 'COMMUNITY')).has(community.id), true);
  // A package belongs to one directory only.
  assert.equal((await promotedTargetIds(testDb.db, 'CENTRE')).has(community.id), false);

  const told = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, owner.accountId), eq(notifications.kind, 'AD_PACKAGE_ACTIVATED')));
  assert.equal(told.length, 1);
  const audits = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, intent.subscription.id), eq(auditEvents.action, 'AD_PACKAGE_ACTIVATED')));
  assert.equal(audits.length, 1);

  // The same return delivered twice finds the work already done.
  const replay = await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);
  assert.equal(replay.state, 'PAID');
  assert.equal(replay.performed, false);
  const [unchanged] = await testDb.db.select().from(adSubscriptions).where(eq(adSubscriptions.id, intent.subscription.id));
  assert.equal(unchanged!.version, active!.version);
  assert.equal(
    (
      await testDb.db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.targetId, intent.subscription.id), eq(auditEvents.action, 'AD_PACKAGE_ACTIVATED')))
    ).length,
    1,
  );
});

test('renewing while a package is live starts the new period where the live one ends', async () => {
  await setPrice(FEATURED_30, '500000');
  const community = await ownedCommunity('کلاب تمدید');
  const first = await buyAndPay(community.id, FEATURED_30, 500_000n);
  const [live] = await testDb.db.select().from(adSubscriptions).where(eq(adSubscriptions.id, first.intent.subscription.id));

  const second = await buyAndPay(community.id, FEATURED_30, 500_000n);
  assert.equal(second.outcome.state, 'PAID');
  const [renewal] = await testDb.db.select().from(adSubscriptions).where(eq(adSubscriptions.id, second.intent.subscription.id));
  assert.equal(renewal!.status, 'ACTIVE');
  assert.equal(renewal!.startsAt!.toISOString(), live!.endsAt!.toISOString());
  assert.equal(remainingDays(renewal!.endsAt), 60);
  // Both rows stay: §14 asks for the history, not for an overwritten period.
  assert.equal((await subscriptionsOf(testDb.db, 'COMMUNITY', community.id)).length, 2);
  assert.equal((await myPackages(testDb.db, owner)).some((row) => row.id === renewal!.id), true);
});

test('a period that has run out stops promoting the record without any job writing it down', async () => {
  await setPrice(FEATURED_30, '500000');
  const community = await ownedCommunity('کلاب منقضی');
  const { intent } = await buyAndPay(community.id, FEATURED_30, 500_000n);

  const past = new Date(Date.now() - 60_000);
  await testDb.db
    .update(adSubscriptions)
    .set({ startsAt: new Date(past.getTime() - 86_400_000), endsAt: past })
    .where(eq(adSubscriptions.id, intent.subscription.id));

  const [row] = await testDb.db.select().from(adSubscriptions).where(eq(adSubscriptions.id, intent.subscription.id));
  // The stored status is untouched; only the reader calls it expired.
  assert.equal(row!.status, 'ACTIVE');
  assert.equal(adState(row!), 'EXPIRED');
  assert.equal(await livePackage(testDb.db, 'COMMUNITY', community.id), null);
  assert.equal((await promotedTargetIds(testDb.db, 'COMMUNITY')).has(community.id), false);
  await assert.rejects(
    cancelPackage(testDb.db, owner, { subscriptionId: row!.id, expectedVersion: row!.version, reason: 'دیر' }),
    /منقضی/,
  );
  // An expired package does not block buying the next one.
  const next = await startPackagePurchase(testDb.db, owner, {
    targetType: 'COMMUNITY',
    targetId: community.id,
    planId: await planIdFor(FEATURED_30),
  });
  assert.equal(next.subscription.status, 'PENDING_PAYMENT');
});

test('the panel sets features, capacity and availability — and a full plan refuses the next sale', async () => {
  await setPrice(PRO_30, '700000');
  const planId = await planIdFor(PRO_30);
  const [before] = await testDb.db.select().from(adPlans).where(eq(adPlans.id, planId));

  await assert.rejects(
    updatePlan(testDb.db, owner, {
      planId,
      expectedVersion: before!.version,
      featuresFa: 'تلاش بدون اجازه',
      slotCapacity: null,
      isActive: true,
      reason: 'بدون اجازه',
    }),
    /سوپرادمین/,
  );
  await assert.rejects(
    updatePlan(testDb.db, admin, {
      planId,
      expectedVersion: before!.version,
      featuresFa: 'بدون دلیل',
      slotCapacity: null,
      isActive: true,
      reason: '   ',
    }),
    /دلیل/,
  );
  await assert.rejects(
    updatePlan(testDb.db, admin, {
      planId,
      expectedVersion: before!.version,
      featuresFa: 'ظرفیت نادرست',
      slotCapacity: -3,
      isActive: true,
      reason: 'آزمون',
    }),
    /ظرفیت/,
  );

  const limited = await updatePlan(testDb.db, admin, {
    planId,
    expectedVersion: before!.version,
    featuresFa: 'یک جایگاه در هر زمان',
    slotCapacity: 1,
    isActive: true,
    reason: 'محدودکردن ظرفیت برای آزمون',
  });
  assert.equal(limited.slotCapacity, 1);
  await assert.rejects(
    updatePlan(testDb.db, admin, {
      planId,
      expectedVersion: before!.version,
      featuresFa: 'نسخه کهنه',
      slotCapacity: 1,
      isActive: true,
      reason: 'آزمون نسخه',
    }),
    /هم‌زمان تغییر/,
  );

  const first = await ownedCommunity('کلاب ظرفیت یک');
  await buyAndPay(first.id, PRO_30, 700_000n);
  const second = await ownedCommunity('کلاب ظرفیت دو');
  await assert.rejects(
    startPackagePurchase(testDb.db, owner, { targetType: 'COMMUNITY', targetId: second.id, planId }),
    /ظرفیت/,
  );

  // Taking the plan off sale refuses it even where a slot is free.
  const closed = await updatePlan(testDb.db, admin, {
    planId,
    expectedVersion: limited.version,
    featuresFa: limited.featuresFa,
    slotCapacity: 50,
    isActive: false,
    reason: 'توقف موقت فروش',
  });
  assert.equal(closed.isActive, 0);
  await assert.rejects(
    startPackagePurchase(testDb.db, owner, { targetType: 'COMMUNITY', targetId: second.id, planId }),
    /ارائه نمی‌شود/,
  );
  await updatePlan(testDb.db, admin, {
    planId,
    expectedVersion: closed.version,
    featuresFa: closed.featuresFa,
    slotCapacity: null,
    isActive: true,
    reason: 'بازگشت به فروش',
  });
});

test('cancelling keeps the dates and the reason, and only the buyer or the superadmin may do it', async () => {
  await setPrice(FEATURED_30, '500000');
  const community = await ownedCommunity('کلاب لغو');
  const { intent } = await buyAndPay(community.id, FEATURED_30, 500_000n);
  const [active] = await testDb.db.select().from(adSubscriptions).where(eq(adSubscriptions.id, intent.subscription.id));

  await assert.rejects(
    cancelPackage(testDb.db, stranger, { subscriptionId: active!.id, expectedVersion: active!.version, reason: 'غریبه' }),
    /خریدار یا سوپرادمین/,
  );
  await assert.rejects(
    cancelPackage(testDb.db, owner, { subscriptionId: active!.id, expectedVersion: active!.version, reason: '  ' }),
    /دلیل/,
  );
  await assert.rejects(
    cancelPackage(testDb.db, owner, { subscriptionId: active!.id, expectedVersion: active!.version + 5, reason: 'نسخه کهنه' }),
    /هم‌زمان تغییر/,
  );

  const cancelled = await cancelPackage(testDb.db, owner, {
    subscriptionId: active!.id,
    expectedVersion: active!.version,
    reason: 'دیگر لازم نیست',
  });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.cancelReasonFa, 'دیگر لازم نیست');
  // The period that was paid for is still on the record.
  assert.equal(cancelled.startsAt!.toISOString(), active!.startsAt!.toISOString());
  assert.equal(cancelled.endsAt!.toISOString(), active!.endsAt!.toISOString());
  assert.equal(await livePackage(testDb.db, 'COMMUNITY', community.id), null);
  await assert.rejects(
    cancelPackage(testDb.db, owner, { subscriptionId: cancelled.id, expectedVersion: cancelled.version, reason: 'دوباره' }),
    /پیش‌تر لغو/,
  );

  const audit = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, cancelled.id), eq(auditEvents.action, 'AD_PACKAGE_CANCELLED')));
  assert.equal(audit[0]!.reason, 'دیگر لازم نیست');
});

test('each account sees only its own records and packages; the whole list is the superadmin’s', async () => {
  const mine = await myTargets(testDb.db, owner);
  assert.ok(mine.length > 0);
  assert.equal(mine.every((target) => target.ownerAccountId === owner.accountId), true);
  assert.equal((await myTargets(testDb.db, stranger)).length, 0);
  assert.equal((await myTargets(testDb.db, admin)).length, 0, 'an operational context manages no record of its own');

  assert.equal((await myPackages(testDb.db, stranger)).length, 0);
  await assert.rejects(allPackages(testDb.db, owner), /سوپرادمین/);
  const everything = await allPackages(testDb.db, admin);
  assert.ok(everything.length > 0);
  assert.ok(everything.every((row) => row.plan !== undefined));
});
