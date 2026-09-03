import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, productSettings } from '../../src/db/schema/core.ts';
import {
  listSettingsForActor,
  readInt,
  readMoney,
  readSetting,
  readSettingForActor,
  snapshotSetting,
  unconfiguredKeys,
  updateSetting,
} from '../../src/settings/service.ts';
import { auditTrail } from '../../src/audit/service.ts';
import type { Actor, ActorContextName } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

async function withDb(fn: (testDb: TestDb, actorFor: (c: ActorContextName) => Actor) => Promise<void>) {
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    const accountId = await createTestAccount(testDb.db, '09990000900');
    const actorFor = (context: ActorContextName): Actor => ({
      accountId: accountId as AccountId,
      context,
      activeRoles: [],
    });
    await fn(testDb, actorFor);
  } finally {
    await testDb.drop();
  }
}

test('seed installs the approved product configuration and nothing invented', async () => {
  await withDb(async (testDb) => {
    assert.equal(await readInt(testDb.db, 'referral.validity_days'), 21);

    const fee = await readMoney(testDb.db, 'fee.membership_toman');
    assert.equal(fee.configured, true);
    assert.equal(fee.configured && fee.toman, 300000n);

    // Documented policy values are present and readable (§17.2).
    assert.equal(await readInt(testDb.db, 'cooldown.male_days'), 14);
    assert.equal(await readInt(testDb.db, 'cooldown.female_months'), 6);
  });
});

test('a cleared tariff becomes NOT_CONFIGURED rather than zero', async () => {
  await withDb(async (testDb, actorFor) => {
    // The catalogue now ships starting figures so the product is usable from the
    // first run; they are operator data, not announced tariffs.
    for (const key of [
      'fee.registration_sheet_toman',
      'fee.pedigree_toman',
      'fee.mating_permit_toman',
      'fee.kennel_registration_toman',
      'fee.puppy_card_toman',
      'genetics_centre.test_fee_toman',
    ]) {
      const value = await readMoney(testDb.db, key);
      assert.equal(value.configured, true, key + ' must carry its starting figure');
    }

    // What must never be invented is a financial destination: the centre's card
    // number stays empty until someone enters the real one.
    assert.equal((await readSetting(testDb.db, 'genetics_centre.payment_card')).value, null);

    // Clearing a tariff is an operator decision, and it takes the amount back to
    // NOT_CONFIGURED — never to zero.
    await updateSetting(testDb.db, actorFor('SUPERADMIN'), {
      key: 'fee.pedigree_toman',
      value: null,
      reason: 'SYNTHETIC — بازگرداندن به تعیین‌نشده',
    });
    const cleared = await readMoney(testDb.db, 'fee.pedigree_toman');
    assert.equal(cleared.configured, false);

    // Snapshotting a missing amount fails loudly instead of snapshotting 0.
    await assert.rejects(() => snapshotSetting(testDb.db, 'fee.pedigree_toman'), /not configured/);

    const missing = await unconfiguredKeys(testDb.db);
    assert.ok(missing.includes('fee.pedigree_toman'));
    assert.ok(!missing.includes('referral.validity_days'));
    assert.ok(!missing.includes('fee.puppy_card_toman'), 'a filled tariff is not reported as missing');
  });
});

test('the approved issuer registry starts empty', async () => {
  await withDb(async (testDb) => {
    const { pedigreeIssuers, referenceBreeds } = await import('../../src/db/schema/core.ts');
    const issuers = await testDb.db.select().from(pedigreeIssuers);
    assert.equal(issuers.length, 0, 'no issuer name may be invented (D14)');
    const breeds = await testDb.db.select().from(referenceBreeds);
    assert.equal(breeds.length, 10);
  });
});

test('settings permissions are scoped per group, not per shell', async () => {
  await withDb(async (testDb, actorFor) => {
    const superadmin = actorFor('SUPERADMIN');
    const association = actorFor('ASSOCIATION_OPERATOR');
    const genetics = actorFor('GENETICS_OPERATOR');
    const user = actorFor('USER');
    const vet = actorFor('TRUSTED_VET');

    // A plain user or a vet has no settings surface at all.
    assert.deepEqual(await listSettingsForActor(testDb.db, user), []);
    assert.deepEqual(await listSettingsForActor(testDb.db, vet), []);
    await assert.rejects(() => readSettingForActor(testDb.db, user, 'fee.membership_toman'), /may not read/);

    // The association operator sees fees but cannot change them.
    assert.ok((await listSettingsForActor(testDb.db, association)).some((s) => s.key === 'fee.membership_toman'));
    await assert.rejects(
      () => updateSetting(testDb.db, association, { key: 'fee.membership_toman', value: '1' }),
      /may not change/,
    );

    // The genetics operator reads its own centre group and nothing from fees.
    const geneticsKeys = (await listSettingsForActor(testDb.db, genetics)).map((s) => s.key);
    assert.ok(geneticsKeys.includes('genetics_centre.name'));
    assert.ok(!geneticsKeys.includes('fee.pedigree_toman'));
    await assert.rejects(() => readSettingForActor(testDb.db, genetics, 'referral.validity_days'), /may not read/);

    // Reference data is the association operator's own responsibility.
    const updated = await updateSetting(testDb.db, association, {
      key: 'guide_text.vet_pricing_notice',
      value: 'برای اطلاع دقیق از قیمت‌ها با دامپزشک یا مرکز تماس بگیرید.',
    });
    assert.equal(updated.version, 2);

    // Superadmin may write fees.
    const fee = await updateSetting(testDb.db, superadmin, {
      key: 'fee.pedigree_toman',
      value: '450000',
      reason: 'ورود تعرفه اعلام‌شده',
    });
    assert.equal(fee.configured, true);
  });
});

test('the documented cooldown policy is readable but not writable by anyone', async () => {
  await withDb(async (testDb, actorFor) => {
    const superadmin = actorFor('SUPERADMIN');
    assert.equal((await readSettingForActor(testDb.db, superadmin, 'cooldown.female_months')).value, 6);
    await assert.rejects(
      () => updateSetting(testDb.db, superadmin, { key: 'cooldown.female_months', value: 3 }),
      /may not change settings group BREEDING_POLICY/,
    );
    assert.equal(await readInt(testDb.db, 'cooldown.female_months'), 6);
  });
});

test('every write bumps the version and records actor, time and before/after', async () => {
  await withDb(async (testDb, actorFor) => {
    const superadmin = actorFor('SUPERADMIN');
    const before = await readSetting(testDb.db, 'referral.validity_days');
    assert.equal(before.version, 1);

    const after = await updateSetting(testDb.db, superadmin, {
      key: 'referral.validity_days',
      value: 30,
      reason: 'تصمیم عملیاتی',
      expectedVersion: 1,
    });
    assert.equal(after.value, 30);
    assert.equal(after.version, 2);

    const trail = await auditTrail(testDb.db, { targetType: 'PRODUCT_SETTING', targetId: 'referral.validity_days' }, {
      page: 1,
      pageSize: 10,
    });
    assert.equal(trail.total, 1);
    const [event] = trail.items;
    assert.equal(event?.action, 'PRODUCT_SETTING_UPDATED');
    assert.equal(event?.actorAccountId, superadmin.accountId);
    assert.equal(event?.actorContext, 'SUPERADMIN');
    assert.equal(event?.targetVersion, 2);
    assert.deepEqual(event?.before, { value: 21, version: 1, configured: true });
    assert.deepEqual(event?.after, { value: 30, version: 2, configured: true });
    assert.equal(event?.reason, 'تصمیم عملیاتی');
    assert.ok(event?.occurredAt instanceof Date);
  });
});

test('a write against a stale version is rejected', async () => {
  await withDb(async (testDb, actorFor) => {
    const superadmin = actorFor('SUPERADMIN');
    await updateSetting(testDb.db, superadmin, { key: 'referral.validity_days', value: 25 });
    await assert.rejects(
      () => updateSetting(testDb.db, superadmin, { key: 'referral.validity_days', value: 26, expectedVersion: 1 }),
      /changed by someone else/,
    );
    assert.equal(await readInt(testDb.db, 'referral.validity_days'), 25);
  });
});

test('values are validated before they are stored', async () => {
  await withDb(async (testDb, actorFor) => {
    const superadmin = actorFor('SUPERADMIN');
    await assert.rejects(() => updateSetting(testDb.db, superadmin, { key: 'referral.validity_days', value: 0 }), /at least/);
    await assert.rejects(() => updateSetting(testDb.db, superadmin, { key: 'otp.ttl_seconds', value: 5 }), /at least/);
    await assert.rejects(() => updateSetting(testDb.db, superadmin, { key: 'fee.pedigree_toman', value: '12.5' }), /integer/);
    await assert.rejects(() => updateSetting(testDb.db, superadmin, { key: 'fee.pedigree_toman', value: '-1' }), /negative/);
    await assert.rejects(() => updateSetting(testDb.db, superadmin, { key: 'no.such.key', value: 1 }), /Unknown product setting/);
  });
});

test('a monetary setting can be cleared back to NOT_CONFIGURED, and that is audited', async () => {
  await withDb(async (testDb, actorFor) => {
    const superadmin = actorFor('SUPERADMIN');
    await updateSetting(testDb.db, superadmin, { key: 'fee.pedigree_toman', value: '450000' });
    const cleared = await updateSetting(testDb.db, superadmin, { key: 'fee.pedigree_toman', value: null });
    assert.equal(cleared.configured, false);
    assert.equal((await readMoney(testDb.db, 'fee.pedigree_toman')).configured, false);

    const events = await testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetId, 'fee.pedigree_toman'));
    assert.equal(events.length, 2);
  });
});

test('re-running the seed preserves operator-modified values', async () => {
  const testDb = await createTestDb();
  try {
    const first = await seedBaseline(testDb.db);
    assert.ok(first.settingsInserted.includes('referral.validity_days'));
    assert.equal(first.settingsPreserved.length, 0);
    assert.equal(first.breedsInserted, 10);

    const accountId = await createTestAccount(testDb.db, '09990000901');
    const superadmin: Actor = { accountId: accountId as AccountId, context: 'SUPERADMIN', activeRoles: [] };

    await updateSetting(testDb.db, superadmin, { key: 'referral.validity_days', value: 30 });
    await updateSetting(testDb.db, superadmin, { key: 'fee.membership_toman', value: '350000' });
    // Deliberately cleared: a redeploy must not restore the documented baseline.
    await updateSetting(testDb.db, superadmin, { key: 'fee.membership_toman', value: null });

    const second = await seedBaseline(testDb.db);
    assert.equal(second.settingsInserted.length, 0);
    assert.ok(second.settingsPreserved.includes('referral.validity_days'));
    assert.equal(second.breedsInserted, 0, 'reference data is not duplicated');

    assert.equal(await readInt(testDb.db, 'referral.validity_days'), 30);
    assert.equal((await readMoney(testDb.db, 'fee.membership_toman')).configured, false);

    const rows = await testDb.db.select().from(productSettings).where(eq(productSettings.key, 'referral.validity_days'));
    assert.equal(rows.length, 1, 'seed must not create a duplicate row');
    assert.equal(rows[0]?.version, 2);
  } finally {
    await testDb.drop();
  }
});
