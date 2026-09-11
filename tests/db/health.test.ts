import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestAccount, createTestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { seedDevFixtures, FIXTURE_ACCOUNTS, FIXTURE_MOBILE_PREFIX } from '../../src/db/seed/dev-fixtures.ts';
import { healthReport } from '../../src/health/service.ts';
import { loadEnv } from '../../src/config/env.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { accountRoles, accounts } from '../../src/db/schema/core.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

const DEV_ENV = loadEnv({
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
});

test('health reports the real state of the foundation', async () => {
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    const report = await healthReport(testDb.db, DEV_ENV);

    assert.equal(report.database.reachable, true);
    assert.ok((report.database.migrationsApplied ?? 0) >= 1);
    assert.ok(report.settings.total >= 20);

    // The local mocks are reported as what they are: usable here, never a
    // verified integration.
    const sms = report.adapters.find((a) => a.name === 'sms-otp');
    const gateway = report.adapters.find((a) => a.name === 'payment-gateway');
    assert.equal(sms?.status, 'LOCAL_TEST');
    assert.equal(sms?.provider, 'mock-auto');
    assert.equal(gateway?.status, 'LOCAL_TEST');
    assert.equal(gateway?.provider, 'mock-auto');
    assert.equal(report.adapters.find((a) => a.name === 'map-provider')?.provider, 'neshan');

    // A map key nobody has entered still keeps the whole report honest.
    assert.equal(report.adapters.find((a) => a.name === 'map-provider')?.status, 'NOT_CONFIGURED');
    assert.equal(report.status, 'degraded');
    assert.ok(Date.parse(report.checkedAt) > 0);
  } finally {
    await testDb.drop();
  }
});

test('entering a real tariff removes it from the not-configured list', async () => {
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    const accountId = await createTestAccount(testDb.db, '09990003001');
    const superadmin: Actor = { accountId: accountId as AccountId, context: 'SUPERADMIN', activeRoles: [] };

    // Start from a tariff the operator has cleared, which is the only way one is
    // unset now that the catalogue ships starting figures.
    await updateSetting(testDb.db, superadmin, { key: 'fee.puppy_card_toman', value: null });
    const before = await healthReport(testDb.db, DEV_ENV);
    assert.ok(before.settings.notConfigured.includes('fee.puppy_card_toman'));

    await updateSetting(testDb.db, superadmin, { key: 'fee.puppy_card_toman', value: '150000' });

    const after = await healthReport(testDb.db, DEV_ENV);
    assert.ok(!after.settings.notConfigured.includes('fee.puppy_card_toman'));
    assert.equal(after.settings.notConfigured.length, before.settings.notConfigured.length - 1);
  } finally {
    await testDb.drop();
  }
});

test('health survives an unreachable database instead of throwing', async () => {
  const { createDatabase } = await import('../../src/db/client.ts');
  const { db, pool } = createDatabase('postgres://nobody:nobody@127.0.0.1:1/none');
  try {
    const report = await healthReport(db, DEV_ENV);
    assert.equal(report.database.reachable, false);
    assert.equal(report.status, 'degraded');
    assert.equal(report.database.migrationsApplied, null);
  } finally {
    await pool.end();
  }
});

test('synthetic fixtures are isolated, labelled and refused in production', async () => {
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    const ids = await seedDevFixtures(testDb.db, DEV_ENV);
    assert.equal(ids.length, FIXTURE_ACCOUNTS.length);

    const rows = await testDb.db.select().from(accounts);
    for (const row of rows) {
      assert.ok(row.mobile.startsWith(FIXTURE_MOBILE_PREFIX), 'fixtures use a reserved, unassigned prefix');
    }

    const roles = await testDb.db.select().from(accountRoles);
    assert.equal(roles.length, 5);

    // Re-running is idempotent.
    const again = await seedDevFixtures(testDb.db, DEV_ENV);
    assert.deepEqual([...again].sort(), [...ids].sort());
    assert.equal((await testDb.db.select().from(accounts)).length, FIXTURE_ACCOUNTS.length);

    const productionEnv = loadEnv({
      APP_ENV: 'production',
      INTEGRATION_MODE: 'live',
      DATABASE_URL: 'postgres://user:pass@db/hamzist',
      SESSION_SECRET: 'x'.repeat(40),
      SITE_URL: 'https://hamzist.example',
    });
    await assert.rejects(() => seedDevFixtures(testDb.db, productionEnv), /never be seeded in production/);
  } finally {
    await testDb.drop();
  }
});
