/**
 * Startup, configuration and migrations — gate `reproducible-startup`.
 *
 * What has to be reproducible is the boot itself: the same variables, the same
 * migrations, the same honest health answer. This gate runs the migrator
 * against a clean database and then against that same database again, checks
 * that the configuration contract refuses to boot on a missing essential, and
 * checks that production can never fall back to a development adapter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { migrateTo } from '../../src/db/migrate.ts';
import { healthReport } from '../../src/health/service.ts';
import { loadEnv } from '../../src/config/env.ts';
import { adapterReports, paymentGateway, smsSender } from '../../src/adapters/registry.ts';

const LOCAL = {
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
} as const;

test('the environment contract accepts the documented local setup', async () => {
  const env = loadEnv(LOCAL);
  assert.equal(env.APP_ENV, 'development');
  assert.equal(env.INTEGRATION_MODE, 'local');

  // Every name the example file documents is a name the contract knows.
  const example = await fs.readFile('.env.example', 'utf8');
  const documented = [...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]!);
  assert.ok(documented.includes('APP_ENV'));
  assert.ok(documented.includes('DATABASE_URL'));
  assert.ok(documented.includes('PRIVATE_STORAGE_DIR'));
  assert.ok(documented.includes('SESSION_SECRET'), 'the production-only secret is documented by name');
  assert.ok(!example.includes('SESSION_SECRET=') || /#\s*SESSION_SECRET=/.test(example), 'no real secret is committed');
});

test('a missing essential stops the boot instead of guessing a value', () => {
  assert.throws(() => loadEnv({ ...LOCAL, DATABASE_URL: '' }), /DATABASE_URL/);
  assert.throws(() => loadEnv({ ...LOCAL, APP_ENV: 'staging' }), /APP_ENV/);
  assert.throws(() => loadEnv({ ...LOCAL, INTEGRATION_MODE: 'demo' }), /INTEGRATION_MODE/);
});

test('production refuses the development adapters and the missing secret', () => {
  // §23 and the release rule: production fails loudly rather than quietly
  // sending nothing or taking a fake payment.
  assert.throws(
    () => loadEnv({ ...LOCAL, APP_ENV: 'production', INTEGRATION_MODE: 'local' }),
    /INTEGRATION_MODE|production/,
    'production may never run the local development adapters',
  );
  assert.throws(
    () =>
      loadEnv({
        APP_ENV: 'production',
        INTEGRATION_MODE: 'live',
        DATABASE_URL: 'postgres://user:pass@db:5432/hamzist',
      }),
    /SESSION_SECRET/,
    'production without a session secret does not boot',
  );

  // With a valid production configuration, the development adapters are not
  // silently substituted: asking for one is an explicit failure.
  const production = loadEnv({
    APP_ENV: 'production',
    INTEGRATION_MODE: 'live',
    DATABASE_URL: 'postgres://user:pass@db:5432/hamzist',
    SESSION_SECRET: 'x'.repeat(48),
    SITE_URL: 'https://hamzist.example',
  });
  assert.throws(() => smsSender({} as never, production), /NOT_CONFIGURED|configured/i);
  assert.throws(() => paymentGateway({} as never, production), /NOT_CONFIGURED|configured/i);

  // And the report says so plainly rather than claiming readiness: every
  // external provider is NOT_CONFIGURED, and none of them is ever reported as
  // verified merely because a name exists.
  const reports = adapterReports(production);
  const external = reports.filter((report) => report.name !== 'private-storage');
  assert.ok(external.length >= 5);
  for (const report of external) {
    assert.equal(report.status, 'NOT_CONFIGURED', report.name + ' must not claim readiness');
    assert.equal(report.provider, null);
  }
});

test('migrations run on a clean database and again on the same one', async () => {
  const testDb = await createTestDb({ migrate: false });
  try {
    // A clean database has nothing yet.
    const before = await testDb.db.execute<{ value: string }>(
      sql`select count(*)::text as value from information_schema.tables where table_schema = 'public'`,
    );
    assert.equal(before.rows[0]!.value, '0');

    await migrateTo(testDb.url);
    const applied = await testDb.db.execute<{ value: string }>(
      sql`select count(*)::text as value from drizzle.__drizzle_migrations`,
    );
    const first = Number(applied.rows[0]!.value);
    assert.ok(first > 0, 'the migrator really applied the migrations');

    // Running it again is a no-op: nothing is replayed.
    await migrateTo(testDb.url);
    const second = await testDb.db.execute<{ value: string }>(
      sql`select count(*)::text as value from drizzle.__drizzle_migrations`,
    );
    assert.equal(Number(second.rows[0]!.value), first, 'a second run replays nothing');

    // The seed is idempotent in the same way.
    await seedBaseline(testDb.db);
    const settingsOnce = await testDb.db.execute<{ value: string }>(
      sql`select count(*)::text as value from product_setting`,
    );
    await seedBaseline(testDb.db);
    const settingsTwice = await testDb.db.execute<{ value: string }>(
      sql`select count(*)::text as value from product_setting`,
    );
    assert.equal(settingsTwice.rows[0]!.value, settingsOnce.rows[0]!.value);
  } finally {
    await testDb.drop();
  }
});

test('the health report tells the truth about what is missing', async () => {
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    const report = await healthReport(testDb.db, loadEnv(LOCAL));

    assert.equal(report.database.reachable, true);
    assert.ok((report.database.migrationsApplied ?? 0) > 0);
    assert.ok(report.settings.total > 0);
    // The real tariffs have not been published, so the report says the product
    // is degraded rather than claiming it is ready (§26).
    assert.ok(report.settings.notConfigured.length > 0, 'unset values are listed by name');
    assert.equal(report.status, 'degraded');
    assert.ok(
      report.adapters.some((adapter) => adapter.status === 'NOT_CONFIGURED'),
      'the missing providers are named rather than assumed ready',
    );
    assert.match(report.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await testDb.drop();
  }
});
