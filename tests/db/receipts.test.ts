/**
 * An account's own payments — Phase 2.5 PROMPT-015.
 *
 * The list and the receipt are the first screens that answer "what did I pay",
 * so what matters is that they answer it for the person asking and for nobody
 * else, that the figures are the frozen ones rather than today's tariff, and
 * that "paid" means the server verified it.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { paymentBatches } from '../../src/db/schema/billing.ts';
import { createBatch, startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { myPayments, myReceipt } from '../../src/billing/receipts.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

let testDb: TestDb;
let payer: Actor;
let stranger: Actor;

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

const setSetting = (key: string, value: unknown) =>
  testDb.db.execute(sql`update product_setting set value = ${JSON.stringify(value)}::jsonb, updated_at = now() where key = ${key}`);

const gateway = (amountRial: bigint, paid = true): PaymentGateway => ({
  async start(input) {
    return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
  },
  async verify() {
    return { paid, amountRial, providerRef: 'ref-receipt' };
  },
});

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  payer = actorFor(await createTestAccount(testDb.db, '09990460001'), 'USER');
  stranger = actorFor(await createTestAccount(testDb.db, '09990460002'), 'USER');
  await setSetting('fee.membership_toman', '150000');
});

after(async () => {
  await testDb?.drop();
});

/** A membership batch, priced from managed data the way the product prices one. */
async function batchFor(actor: Actor) {
  return createBatch(testDb.db, actor, {
    service: 'MEMBERSHIP',
    items: [{ targetType: 'MEMBERSHIP_PERIOD', targetId: crypto.randomUUID(), settingKey: 'fee.membership_toman' }],
    resume: { entity: { type: 'ACCOUNT', id: actor.accountId }, step: 'MEMBERSHIP_PAYMENT', originRoute: '/membership' },
  });
}

test('the list shows the account’s own payments with the frozen amount and the real status', async () => {
  const batch = await batchFor(payer);
  const before = await myPayments(testDb.db, payer, { page: 1, pageSize: 10 });
  const line = before.items.find((entry) => entry.batchId === batch.id)!;
  assert.ok(line, 'the batch is listed as soon as it exists');
  assert.equal(line.serviceFa, 'عضویت انجمن');
  assert.equal(line.totalToman, 150_000n);
  assert.equal(line.statusFa, 'آماده پرداخت');
  assert.equal(line.paidAt, null);
  assert.equal(line.originRoute, '/membership');

  const paying = gateway(1_500_000n);
  const attempt = await startAttempt(testDb.db, payer, { batchId: batch.id, callbackUrl: 'https://example.invalid/return' }, paying, 'test');
  const verified = await verifyAttempt(testDb.db, { reference: attempt.reference }, paying, paidEffects);
  assert.equal(verified.state, 'PAID');

  const after = await myPayments(testDb.db, payer, { page: 1, pageSize: 10 });
  const settled = after.items.find((entry) => entry.batchId === batch.id)!;
  assert.equal(settled.status, 'PAID');
  assert.equal(settled.statusFa, 'پرداخت‌شده');
  assert.equal(settled.providerRef, 'ref-receipt');
  assert.ok(settled.paidAt, 'a verified payment records when the server settled it');

  // A later tariff change does not rewrite what was charged.
  await setSetting('fee.membership_toman', '900000');
  const again = await myPayments(testDb.db, payer, { page: 1, pageSize: 10 });
  assert.equal(again.items.find((entry) => entry.batchId === batch.id)!.totalToman, 150_000n);
  await setSetting('fee.membership_toman', '150000');
});

test('a receipt belongs to one account, and somebody else’s is simply not found', async () => {
  const batch = await batchFor(payer);
  const receipt = await myReceipt(testDb.db, payer, batch.id);
  assert.equal(receipt.batchId, batch.id);
  assert.equal(receipt.lines.length, 1);
  assert.equal(receipt.lines[0]!.amountToman, 150_000n);
  assert.equal(receipt.lines[0]!.priceSource, 'SETTING');

  // Not forbidden — not found: the address cannot be used to learn a payment exists.
  await assert.rejects(() => myReceipt(testDb.db, stranger, batch.id), code('NOT_FOUND'));
  await assert.rejects(() => myReceipt(testDb.db, payer, 'not-a-uuid'), code('NOT_FOUND'));
  await assert.rejects(() => myReceipt(testDb.db, payer, crypto.randomUUID()), code('NOT_FOUND'));

  // And the stranger's own list never mentions it.
  const theirs = await myPayments(testDb.db, stranger, { page: 1, pageSize: 50 });
  assert.equal(
    theirs.items.some((entry) => entry.batchId === batch.id),
    false,
  );
});

test('a refused payment is recorded as such, with the provider’s reason and no settlement', async () => {
  const batch = await batchFor(payer);
  const refusing = gateway(1_500_000n, false);
  const attempt = await startAttempt(testDb.db, payer, { batchId: batch.id, callbackUrl: 'https://example.invalid/return' }, refusing, 'test');
  const outcome = await verifyAttempt(testDb.db, { reference: attempt.reference }, refusing, paidEffects);
  assert.equal(outcome.state, 'FAILED');

  const receipt = await myReceipt(testDb.db, payer, batch.id);
  assert.notEqual(receipt.status, 'PAID');
  assert.equal(receipt.paidAt, null);
  assert.equal(receipt.providerRef, null);
  assert.equal(receipt.attempts.length >= 1, true);
  assert.ok(receipt.attempts[0]!.failureReason, 'the reason the gateway gave is kept');
  // The provider's name is on the record; nothing else about the call is.
  assert.equal(receipt.attempts[0]!.provider, 'test');
  const serialized = JSON.stringify(receipt, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
  for (const leak of ['api_key', 'apiKey', 'callbackUrl', 'https://example.invalid']) {
    assert.equal(serialized.includes(leak), false, 'the receipt leaked ' + leak);
  }
});

test('the list is paged and ordered newest first', async () => {
  const fresh = actorFor(await createTestAccount(testDb.db, '09990460003'), 'USER');
  for (let index = 0; index < 3; index += 1) await batchFor(fresh);
  const first = await myPayments(testDb.db, fresh, { page: 1, pageSize: 2 });
  assert.equal(first.items.length, 2);
  assert.equal(first.total, 3);
  assert.equal(first.totalPages, 2);
  const second = await myPayments(testDb.db, fresh, { page: 2, pageSize: 2 });
  assert.equal(second.items.length, 1);

  const times = [...first.items, ...second.items].map((line) => line.createdAt.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a), 'newest first');

  // Every row really belongs to that account.
  const ids = [...first.items, ...second.items].map((line) => line.batchId);
  const owners = await testDb.db
    .select({ accountId: paymentBatches.accountId })
    .from(paymentBatches)
    .where(eq(paymentBatches.accountId, fresh.accountId));
  assert.equal(owners.length, ids.length);
});
