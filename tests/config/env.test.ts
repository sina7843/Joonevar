import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadEnv } from '../../src/config/env.ts';
import { adapterReports, assertNotProduction, localTestPaymentGateway, localTestSmsSender } from '../../src/adapters/registry.ts';

const DEV = {
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
};

test('development boots with local adapters', () => {
  const env = loadEnv(DEV);
  assert.equal(env.APP_ENV, 'development');
  assert.equal(env.PRIVATE_STORAGE_DIR, 'private-storage');
});

test('a missing database url fails at startup instead of later', () => {
  assert.throws(() => loadEnv({ APP_ENV: 'development' }), ConfigError);
});

test('production refuses local-test integrations', () => {
  assert.throws(
    () =>
      loadEnv({
        APP_ENV: 'production',
        INTEGRATION_MODE: 'local',
        DATABASE_URL: 'postgres://user:pass@db/hamzist',
        SESSION_SECRET: 'x'.repeat(40),
      }),
    (error: unknown) => error instanceof ConfigError && error.problems.some((p) => p.includes('INTEGRATION_MODE=local')),
  );
});

test('production requires a session secret and rejects the local database credentials', () => {
  assert.throws(
    () =>
      loadEnv({
        APP_ENV: 'production',
        INTEGRATION_MODE: 'live',
        DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
      }),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.problems.some((p) => p.includes('SESSION_SECRET')) &&
      error.problems.some((p) => p.includes('local development credentials')),
  );
});

test('adapter status is derived from configuration and never assumed ready', () => {
  const reports = adapterReports(loadEnv(DEV));
  const sms = reports.find((r) => r.name === 'sms-otp');
  assert.equal(sms?.status, 'NOT_CONFIGURED');
  assert.equal(sms?.provider, null);

  const withProvider = adapterReports(loadEnv({ ...DEV, SMS_PROVIDER: 'example-sms' }));
  assert.equal(withProvider.find((r) => r.name === 'sms-otp')?.status, 'LOCAL_TEST');

  const sandbox = adapterReports(
    loadEnv({ ...DEV, INTEGRATION_MODE: 'sandbox', SMS_PROVIDER: 'example-sms' }),
  );
  assert.equal(sandbox.find((r) => r.name === 'sms-otp')?.status, 'SANDBOX_VERIFIED');
});

test('local-test adapters cannot be constructed in production', () => {
  const productionEnv = loadEnv({
    APP_ENV: 'production',
    INTEGRATION_MODE: 'live',
    DATABASE_URL: 'postgres://user:pass@db/hamzist',
    SESSION_SECRET: 'x'.repeat(40),
  });

  assert.throws(() => assertNotProduction('sms-otp', productionEnv), /must never run in production/);
  assert.throws(() => localTestSmsSender([], productionEnv), /must never run in production/);
  assert.throws(() => localTestPaymentGateway(productionEnv), /must never run in production/);
});

test('the local gateway reports paid only when a test says so', async () => {
  const env = loadEnv(DEV);
  const gateway = localTestPaymentGateway(env);
  const intent = await gateway.start({ reference: 'ref-1', amountRial: 3000000n, callbackUrl: '/pay/return' });
  assert.ok(intent.redirectUrl.includes('ref-1'));

  const before = await gateway.verify({ reference: 'ref-1', providerRef: 'p-1' });
  assert.equal(before.paid, false);

  gateway.markPaid('ref-1', 3000000n);
  const after = await gateway.verify({ reference: 'ref-1', providerRef: 'p-1' });
  assert.equal(after.paid, true);
  assert.equal(after.amountRial, 3000000n);
});

test('sms in development records the message instead of reaching a phone', async () => {
  const sink: Array<{ to: string; text: string }> = [];
  const sender = localTestSmsSender(sink, loadEnv(DEV));
  await sender.send({ to: '09990000001', text: 'code' });
  assert.equal(sink.length, 1);
  assert.equal(sink[0]?.to, '09990000001');
});
