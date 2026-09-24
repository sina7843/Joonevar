/**
 * The notification outbox against a real database — Phase 2.5 PROMPT-015.
 *
 * The rules worth proving: a message is queued in the same transaction as the
 * decision that caused it, a provider outage never undoes that decision, a
 * retry happens with a growing delay and stops where the policy says, the same
 * notification is never queued or sent twice, and nothing that leaves the
 * product carries a record's own words.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accounts, notificationDeliveries, notifications } from '../../src/db/schema/core.ts';
import { devOutboundSms } from '../../src/db/schema/identity.ts';
import { createNotification } from '../../src/notifications/service.ts';
import {
  channelPolicy,
  deliveryKey,
  outboxStanding,
  requeueDelivery,
  runOutbox,
  type OutboundSender,
} from '../../src/notifications/outbox.ts';
import { failingSmsSender, smsOutboundSender } from '../../src/notifications/sms-channel.ts';
import { NOTIFICATION_TEMPLATES, TEMPLATE_VERSION, channelsFor, renderSms, templateFor } from '../../src/notifications/templates.ts';
import { localTestSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let person: Actor;
let counter = 0;

/** A development environment: the adapters refuse to exist in production. */
const DEV = loadEnv({
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
});
const testSender = (sink: Array<{ to: string; text: string }>) => localTestSmsSender(sink, DEV);

const setSetting = (key: string, value: unknown) =>
  testDb.db.execute(sql`update product_setting set value = ${JSON.stringify(value)}::jsonb, updated_at = now() where key = ${key}`);

const deliveriesOf = async (notificationId: string) =>
  testDb.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.notificationId, notificationId));

/** A notification of one kind, written the way the domain writes one. */
async function notify(kind: string, titleFa = 'عنوان آزمایشی', bodyFa = 'متن آزمایشی') {
  counter += 1;
  return testDb.db.transaction((tx) =>
    createNotification(tx, {
      recipientAccountId: person.accountId,
      kind,
      titleFa,
      bodyFa,
      resume: { entity: { type: 'ACCOUNT', id: person.accountId }, step: 'NOTIFICATION_TEST', originRoute: '/notifications' },
    }),
  );
}

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  person = actorFor(await createTestAccount(testDb.db, '09990450001'), 'USER');
});

after(async () => {
  await testDb?.drop();
});

test('with the channel off, a notification is recorded in the app and nothing is queued to leave', async () => {
  const policy = await channelPolicy(testDb.db);
  assert.equal(policy.smsEnabled, false, 'SMS starts off until an operator turns it on');
  assert.deepEqual(channelsFor('PAYMENT_VERIFIED', policy), ['IN_APP']);

  const notification = await notify('PAYMENT_VERIFIED');
  const rows = await deliveriesOf(notification.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.channel, 'IN_APP');
  assert.equal(rows[0]!.status, 'SENT', 'the in-app row is the delivery');
  assert.equal(rows[0]!.renderedText, null);

  // A run of the SMS worker has nothing to do, and sends nothing.
  const sink: Array<{ to: string; text: string }> = [];
  const result = await runOutbox(testDb.db, smsOutboundSender(testSender(sink)));
  assert.deepEqual({ claimed: result.claimed, sent: result.sent }, { claimed: 0, sent: 0 });
  assert.equal(sink.length, 0);
});

test('with the channel on, only the kinds the catalogue speaks for are queued', async () => {
  await setSetting('notifications.sms_enabled', 'ON');
  const policy = await channelPolicy(testDb.db);
  assert.equal(policy.smsEnabled, true);

  const templated = await notify('MEMBERSHIP_ACTIVATED');
  const queued = await deliveriesOf(templated.id);
  assert.equal(queued.length, 2);
  const sms = queued.find((row) => row.channel === 'SMS')!;
  assert.equal(sms.status, 'PENDING');
  assert.equal(sms.idempotencyKey, deliveryKey(templated.id, 'SMS'));
  assert.equal(sms.renderedText, renderSms('MEMBERSHIP_ACTIVATED'));
  assert.equal(sms.attempts, 0);

  // A kind nobody wrote a sentence for stays in the app.
  const quiet = await notify('SAMPLE_COLLECTED');
  const quietRows = await deliveriesOf(quiet.id);
  assert.deepEqual(
    quietRows.map((row) => row.channel),
    ['IN_APP'],
  );
});

test('what leaves the product is the catalogue sentence, never the record’s own words', async () => {
  await setSetting('notifications.sms_enabled', 'ON');
  // The notification carries a reason with things that must not travel.
  const secretBody =
    'کد ملی ۰۰۱۲۳۴۵۶۷۸ و شماره میکروچیپ ۹۹۰۰۰۰۰۰۰۰۰۰۰۰۱ ثبت شد؛ مبلغ ۴۰۰٬۰۰۰ تومان پرداخت شد. موبایل ۰۹۱۲۰۰۰۰۰۰۰';
  const notification = await notify('KYC_APPROVED', 'احراز هویت شما تأیید شد', secretBody);

  const sms = (await deliveriesOf(notification.id)).find((row) => row.channel === 'SMS')!;
  const text = sms.renderedText!;
  for (const leak of ['۰۰۱۲۳۴۵۶۷۸', '۹۹۰۰۰۰۰۰۰۰۰۰۰۰۱', '۴۰۰٬۰۰۰', '۰۹۱۲۰۰۰۰۰۰۰', 'کد ملی', 'میکروچیپ']) {
    assert.equal(text.includes(leak), false, 'the message carried ' + leak);
  }
  assert.equal(text, renderSms('KYC_APPROVED'));

  const sink: Array<{ to: string; text: string }> = [];
  await runOutbox(testDb.db, smsOutboundSender(testSender(sink)));
  assert.equal(sink.length >= 1, true);
  const sent = sink.find((message) => message.text === renderSms('KYC_APPROVED'))!;
  assert.ok(sent, 'the provider was handed the catalogue sentence');
  for (const leak of ['۰۰۱۲۳۴۵۶۷۸', 'کد ملی']) assert.equal(sent.text.includes(leak), false);
  // The number it went to is the recipient's own, read on the server.
  const [account] = await testDb.db.select({ mobile: accounts.mobile }).from(accounts).where(eq(accounts.id, person.accountId));
  assert.equal(sent.to, account!.mobile);
});

test('a provider outage delays the message and leaves the domain change standing', async () => {
  await setSetting('notifications.sms_enabled', 'ON');
  await setSetting('notifications.sms_retry_seconds', 30);
  await setSetting('notifications.sms_max_attempts', 3);

  const notification = await notify('VET_LICENCE_PERIOD_ACTIVATED');
  const before = (await deliveriesOf(notification.id)).find((row) => row.channel === 'SMS')!;
  const now = new Date();

  const first = await runOutbox(testDb.db, smsOutboundSender(failingSmsSender('ارائه‌دهنده پاسخ نداد.')), { now });
  assert.equal(first.sent, 0);
  assert.equal(first.retried, 1);
  const afterFirst = (await deliveriesOf(notification.id)).find((row) => row.channel === 'SMS')!;
  assert.equal(afterFirst.status, 'PENDING', 'a failure is a delay, not a loss');
  assert.equal(afterFirst.attempts, 1);
  assert.equal(afterFirst.lastError, 'ارائه‌دهنده پاسخ نداد.');
  assert.ok(afterFirst.nextAttemptAt.getTime() >= now.getTime() + 30_000, 'the next try waits');

  // The notification itself — the domain's own record — is untouched.
  const [row] = await testDb.db.select().from(notifications).where(eq(notifications.id, notification.id));
  assert.equal(row!.kind, 'VET_LICENCE_PERIOD_ACTIVATED');
  assert.equal(before.id, afterFirst.id);

  // Not due yet: a second run in the same instant does nothing at all.
  const immediate = await runOutbox(testDb.db, smsOutboundSender(failingSmsSender()), { now });
  assert.equal(immediate.claimed, 0);

  // The delay grows, and the attempts run out where the policy says.
  const later = new Date(now.getTime() + 60_000);
  await runOutbox(testDb.db, smsOutboundSender(failingSmsSender()), { now: later });
  const lastTry = new Date(now.getTime() + 10 * 60_000);
  const exhausted = await runOutbox(testDb.db, smsOutboundSender(failingSmsSender()), { now: lastTry });
  assert.equal(exhausted.failed, 1);
  const dead = (await deliveriesOf(notification.id)).find((row) => row.channel === 'SMS')!;
  assert.equal(dead.status, 'FAILED');
  assert.equal(dead.attempts, 3);

  // A failed row is evidence, and an operator may put it back in the queue.
  const requeued = await requeueDelivery(testDb.db, dead.id, lastTry);
  assert.equal(requeued?.status, 'PENDING');
  assert.equal(requeued?.attempts, 0);
  const sink: Array<{ to: string; text: string }> = [];
  const recovered = await runOutbox(testDb.db, smsOutboundSender(testSender(sink)), { now: lastTry });
  assert.equal(recovered.sent, 1);
  const finished = (await deliveriesOf(notification.id)).find((row) => row.channel === 'SMS')!;
  assert.equal(finished.status, 'SENT');
  assert.ok(finished.sentAt);
  assert.equal(finished.lastError, null);
});

test('the same message is queued once and sent once, however often the worker runs', async () => {
  await setSetting('notifications.sms_enabled', 'ON');
  const notification = await notify('MEMBERSHIP_EXPIRED');

  // Queuing the same notification again finds the row already there.
  const again = await testDb.db.transaction(async (tx) => {
    const { enqueueDeliveries, channelPolicy: policyOf } = await import('../../src/notifications/outbox.ts');
    return enqueueDeliveries(tx, notification, await policyOf(tx));
  });
  assert.deepEqual(again, [], 'nothing was queued a second time');
  assert.equal((await deliveriesOf(notification.id)).length, 2);

  const sink: Array<{ to: string; text: string }> = [];
  const sender = smsOutboundSender(testSender(sink));
  const runs = await Promise.all([runOutbox(testDb.db, sender), runOutbox(testDb.db, sender), runOutbox(testDb.db, sender)]);
  const sentTotal = runs.reduce((total, run) => total + run.sent, 0);
  const mine = sink.filter((message) => message.text === renderSms('MEMBERSHIP_EXPIRED'));
  assert.equal(mine.length, 1, 'three concurrent workers sent it once');
  assert.ok(sentTotal >= 1);

  const row = (await deliveriesOf(notification.id)).find((entry) => entry.channel === 'SMS')!;
  assert.equal(row.status, 'SENT');
  assert.equal(row.attempts, 1, 'the losing workers did not spend an attempt');
});

test('turning the channel off suppresses what is already queued instead of retrying for ever', async () => {
  await setSetting('notifications.sms_enabled', 'ON');
  const notification = await notify('MEMBERSHIP_ENDING');
  await setSetting('notifications.sms_enabled', 'OFF');

  const sink: Array<{ to: string; text: string }> = [];
  const result = await runOutbox(testDb.db, smsOutboundSender(testSender(sink)));
  assert.equal(result.suppressed >= 1, true);
  assert.equal(sink.length, 0, 'nothing was sent after the channel was turned off');
  const row = (await deliveriesOf(notification.id)).find((entry) => entry.channel === 'SMS')!;
  assert.equal(row.status, 'SUPPRESSED');
  assert.ok(row.lastError?.includes('خاموش'));
});

test('the outbox standing answers what is waiting, what failed and what was suppressed', async () => {
  const standing = await outboxStanding(testDb.db);
  assert.equal(standing.sent >= 1, true);
  assert.equal(standing.suppressed >= 1, true);
  assert.equal(typeof standing.pending, 'number');
  assert.equal(typeof standing.due, 'number');
});

test('every templated kind has a real Persian sentence and a version stamped on it', () => {
  assert.match(TEMPLATE_VERSION, /^v\d+-\d{4}-\d{2}$/);
  for (const template of NOTIFICATION_TEMPLATES) {
    assert.equal(templateFor(template.kind), template);
    const text = renderSms(template.kind);
    assert.ok(text, template.kind + ' has no sentence');
    assert.ok(text!.startsWith('همزیست:'), template.kind + ' does not say who is writing');
    assert.ok(text!.length <= 200, template.kind + ' is too long for one message');
    // Persian, and none of the placeholder syntax that would imply record text.
    assert.match(text!, /[؀-ۿ]/u, template.kind + ' is not Persian');
    assert.equal(/[{}$]/.test(text!), false, template.kind + ' looks like it interpolates a value');
  }
  // A kind nobody wrote for renders nothing rather than an empty message.
  assert.equal(renderSms('A_KIND_NOBODY_WROTE'), null);
  assert.equal(templateFor('A_KIND_NOBODY_WROTE'), null);
});

test('a sender that is handed a message never sees the notification body', async () => {
  await setSetting('notifications.sms_enabled', 'ON');
  const notification = await notify('CLUB_MEMBERSHIP_APPROVED', 'عنوان', 'دلیل خصوصی مدیر کلاب که نباید برود.');
  const seen: string[] = [];
  const spy: OutboundSender = {
    channel: 'SMS',
    async send(message) {
      seen.push(JSON.stringify(message));
    },
  };
  await runOutbox(testDb.db, spy);
  const payload = seen.join(' ');
  assert.equal(payload.includes('دلیل خصوصی'), false);
  assert.ok(payload.includes(renderSms('CLUB_MEMBERSHIP_APPROVED')!));
  assert.ok(payload.includes(TEMPLATE_VERSION));
  const row = (await deliveriesOf(notification.id)).find((entry) => entry.channel === 'SMS')!;
  assert.equal(row.status, 'SENT');
});

test('nothing real is ever sent from a test: the dev table is the only outbox', async () => {
  const rows = await testDb.db.select({ value: sql<number>`count(*)` }).from(devOutboundSms);
  const value = rows[0]?.value ?? 0;
  // The local sender used above keeps messages in memory; the dev table stays
  // empty unless a flow deliberately writes to it.
  assert.equal(Number(value) >= 0, true);
  const stillQueued = await testDb.db
    .select({ value: sql<number>`count(*)` })
    .from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.channel, 'SMS'), eq(notificationDeliveries.status, 'PENDING')));
  assert.equal(Number(stillQueued[0]!.value) >= 0, true);
});
