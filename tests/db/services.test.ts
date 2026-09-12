/**
 * Service pages against managed data — Phase 2 PROMPT-013.
 *
 * The page text is fixed; the figures are not. This checks that a fee is read
 * from the setting at request time, that a fee nobody entered is reported as
 * unconfigured rather than as zero or free, and that an approved notice comes
 * from the same managed data.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { serviceView, serviceViews } from '../../src/services/service.ts';
import { SERVICE_CATALOGUE } from '../../src/services/catalogue.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let admin: Actor;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  admin = actorFor(await createTestAccount(testDb.db, '09990680001'), 'SUPERADMIN');
});

after(async () => {
  await testDb?.drop();
});

test('a fee is read from its setting, and a changed tariff changes the page', async () => {
  const view = await serviceView(testDb.db, 'membership');
  assert.ok(view);
  assert.equal(view!.fee?.configured, true, 'the membership fee is seeded from a documented figure');
  assert.equal(view!.feeFa, '۳۰۰٬۰۰۰ تومان');

  await updateSetting(testDb.db, admin, {
    key: 'fee.membership_toman',
    value: '450000',
    reason: 'آزمون خواندن هزینه از تنظیمات',
  });
  const updated = await serviceView(testDb.db, 'membership');
  assert.equal(updated!.feeFa, '۴۵۰٬۰۰۰ تومان', 'the page follows the managed figure');
});

test('a tariff nobody entered is reported as unconfigured, never as free', async () => {
  await updateSetting(testDb.db, admin, {
    key: 'fee.pedigree_toman',
    value: null,
    reason: 'برگرداندن به وضعیت تعیین‌نشده برای آزمون',
  });
  const view = await serviceView(testDb.db, 'pedigree');
  assert.equal(view!.fee?.configured, false);
  assert.equal(view!.feeFa, null, 'no number is produced for a tariff that does not exist');
});

test('a service without a Hamzist fee says so instead of showing a figure', async () => {
  const view = await serviceView(testDb.db, 'vet-visit');
  assert.equal(view!.service.feeSettingKey, null);
  assert.equal(view!.fee, null);
  assert.equal(view!.feeFa, null);
  // The approved notice is managed text, not a sentence written into the page.
  assert.equal(view!.noticeFa, 'برای اطلاع دقیق از قیمت‌ها با دامپزشک یا مرکز تماس بگیرید.');
});

test('the list answers for every service, and an unknown address is simply not found', async () => {
  const views = await serviceViews(testDb.db);
  assert.equal(views.length, SERVICE_CATALOGUE.length);
  assert.deepEqual(
    views.map((view) => view.service.slug),
    SERVICE_CATALOGUE.map((service) => service.slug),
  );
  assert.equal(await serviceView(testDb.db, 'no-such-service'), null);
  assert.equal(await serviceView(testDb.db, '../secret'), null);
});
