import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createTestAccount, createTestDb } from '../helpers/db.ts';
import { seedDevFixtures } from '../../src/db/seed/dev-fixtures.ts';
import { accounts } from '../../src/db/schema/core.ts';
import { devOverrideAllowed, resolveDevActor } from '../../src/authz/session.ts';
import { loadEnv } from '../../src/config/env.ts';
import { canAccessRoute } from '../../src/authz/routes.ts';

const DEV = loadEnv({
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
});

const PRODUCTION = loadEnv({
  APP_ENV: 'production',
  INTEGRATION_MODE: 'live',
  DATABASE_URL: 'postgres://user:pass@db/hamzist',
  SESSION_SECRET: 'x'.repeat(40),
});

const SANDBOX = loadEnv({
  APP_ENV: 'development',
  INTEGRATION_MODE: 'sandbox',
  DATABASE_URL: 'postgres://user:pass@db/hamzist',
});

test('the development override is refused outside development with local integrations', () => {
  assert.equal(devOverrideAllowed(DEV), true);
  assert.equal(devOverrideAllowed(PRODUCTION), false);
  assert.equal(devOverrideAllowed(SANDBOX), false);
});

test('a fixture account resolves to an actor with its real active roles', async () => {
  const testDb = await createTestDb();
  try {
    await seedDevFixtures(testDb.db, DEV);
    const [vet] = await testDb.db.select().from(accounts).where(eq(accounts.mobile, '09990000003'));

    const actor = await resolveDevActor(testDb.db, vet!.id + ':TRUSTED_VET', DEV);
    assert.ok(actor);
    assert.equal(actor?.context, 'TRUSTED_VET');
    assert.deepEqual(actor?.activeRoles, ['TRUSTED_VET']);
    assert.equal(canAccessRoute(actor, '/vet'), true);
    assert.equal(canAccessRoute(actor, '/admin'), false);
  } finally {
    await testDb.drop();
  }
});

test('the override never grants a context the account does not hold', async () => {
  const testDb = await createTestDb();
  try {
    await seedDevFixtures(testDb.db, DEV);
    const [owner] = await testDb.db.select().from(accounts).where(eq(accounts.mobile, '09990000001'));

    // The plain owner fixture has no roles at all.
    assert.equal(await resolveDevActor(testDb.db, owner!.id + ':TRUSTED_VET', DEV), null);
    assert.equal(await resolveDevActor(testDb.db, owner!.id + ':SUPERADMIN', DEV), null);
    assert.equal(await resolveDevActor(testDb.db, owner!.id + ':ASSOCIATION_OPERATOR', DEV), null);

    const asUser = await resolveDevActor(testDb.db, owner!.id + ':USER', DEV);
    assert.equal(asUser?.context, 'USER');
  } finally {
    await testDb.drop();
  }
});

test('only synthetic fixture accounts can be impersonated', async () => {
  const testDb = await createTestDb();
  try {
    await seedDevFixtures(testDb.db, DEV);
    // A real-looking mobile number is refused even in development.
    const realAccountId = await createTestAccount(testDb.db, '09121234567');
    assert.equal(await resolveDevActor(testDb.db, realAccountId + ':USER', DEV), null);
  } finally {
    await testDb.drop();
  }
});

test('a malformed or unknown cookie resolves to nobody', async () => {
  const testDb = await createTestDb();
  try {
    await seedDevFixtures(testDb.db, DEV);
    for (const raw of [undefined, '', 'garbage', ':USER', 'no-such-account:USER']) {
      assert.equal(await resolveDevActor(testDb.db, raw, DEV), null, 'cookie ' + String(raw));
    }
    const [admin] = await testDb.db.select().from(accounts).where(eq(accounts.mobile, '09990000006'));
    assert.equal(await resolveDevActor(testDb.db, admin!.id + ':NOT_A_CONTEXT', DEV), null);
  } finally {
    await testDb.drop();
  }
});

test('in production the override resolves to nobody even with a valid fixture cookie', async () => {
  const testDb = await createTestDb();
  try {
    await seedDevFixtures(testDb.db, DEV);
    const [admin] = await testDb.db.select().from(accounts).where(eq(accounts.mobile, '09990000006'));
    assert.equal(await resolveDevActor(testDb.db, admin!.id + ':SUPERADMIN', PRODUCTION), null);
    assert.equal(await resolveDevActor(testDb.db, admin!.id + ':SUPERADMIN', SANDBOX), null);
  } finally {
    await testDb.drop();
  }
});
