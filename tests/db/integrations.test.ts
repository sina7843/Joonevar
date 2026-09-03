/**
 * Managed integration settings — DEC-0122…DEC-0126.
 *
 * The risk these cover is not "does the mock work". It is the opposite: that a
 * mock quietly becomes the thing that answers a real payment, or that a
 * simulated gateway is believed about an amount nobody checked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestAccount, createTestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { loadEnv } from '../../src/config/env.ts';
import { paymentAttempts, paymentBatches } from '../../src/db/schema/billing.ts';
import {
  adapterReportsWithSettings,
  integrationSettings,
} from '../../src/adapters/integration-settings.ts';
import { mockAutoPaymentGateway, mockAutoSmsSender } from '../../src/adapters/registry.ts';
import { readSetting } from '../../src/settings/service.ts';

const DEV_ENV = loadEnv({
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
});
// A production configuration refuses the local development credentials, so this
// one names a different database on purpose; only its APP_ENV matters here.
const PROD_ENV = loadEnv({
  APP_ENV: 'production',
  INTEGRATION_MODE: 'live',
  DATABASE_URL: 'postgres://user:pass@db:5432/hamzist',
  SESSION_SECRET: 'x'.repeat(48),
});

async function withDb(fn: (db: Awaited<ReturnType<typeof createTestDb>>) => Promise<void>) {
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    await fn(testDb);
  } finally {
    await testDb.drop();
  }
}

test('the seeded choice is neshan, chromium and a keyboard-wedge reader', async () => {
  await withDb(async (testDb) => {
    const settings = await integrationSettings(testDb.db, DEV_ENV);
    assert.equal(settings.map.provider, 'neshan');
    assert.equal(settings.map.apiKey, null, 'the key is the operator’s to enter, never invented');
    assert.equal(settings.documentRender.engine, 'CHROMIUM');
    assert.equal(settings.chipReader.mode, 'KEYBOARD_WEDGE');
    assert.equal(settings.sms.mode, 'MOCK_AUTO');
    assert.equal(settings.payment.mode, 'MOCK_AUTO');

    // Each of them is a superadmin-owned row, not a constant in the code.
    assert.equal((await readSetting(testDb.db, 'integration.map.provider')).group, 'INTEGRATIONS');
  });
});

test('production never resolves to a mock, whatever the database says', async () => {
  await withDb(async (testDb) => {
    const settings = await integrationSettings(testDb.db, PROD_ENV);
    assert.equal(settings.sms.mode, 'PROVIDER');
    assert.equal(settings.payment.mode, 'PROVIDER');

    // And the mocks themselves refuse to be constructed there at all.
    assert.throws(() => mockAutoSmsSender(testDb.db, PROD_ENV), /production/i);
    assert.throws(() => mockAutoPaymentGateway(testDb.db, PROD_ENV), /production/i);
  });
});

test('the mock gateway answers with the frozen amount, not with a number it made up', async () => {
  await withDb(async (testDb) => {
    const gateway = mockAutoPaymentGateway(testDb.db, DEV_ENV);

    // An unknown reference is not paid. A mock that said "paid" here would let a
    // forged callback through.
    const unknown = await gateway.verify({ reference: 'no-such-reference', providerRef: 'x' });
    assert.equal(unknown.paid, false);
    assert.equal(unknown.amountRial, 0n);

    const accountId = await createTestAccount(testDb.db, '09990004001');
    const [batch] = await testDb.db
      .insert(paymentBatches)
      .values({
        accountId,
        service: 'PEDIGREE',
        resumeContext: { entity: { type: 'ANIMAL', id: 'a-1' }, step: 'PAY', originRoute: '/pedigree' },
      })
      .returning({ id: paymentBatches.id });

    await testDb.db.insert(paymentAttempts).values({
      batchId: batch!.id,
      reference: 'ref-frozen-1',
      provider: 'mock-auto-gateway',
      amountRial: '40000',
      status: 'PENDING',
    });

    const verified = await gateway.verify({ reference: 'ref-frozen-1', providerRef: '' });
    assert.equal(verified.paid, true);
    assert.equal(verified.amountRial, 40_000n, 'the amount comes from the record, so the server check still bites');
    assert.ok(verified.providerRef.length > 0);
  });
});

test('the health report calls a mock a mock', async () => {
  await withDb(async (testDb) => {
    const reports = await adapterReportsWithSettings(testDb.db, DEV_ENV);
    for (const name of ['sms-otp', 'payment-gateway'] as const) {
      const report = reports.find((r) => r.name === name);
      assert.equal(report?.status, 'LOCAL_TEST', name + ' must never be reported as verified');
      assert.equal(report?.provider, 'mock-auto');
    }
    assert.equal(reports.find((r) => r.name === 'map-provider')?.status, 'NOT_CONFIGURED');
    assert.equal(reports.find((r) => r.name === 'document-render')?.provider, 'chromium-pdf');
    assert.equal(reports.find((r) => r.name === 'chip-reader')?.provider, 'keyboard-wedge');
    assert.ok(!reports.some((r) => r.status === 'LIVE_VERIFIED'), 'nothing local claims a live integration');
  });
});
