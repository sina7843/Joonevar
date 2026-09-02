/**
 * The security review, run against real persistence — gate `security-review`.
 *
 * §23 is checked where it is actually enforced: a private file is readable only
 * by the person it belongs to, an upload is judged by its bytes rather than its
 * name, a sign-in code is rate limited and never logged, a session token is
 * matched by hash, and a race is decided by the database rather than by the
 * order two requests happened to arrive in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { auditEvents, storedFiles } from '../../src/db/schema/core.ts';
import { microchips } from '../../src/db/schema/clinical.ts';
import { createTestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { saveProfile, signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { requestOtp, verifyOtp } from '../../src/identity/otp.ts';
import { createSession, hashToken, resolveSession, revokeSession } from '../../src/identity/session.ts';
import { putPrivateFile, readPrivateFile } from '../../src/files/storage.ts';
import { redact } from '../../src/audit/service.ts';
import { assertAcceptable } from '../../src/files/signature.ts';
import { localTestSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import { checkIn, createVisitRequests } from '../../src/vets/visits.ts';
import { animalWithSheet, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import { actorFor } from '../helpers/mating.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

const DEV = loadEnv({
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099910000', tmpPrefix: 'hamzist-sec-', councilCode: 'SYNTH-SC-1', chipBase: 3_000_000 },
    fn,
  );

test('a private file is readable by its owner and by nobody else', async () => {
  await withCtx(async (ctx) => {
    const file = await putPrivateFile(ctx.testDb.db, ctx.root, ctx.first.actor, {
      ownerAccountId: ctx.first.accountId,
      purpose: 'KYC_NATIONAL_ID',
      bytes: JPEG,
      originalName: '../../escape.jpg',
    });

    const own = await readPrivateFile(ctx.testDb.db, ctx.root, ctx.first.actor, file.id);
    assert.equal(own.bytes.length, JPEG.length);

    // Everyone except the owner and the one reviewing context §23.4 names is
    // refused; the genetics centre and another member are not reviewers of a
    // KYC document.
    for (const actor of [ctx.second.actor, ctx.vet.actor, ctx.centre.actor]) {
      await assert.rejects(
        () => readPrivateFile(ctx.testDb.db, ctx.root, actor, file.id),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
        'a KYC document is not readable by this context',
      );
    }
    // The association reviews identity documents, and only that purpose.
    const reviewed = await readPrivateFile(ctx.testDb.db, ctx.root, ctx.association.actor, file.id);
    assert.equal(reviewed.bytes.length, JPEG.length);

    const receipt = await putPrivateFile(ctx.testDb.db, ctx.root, ctx.first.actor, {
      ownerAccountId: ctx.first.accountId,
      purpose: 'GENETICS_RECEIPT',
      bytes: JPEG,
    });
    await assert.rejects(
      () => readPrivateFile(ctx.testDb.db, ctx.root, ctx.association.actor, receipt.id),
      (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      'a reviewer of one purpose is not a reviewer of another',
    );

    // The client-supplied name is never used as a path, and the stored key
    // stays inside the storage root.
    const [row] = await ctx.testDb.db.select().from(storedFiles).where(eq(storedFiles.id, file.id));
    assert.ok(!row!.storageKey.includes('..'));
    assert.match(row!.storageKey, /^kyc_national_id\/\d{4}\/[0-9a-f-]{36}\.jpg$/);

    // The audit row keeps the digest and the size, never the bytes or the name.
    const [event] = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetId, file.id));
    const after = event!.after as Record<string, unknown>;
    assert.ok('sha256' in after && 'sizeBytes' in after);
    assert.ok(!('bytes' in after) && !('originalName' in after));
  });
});

test('an upload is judged by its bytes, its size and its purpose', async () => {
  // A file that claims to be an image but is not one is refused.
  assert.throws(() => assertAcceptable('KYC_NATIONAL_ID', new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), /نوع فایل/);
  assert.throws(() => assertAcceptable('KYC_NATIONAL_ID', new Uint8Array()), /خالی/);
  // A real image is accepted, and so is a PNG.
  assert.equal(assertAcceptable('KYC_NATIONAL_ID', JPEG), 'image/jpeg');
  assert.equal(assertAcceptable('KYC_NATIONAL_ID', PNG), 'image/png');
  // Over the limit is refused with the limit in the message.
  const huge = new Uint8Array(11 * 1024 * 1024);
  huge.set(JPEG, 0);
  assert.throws(() => assertAcceptable('KYC_NATIONAL_ID', huge), /حجم فایل/);
});

test('the sign-in code is rate limited, single use and never written to a log', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-otp-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    const mobile = '09991100001';
    const sink: Array<{ to: string; text: string }> = [];
    const sms = localTestSmsSender(sink, DEV);

    const first = await requestOtp(testDb.db, { rawMobile: mobile, purpose: 'LOGIN' }, sms);
    assert.equal(first.state, 'OTP_SENT');
    const challengeId = first.challengeId;

    // A resend inside the interval is answered with the wait, not a new code.
    const tooSoon = await requestOtp(testDb.db, { rawMobile: mobile, purpose: 'LOGIN' }, sms);
    assert.equal(tooSoon.state === 'RESEND_TOO_SOON' || tooSoon.state === 'OTP_RESENT', true);
    assert.equal(sink.length, 1, 'no second message left the process inside the interval');

    const code = /(\d{6})/.exec(sink.at(-1)!.text)![1]!;
    // A wrong code does not sign anybody in, and the right one works once.
    const wrong = await verifyOtp(testDb.db, { challengeId, code: '000000' });
    assert.notEqual(wrong.state, 'OTP_VERIFIED');
    const verified = await verifyOtp(testDb.db, { challengeId, code });
    assert.equal(verified.state, 'OTP_VERIFIED');
    const replay = await verifyOtp(testDb.db, { challengeId, code });
    assert.notEqual(replay.state, 'OTP_VERIFIED', 'a code is single use');

    // §23.3: the code is never in the audit log, only in the message that was
    // sent to that number.
    const events = await testDb.db.select().from(auditEvents);
    for (const event of events) {
      assert.ok(!JSON.stringify(event.after ?? {}).includes(code), 'no audit row may contain the code');
      assert.ok(!JSON.stringify(event.before ?? {}).includes(code));
    }
    const outbox = await testDb.db.execute<{ value: string }>(
      sql`select count(*)::text as value from dev_outbound_sms`,
    );
    assert.equal(outbox.rows[0]!.value, '0', 'the local sender writes nowhere but its own sink');
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('redaction removes the values that must never be logged', () => {
  const redacted = redact({
    otp: '123456',
    token: 'abc',
    nationalId: '0499370899',
    cardNumber: '6037000000000000',
    nested: { password: 'x', keep: 'visible' },
    list: [{ secret: 's' }],
  }) as Record<string, unknown>;

  assert.equal(redacted.otp, '[redacted]');
  assert.equal(redacted.token, '[redacted]');
  assert.equal(redacted.nationalId, '[redacted]');
  assert.equal(redacted.cardNumber, '[redacted]');
  assert.equal((redacted.nested as Record<string, unknown>).password, '[redacted]');
  assert.equal((redacted.nested as Record<string, unknown>).keep, 'visible');
  assert.equal(((redacted.list as unknown[])[0] as Record<string, unknown>).secret, '[redacted]');
});

test('a session is matched by hash, and revoking it ends it on the server', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-session-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    const account = await signInWithVerifiedMobile(testDb.db, '09991100002');
    const session = await createSession(testDb.db, account.accountId, 'USER');

    const found = await resolveSession(testDb.db, session.token);
    assert.equal(found?.actor.accountId, account.accountId);

    // A forged token is not a session, and the raw token is never stored: the
    // row holds its hash.
    assert.equal(await resolveSession(testDb.db, 'forged-token-value'), null);
    const rows = await testDb.db.execute<{ token_hash: string }>(
      sql`select token_hash from session limit 1`,
    );
    assert.ok(rows.rows[0]);
    assert.notEqual(rows.rows[0]!.token_hash, session.token, 'the raw token is never stored');
    assert.equal(rows.rows[0]!.token_hash, hashToken(session.token));

    await revokeSession(testDb.db, session.sessionId);
    assert.equal(await resolveSession(testDb.db, session.token), null);
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('one microchip number can belong to one animal only', async () => {
  await withCtx(async (ctx) => {
    // Two animals really taken through the implant path each get their own
    // number, and the unique index is what makes that true rather than the
    // order the two visits happened in.
    const first = await animalWithSheet(ctx, 'سگ چیپ یک', { skipSheet: true });
    const second = await animalWithSheet(ctx, 'سگ چیپ دو', { skipSheet: true });
    const bound = await ctx.testDb.db.select().from(microchips);
    const numbers = bound.map((row) => row.number);
    assert.equal(new Set(numbers).size, numbers.length, 'no number is bound twice');

    // Writing the same number onto a second animal is refused by the database.
    const [existing] = bound;
    await assert.rejects(
      () =>
        ctx.testDb.db.insert(microchips).values({
          animalId: second.animalId,
          number: existing!.number,
          readMethod: 'MANUAL',
          boundVia: 'EXISTING_UNREGISTERED',
          boundByAccountId: ctx.vet.accountId,
        }),
      'a duplicate number is refused at the storage level',
    );
    assert.ok(first.animalId);
  });
});

test('a visit code is refused at another veterinarian and at another location', async () => {
  await withCtx(async (ctx) => {
    const draftAnimal = await animalWithSheet(ctx, 'سگ کد امنیت', { skipSheet: true });
    const created = await createVisitRequests(ctx.testDb.db, ctx.first.actor, {
      context: 'DNA',
      vetAccountId: ctx.vet.accountId,
      locationId: ctx.locationId,
      items: [{ animalId: draftAnimal.animalId, serviceType: 'DNA_RESAMPLING' }],
    });
    const code = created.items[0]!.referral.code;

    // The owner is not a veterinarian, and another account cannot present it.
    await assert.rejects(
      () => checkIn(ctx.testDb.db, ctx.first.actor, { code, locationId: ctx.locationId }),
      /دامپزشک معتمد/,
    );
    const strangerVet: Actor = {
      ...actorFor(ctx.second.accountId, 'TRUSTED_VET'),
      accountId: ctx.second.accountId as AccountId,
    };
    await assert.rejects(
      () => checkIn(ctx.testDb.db, strangerVet, { code, locationId: ctx.locationId }),
      /دامپزشک|تأیید حرفه‌ای/,
    );
    // The assigned veterinarian at a location that is not the request's own is
    // refused too.
    const wrongLocation = await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code,
      locationId: '00000000-0000-0000-0000-000000000000',
    });
    assert.equal(wrongLocation.ok, false);
  });
});

test('a KYC document of one person never reaches another operator context', async () => {
  await withCtx(async (ctx) => {
    const account = await signInWithVerifiedMobile(ctx.testDb.db, '09991100003');
    const actor = actorFor(account.accountId);
    await saveProfile(ctx.testDb.db, actor, {
      firstName: 'نمونه',
      lastName: 'کاربر امنیت',
      nationalId: '9000000017',
      birthDate: '1990-01-01',
    });
    await attachKycDocument(ctx.testDb.db, ctx.root, actor, { bytes: JPEG });
    const submitted = await submitKyc(ctx.testDb.db, actor);

    // The reviewing operator may read the document of the case they review.
    const [file] = await ctx.testDb.db
      .select()
      .from(storedFiles)
      .where(eq(storedFiles.ownerAccountId, account.accountId));
    const read = await readPrivateFile(ctx.testDb.db, ctx.root, ctx.association.actor, file!.id);
    assert.equal(read.bytes.length, JPEG.length);

    // The genetics centre and another member never may.
    for (const other of [ctx.centre.actor, ctx.second.actor]) {
      await assert.rejects(
        () => readPrivateFile(ctx.testDb.db, ctx.root, other, file!.id),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      );
    }

    await reviewKyc(ctx.testDb.db, ctx.association.actor, { caseId: submitted.id, decision: 'APPROVED' });
  });
});
