import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestAccount, createTestDb } from '../helpers/db.ts';
import {
  createNotification,
  deliverOnce,
  inAppChannel,
  listForActor,
  openNotification,
  type NotificationChannel,
} from '../../src/notifications/service.ts';
import { redact } from '../../src/audit/service.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

const actor = (accountId: string): Actor => ({
  accountId: accountId as AccountId,
  context: 'USER',
  activeRoles: [],
});

test('a notification carries the exact case, step and route back', async () => {
  const testDb = await createTestDb();
  try {
    const accountId = await createTestAccount(testDb.db, '09990002001');
    const created = await createNotification(testDb.db, {
      recipientAccountId: accountId,
      kind: 'REFERRAL_ISSUED',
      titleFa: 'کد مراجعه صادر شد',
      bodyFa: 'کد مراجعه این حیوان صادر شد و مهلت آن ثبت شده است.',
      resume: {
        entity: { type: 'VET_VISIT_REQUEST', id: 'req-42' },
        step: 'SHOW_REFERRAL',
        originRoute: '/requests/req-42',
        selection: { animalIds: ['a-1', 'a-2'] },
      },
    });

    assert.equal(created.resume.entity.id, 'req-42');
    assert.equal(created.resume.step, 'SHOW_REFERRAL');
    assert.equal(created.resume.originRoute, '/requests/req-42');
    assert.deepEqual(created.resume.selection, { animalIds: ['a-1', 'a-2'] });

    const page = await listForActor(testDb.db, actor(accountId), { page: 1, pageSize: 10 });
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.resume.originRoute, '/requests/req-42');
  } finally {
    await testDb.drop();
  }
});

test('a notification cannot resume to a generic list route', async () => {
  const testDb = await createTestDb();
  try {
    const accountId = await createTestAccount(testDb.db, '09990002002');
    await assert.rejects(
      () =>
        createNotification(testDb.db, {
          recipientAccountId: accountId,
          kind: 'X',
          titleFa: 't',
          bodyFa: 'b',
          resume: { entity: { type: 'ANIMAL', id: 'a-1' }, step: 'S', originRoute: '/dashboard' },
        }),
      /must point at the case/,
    );
  } finally {
    await testDb.drop();
  }
});

test('opening a notification re-authorizes on the server', async () => {
  const testDb = await createTestDb();
  try {
    const ownerId = await createTestAccount(testDb.db, '09990002003');
    const strangerId = await createTestAccount(testDb.db, '09990002004');
    const created = await createNotification(testDb.db, {
      recipientAccountId: ownerId,
      kind: 'RESULT_READY',
      titleFa: 'نتیجه آماده است',
      bodyFa: 'نتیجه Parentage این حیوان ثبت شد.',
      resume: { entity: { type: 'PARENTAGE_RESULT', id: 'res-1' }, step: 'VIEW_RESULT', originRoute: '/pedigree/a-1' },
    });

    await assert.rejects(
      () => openNotification(testDb.db, actor(strangerId), created.id),
      /belongs to another account/,
    );

    const opened = await openNotification(testDb.db, actor(ownerId), created.id);
    assert.equal(opened.id, created.id);
  } finally {
    await testDb.drop();
  }
});

test('delivery happens once per idempotency key even when called repeatedly', async () => {
  const testDb = await createTestDb();
  try {
    const accountId = await createTestAccount(testDb.db, '09990002005');
    const created = await createNotification(testDb.db, {
      recipientAccountId: accountId,
      kind: 'RECEIPT_APPROVED',
      titleFa: 'فیش تأیید شد',
      bodyFa: 'فیش پرداخت مرکز ژنتیک تأیید شد.',
      resume: { entity: { type: 'GENETICS_RECEIPT', id: 'rcp-9' }, step: 'AWAIT_SHIPMENT', originRoute: '/pedigree/a-1' },
    });

    let sends = 0;
    const counting: NotificationChannel = {
      name: 'IN_APP',
      async send() {
        sends += 1;
      },
    };

    const key = 'receipt-approved:rcp-9:IN_APP';
    const first = await deliverOnce(testDb.db, created, counting, key);
    const second = await deliverOnce(testDb.db, created, counting, key);
    const third = await deliverOnce(testDb.db, created, counting, key);

    assert.equal(first.performed, true);
    assert.equal(first.status, 'SENT');
    assert.equal(second.performed, false);
    assert.equal(third.performed, false);
    assert.equal(sends, 1, 'a duplicated event must not send twice');
  } finally {
    await testDb.drop();
  }
});

test('concurrent workers cannot both deliver the same notification', async () => {
  const testDb = await createTestDb();
  try {
    const accountId = await createTestAccount(testDb.db, '09990002006');
    const created = await createNotification(testDb.db, {
      recipientAccountId: accountId,
      kind: 'PAYMENT_VERIFIED',
      titleFa: 'پرداخت تأیید شد',
      bodyFa: 'پرداخت شما تأیید شد.',
      resume: { entity: { type: 'PAYMENT_BATCH', id: 'pay-1' }, step: 'VERIFIED', originRoute: '/registration/batch' },
    });

    let sends = 0;
    const slow: NotificationChannel = {
      name: 'IN_APP',
      async send() {
        await new Promise((r) => setTimeout(r, 20));
        sends += 1;
      },
    };

    const key = 'payment-verified:pay-1';
    const results = await Promise.all([
      deliverOnce(testDb.db, created, slow, key),
      deliverOnce(testDb.db, created, slow, key),
      deliverOnce(testDb.db, created, slow, key),
    ]);

    assert.equal(results.filter((r) => r.performed).length, 1);
    assert.equal(sends, 1);
  } finally {
    await testDb.drop();
  }
});

test('a failed send is recorded as FAILED and does not silently look sent', async () => {
  const testDb = await createTestDb();
  try {
    const accountId = await createTestAccount(testDb.db, '09990002007');
    const created = await createNotification(testDb.db, {
      recipientAccountId: accountId,
      kind: 'X',
      titleFa: 't',
      bodyFa: 'b',
      resume: { entity: { type: 'ANIMAL', id: 'a-1' }, step: 'S', originRoute: '/animals/a-1' },
    });

    const failing: NotificationChannel = {
      name: 'SMS',
      async send() {
        throw new Error('provider unreachable');
      },
    };

    const outcome = await deliverOnce(testDb.db, created, failing, 'x:1');
    assert.equal(outcome.status, 'FAILED');
    assert.equal(outcome.performed, true);

    // The in-app channel is a no-op send; the row itself is the delivery.
    const ok = await deliverOnce(testDb.db, created, inAppChannel, 'x:2');
    assert.equal(ok.status, 'SENT');
  } finally {
    await testDb.drop();
  }
});

test('sensitive keys never reach the audit or notification payload', () => {
  const redacted = redact({
    otp: '123456',
    nationalId: '0011223344',
    card_number: '6037',
    nested: { token: 'abc', keep: 'visible' },
    amountToman: 300000n,
  }) as Record<string, unknown>;

  assert.equal(redacted.otp, '[redacted]');
  assert.equal(redacted.nationalId, '[redacted]');
  assert.equal(redacted.card_number, '[redacted]');
  assert.deepEqual(redacted.nested, { token: '[redacted]', keep: 'visible' });
  assert.equal(redacted.amountToman, '300000');
});
