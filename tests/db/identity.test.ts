import test from 'node:test';
import assert from 'node:assert/strict';
import { desc, eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accounts, auditEvents, notifications } from '../../src/db/schema/core.ts';
import { devOutboundSms, otpChallenges, profiles, sessions } from '../../src/db/schema/identity.ts';
import { requestOtp, verifyOtp } from '../../src/identity/otp.ts';
import {
  createSession,
  hashToken,
  resolveSession,
  revokeSession,
  setSessionContext,
} from '../../src/identity/session.ts';
import {
  assertMobileAvailable,
  confirmMobileChange,
  findResidence,
  saveProfile,
  saveResidence,
  signInWithVerifiedMobile,
} from '../../src/identity/account.ts';
import {
  attachKycDocument,
  canRegisterAnimal,
  findCase,
  getOrCreateCase,
  kycQueue,
  reviewKyc,
  submitKyc,
} from '../../src/identity/kyc.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { readPrivateFile } from '../../src/files/storage.ts';
import { devOutboxSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEV = loadEnv({
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
});

const VALID_ID_A = '0499370899';
const VALID_ID_B = '0790419904';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const actorFor = (accountId: string, context: Actor['context'] = 'USER'): Actor => ({
  accountId: accountId as AccountId,
  context,
  activeRoles: context === 'USER' ? [] : [context as never],
});

async function withDb(fn: (testDb: TestDb) => Promise<void>) {
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    await fn(testDb);
  } finally {
    await testDb.drop();
  }
}

/** Reads the code the development outbox recorded; there is no HTTP path to it. */
async function lastCode(testDb: TestDb, mobile: string): Promise<string> {
  const [row] = await testDb.db
    .select()
    .from(devOutboundSms)
    .where(eq(devOutboundSms.toMobile, mobile))
    .orderBy(desc(devOutboundSms.createdAt))
    .limit(1);
  const match = /(\d{6})/.exec(row?.body ?? '');
  assert.ok(match, 'no code was sent to ' + mobile);
  return match![1]!;
}

test('a code is sent, verified once, and cannot be replayed', async () => {
  await withDb(async (testDb) => {
    const sms = devOutboxSmsSender(testDb.db, DEV);
    const sent = await requestOtp(testDb.db, { rawMobile: '09123456789', purpose: 'LOGIN' }, sms);
    assert.equal(sent.state, 'OTP_SENT');
    assert.ok(sent.state === 'OTP_SENT');

    const code = await lastCode(testDb, '09123456789');

    const first = await verifyOtp(testDb.db, { challengeId: sent.challengeId, code });
    assert.equal(first.state, 'OTP_VERIFIED');

    // The same code a second time is spent, not accepted.
    const replay = await verifyOtp(testDb.db, { challengeId: sent.challengeId, code });
    assert.equal(replay.state, 'OTP_EXPIRED');
  });
});

test('the stored code is a hash, and it never appears in the audit trail', async () => {
  await withDb(async (testDb) => {
    const sms = devOutboxSmsSender(testDb.db, DEV);
    const sent = await requestOtp(testDb.db, { rawMobile: '09123456780', purpose: 'LOGIN' }, sms);
    assert.ok(sent.state === 'OTP_SENT');
    const code = await lastCode(testDb, '09123456780');

    const [row] = await testDb.db.select().from(otpChallenges).where(eq(otpChallenges.id, sent.challengeId));
    assert.notEqual(row?.codeHash, code);
    assert.match(row!.codeHash, /^[0-9a-f]{64}$/);

    await verifyOtp(testDb.db, { challengeId: sent.challengeId, code });
    await signInWithVerifiedMobile(testDb.db, '09123456780');

    const events = await testDb.db.select().from(auditEvents);
    const serialized = JSON.stringify(events);
    assert.ok(!serialized.includes(code), 'the code must never reach the audit trail');
    assert.ok(!serialized.includes('09123456780'), 'the full mobile number is masked in audit');
    assert.ok(serialized.includes('0912***80'));
  });
});

test('a wrong code consumes an attempt and the ceiling locks the challenge', async () => {
  await withDb(async (testDb) => {
    const sms = devOutboxSmsSender(testDb.db, DEV);
    const sent = await requestOtp(testDb.db, { rawMobile: '09123456781', purpose: 'LOGIN' }, sms);
    assert.ok(sent.state === 'OTP_SENT');
    const real = await lastCode(testDb, '09123456781');
    const wrong = real === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt < 5; attempt += 1) {
      const outcome = await verifyOtp(testDb.db, { challengeId: sent.challengeId, code: wrong });
      assert.equal(outcome.state, 'OTP_INVALID');
      assert.ok(outcome.state === 'OTP_INVALID');
      assert.equal(outcome.attemptsRemaining, 5 - attempt);
    }

    const locked = await verifyOtp(testDb.db, { challengeId: sent.challengeId, code: wrong });
    assert.equal(locked.state, 'TOO_MANY_ATTEMPTS');

    // Even the correct code is refused while the lock holds.
    const afterLock = await verifyOtp(testDb.db, { challengeId: sent.challengeId, code: real });
    assert.equal(afterLock.state, 'TOO_MANY_ATTEMPTS');
  });
});

test('an expired code is refused', async () => {
  await withDb(async (testDb) => {
    const sms = devOutboxSmsSender(testDb.db, DEV);
    const sent = await requestOtp(testDb.db, { rawMobile: '09123456782', purpose: 'LOGIN' }, sms);
    assert.ok(sent.state === 'OTP_SENT');
    const code = await lastCode(testDb, '09123456782');

    const later = new Date(Date.now() + 121_000);
    const outcome = await verifyOtp(testDb.db, { challengeId: sent.challengeId, code }, later);
    assert.equal(outcome.state, 'OTP_EXPIRED');
  });
});

test('resend respects the interval and then issues a fresh code that replaces the old one', async () => {
  await withDb(async (testDb) => {
    const sms = devOutboxSmsSender(testDb.db, DEV);
    const first = await requestOtp(testDb.db, { rawMobile: '09123456783', purpose: 'LOGIN' }, sms);
    assert.ok(first.state === 'OTP_SENT');
    const firstCode = await lastCode(testDb, '09123456783');

    const tooSoon = await requestOtp(testDb.db, { rawMobile: '09123456783', purpose: 'LOGIN' }, sms);
    assert.equal(tooSoon.state, 'RESEND_TOO_SOON');
    assert.ok(tooSoon.state === 'RESEND_TOO_SOON');
    assert.ok(tooSoon.retryAfterSeconds > 0 && tooSoon.retryAfterSeconds <= 60);

    const later = new Date(Date.now() + 61_000);
    const resent = await requestOtp(testDb.db, { rawMobile: '09123456783', purpose: 'LOGIN' }, sms, later);
    assert.equal(resent.state, 'OTP_RESENT');
    assert.ok(resent.state === 'OTP_RESENT');
    assert.equal(resent.challengeId, first.challengeId, 'the same challenge is reused');

    const secondCode = await lastCode(testDb, '09123456783');
    assert.notEqual(secondCode, firstCode);

    // The superseded code no longer works.
    const stale = await verifyOtp(testDb.db, { challengeId: first.challengeId, code: firstCode }, later);
    assert.equal(stale.state, 'OTP_INVALID');
    const fresh = await verifyOtp(testDb.db, { challengeId: first.challengeId, code: secondCode }, later);
    assert.equal(fresh.state, 'OTP_VERIFIED');
  });
});

test('the hourly send cap stops a flood for one number', async () => {
  await withDb(async (testDb) => {
    const sms = devOutboxSmsSender(testDb.db, DEV);
    const mobile = '09123456784';
    let clock = Date.now();

    for (let i = 0; i < 5; i += 1) {
      const outcome = await requestOtp(testDb.db, { rawMobile: mobile, purpose: 'LOGIN' }, sms, new Date(clock));
      assert.ok(outcome.state === 'OTP_SENT' || outcome.state === 'OTP_RESENT', 'send ' + i + ' -> ' + outcome.state);
      // Move past the resend interval and expire the challenge, so each call is a new send.
      clock += 200_000;
    }

    const capped = await requestOtp(testDb.db, { rawMobile: mobile, purpose: 'LOGIN' }, sms, new Date(clock));
    assert.equal(capped.state, 'TOO_MANY_ATTEMPTS');

    // A different number is unaffected.
    const other = await requestOtp(testDb.db, { rawMobile: '09123456785', purpose: 'LOGIN' }, sms, new Date(clock));
    assert.ok(other.state === 'OTP_SENT');
  });
});

test('signing in creates a PROFILE_INCOMPLETE account and returning does not recreate it', async () => {
  await withDb(async (testDb) => {
    const first = await signInWithVerifiedMobile(testDb.db, '+989123456786');
    assert.equal(first.isNew, true);
    assert.equal(first.status, 'PROFILE_INCOMPLETE');

    // The same number written differently resolves to the same account.
    const second = await signInWithVerifiedMobile(testDb.db, '09123456786');
    assert.equal(second.isNew, false);
    assert.equal(second.accountId, first.accountId);
    assert.equal((await testDb.db.select().from(accounts)).length, 1);
  });
});

test('two sign-ins racing on the same new number create exactly one account', async () => {
  await withDb(async (testDb) => {
    const results = await Promise.all([
      signInWithVerifiedMobile(testDb.db, '09123456787'),
      signInWithVerifiedMobile(testDb.db, '09123456787'),
      signInWithVerifiedMobile(testDb.db, '09123456787'),
    ]);
    const ids = new Set(results.map((r) => r.accountId));
    assert.equal(ids.size, 1);
    assert.equal((await testDb.db.select().from(accounts)).length, 1);
  });
});

test('a session token is stored only as a hash and resolves to the real roles', async () => {
  await withDb(async (testDb) => {
    const account = await signInWithVerifiedMobile(testDb.db, '09123456788');
    const issued = await createSession(testDb.db, account.accountId);

    const [row] = await testDb.db.select().from(sessions).where(eq(sessions.id, issued.sessionId));
    assert.notEqual(row?.tokenHash, issued.token);
    assert.equal(row?.tokenHash, hashToken(issued.token));

    const resolved = await resolveSession(testDb.db, issued.token);
    assert.equal(resolved?.actor.accountId, account.accountId);
    assert.equal(resolved?.actor.context, 'USER');
    assert.deepEqual(resolved?.actor.activeRoles, []);

    assert.equal(await resolveSession(testDb.db, 'not-a-token'), null);
    assert.equal(await resolveSession(testDb.db, undefined), null);

    await revokeSession(testDb.db, issued.sessionId);
    assert.equal(await resolveSession(testDb.db, issued.token), null);
  });
});

test('a session cannot hold a context the account does not have', async () => {
  await withDb(async (testDb) => {
    const account = await signInWithVerifiedMobile(testDb.db, '09123450001');
    const issued = await createSession(testDb.db, account.accountId);
    await assert.rejects(
      () => setSessionContext(testDb.db, issued.sessionId, 'SUPERADMIN'),
      /does not hold the SUPERADMIN role/,
    );

    // A context written directly into the row still falls back to USER on resolve.
    await testDb.db.update(sessions).set({ context: 'SUPERADMIN' }).where(eq(sessions.id, issued.sessionId));
    const resolved = await resolveSession(testDb.db, issued.token);
    assert.equal(resolved?.actor.context, 'USER');
  });
});

test('the profile enforces national id uniqueness under a race', async () => {
  await withDb(async (testDb) => {
    const a = await signInWithVerifiedMobile(testDb.db, '09123450002');
    const b = await signInWithVerifiedMobile(testDb.db, '09123450003');

    const input = { firstName: 'علی', lastName: 'رضایی', nationalId: VALID_ID_A, birthDate: '1990-05-20' };
    const outcomes = await Promise.allSettled([
      saveProfile(testDb.db, actorFor(a.accountId), input),
      saveProfile(testDb.db, actorFor(b.accountId), input),
    ]);

    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((o) => o.status === 'rejected');
    assert.match(String((rejected as PromiseRejectedResult).reason?.message), /قبلاً برای حساب دیگری ثبت شده/);
    assert.equal((await testDb.db.select().from(profiles)).length, 1);
  });
});

test('completing the identity group activates the account without approving KYC', async () => {
  await withDb(async (testDb) => {
    const account = await signInWithVerifiedMobile(testDb.db, '09123450004');
    await saveProfile(testDb.db, actorFor(account.accountId), {
      firstName: 'مریم',
      lastName: 'کاظمی',
      nationalId: VALID_ID_A,
      birthDate: '1992-03-11',
    });

    const [row] = await testDb.db.select().from(accounts).where(eq(accounts.id, account.accountId));
    assert.equal(row?.status, 'ACTIVE');
    // Account state and KYC state stay separate (§4).
    assert.equal(await canRegisterAnimal(testDb.db, account.accountId), false);
  });
});

test('residence may be saved completely empty and is validated when filled', async () => {
  await withDb(async (testDb) => {
    const account = await signInWithVerifiedMobile(testDb.db, '09123450005');
    const actor = actorFor(account.accountId);

    await saveResidence(testDb.db, actor, {});
    const empty = await findResidence(testDb.db, account.accountId);
    assert.equal(empty?.address, null);
    assert.equal(empty?.postalCode, null);

    await assert.rejects(() => saveResidence(testDb.db, actor, { postalCode: '123' }), /ده رقم/);

    await saveResidence(testDb.db, actor, { province: 'تهران', postalCode: '1234567890' });
    const filled = await findResidence(testDb.db, account.accountId);
    assert.equal(filled?.postalCode, '1234567890');

    // Still nothing about residence blocks KYC or registration.
    assert.equal(await canRegisterAnimal(testDb.db, account.accountId), false);
  });
});

test('KYC runs submit, correction and approval while keeping the valid file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-kyc-'));
  try {
    await withDb(async (testDb) => {
      const applicant = await signInWithVerifiedMobile(testDb.db, '09123450006');
      const operator = await signInWithVerifiedMobile(testDb.db, '09123450007');
      const applicantActor = actorFor(applicant.accountId);
      const operatorActor = actorFor(operator.accountId, 'ASSOCIATION_OPERATOR');

      await saveProfile(testDb.db, applicantActor, {
        firstName: 'سارا',
        lastName: 'نوری',
        nationalId: VALID_ID_B,
        birthDate: '1995-01-01',
      });

      // Submitting without a document is refused.
      await assert.rejects(() => submitKyc(testDb.db, applicantActor), /تصویر کارت ملی/);

      const attached = await attachKycDocument(testDb.db, root, applicantActor, { bytes: JPEG, originalName: 'card.jpg' });
      assert.ok(attached.documentFileId);

      const submitted = await submitKyc(testDb.db, applicantActor);
      assert.equal(submitted.status, 'UNDER_REVIEW');

      // The queue is the association operator's, and only theirs.
      await assert.rejects(() => kycQueue(testDb.db, applicantActor, { page: 1, pageSize: 10 }), /اپراتور انجمن/);
      const queue = await kycQueue(testDb.db, operatorActor, { page: 1, pageSize: 10 });
      assert.equal(queue.total, 1);
      assert.equal(queue.items[0]?.applicantName, 'سارا نوری');

      // A correction requires a reason.
      await assert.rejects(
        () => reviewKyc(testDb.db, operatorActor, { caseId: submitted.id, decision: 'NEEDS_CORRECTION' }),
        /ثبت دلیل الزامی است/,
      );

      const corrected = await reviewKyc(testDb.db, operatorActor, {
        caseId: submitted.id,
        decision: 'NEEDS_CORRECTION',
        reasonFa: 'تصویر خوانا نیست.',
        expectedVersion: submitted.version,
      });
      assert.equal(corrected.status, 'NEEDS_CORRECTION');
      // The previously uploaded file is still attached (§6.3, §26).
      assert.equal(corrected.documentFileId, attached.documentFileId);

      const notified = await testDb.db.select().from(notifications).where(eq(notifications.recipientAccountId, applicant.accountId));
      assert.equal(notified.length, 1);
      assert.equal(notified[0]?.originRoute, '/account/kyc');
      assert.equal(notified[0]?.step, 'CORRECT_DOCUMENT');

      // Resubmitting the same case clears the reason but keeps the history.
      const resubmitted = await submitKyc(testDb.db, applicantActor);
      assert.equal(resubmitted.status, 'UNDER_REVIEW');
      assert.equal(resubmitted.reasonFa, null);
      assert.equal(resubmitted.documentFileId, attached.documentFileId);

      const approved = await reviewKyc(testDb.db, operatorActor, {
        caseId: submitted.id,
        decision: 'APPROVED',
        expectedVersion: resubmitted.version,
      });
      assert.equal(approved.status, 'APPROVED');
      assert.equal(await canRegisterAnimal(testDb.db, applicant.accountId), true);

      const trail = await testDb.db.select().from(auditEvents).where(eq(auditEvents.targetId, submitted.id));
      assert.ok(trail.length >= 4, 'attach, submit, review, resubmit and review are all audited');
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a stale review decision is rejected and a non-operator cannot review', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-kyc2-'));
  try {
    await withDb(async (testDb) => {
      const applicant = await signInWithVerifiedMobile(testDb.db, '09123450008');
      const operator = await signInWithVerifiedMobile(testDb.db, '09123450009');
      const applicantActor = actorFor(applicant.accountId);
      const operatorActor = actorFor(operator.accountId, 'ASSOCIATION_OPERATOR');

      await saveProfile(testDb.db, applicantActor, { firstName: 'رضا', lastName: 'مرادی', nationalId: VALID_ID_A, birthDate: '1988-02-02' });
      await attachKycDocument(testDb.db, root, applicantActor, { bytes: JPEG });
      const submitted = await submitKyc(testDb.db, applicantActor);

      await assert.rejects(
        () => reviewKyc(testDb.db, applicantActor, { caseId: submitted.id, decision: 'APPROVED' }),
        /محیط عملیاتی انجمن/,
      );
      await assert.rejects(
        () => reviewKyc(testDb.db, actorFor(operator.accountId, 'GENETICS_OPERATOR'), { caseId: submitted.id, decision: 'APPROVED' }),
        /محیط عملیاتی انجمن/,
      );
      await assert.rejects(
        () => reviewKyc(testDb.db, operatorActor, { caseId: submitted.id, decision: 'APPROVED', expectedVersion: submitted.version - 1 }),
        /هم‌زمان تغییر کرده/,
      );

      const approved = await reviewKyc(testDb.db, operatorActor, { caseId: submitted.id, decision: 'APPROVED', expectedVersion: submitted.version });
      assert.equal(approved.status, 'APPROVED');
      // A decision on an already decided case is refused.
      await assert.rejects(
        () => reviewKyc(testDb.db, operatorActor, { caseId: submitted.id, decision: 'REJECTED', reasonFa: 'دلیل آزمایشی' }),
        /در انتظار بررسی نیست/,
      );
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('the KYC document is private: owner and association reviewer only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-kyc3-'));
  try {
    await withDb(async (testDb) => {
      const applicant = await signInWithVerifiedMobile(testDb.db, '09123450010');
      const stranger = await signInWithVerifiedMobile(testDb.db, '09123450011');
      const applicantActor = actorFor(applicant.accountId);

      await saveProfile(testDb.db, applicantActor, { firstName: 'نگار', lastName: 'صادقی', nationalId: VALID_ID_B, birthDate: '1993-07-07' });
      const attached = await attachKycDocument(testDb.db, root, applicantActor, { bytes: JPEG });
      const fileId = attached.documentFileId!;

      const mine = await readPrivateFile(testDb.db, root, applicantActor, fileId);
      assert.deepEqual(new Uint8Array(mine.bytes), JPEG);

      await assert.rejects(() => readPrivateFile(testDb.db, root, actorFor(stranger.accountId), fileId), /Not permitted/);
      await assert.rejects(() => readPrivateFile(testDb.db, root, actorFor(stranger.accountId, 'SUPERADMIN'), fileId), /Not permitted/);
      await assert.rejects(() => readPrivateFile(testDb.db, root, actorFor(stranger.accountId, 'GENETICS_OPERATOR'), fileId), /Not permitted/);

      const reviewer = await readPrivateFile(testDb.db, root, actorFor(stranger.accountId, 'ASSOCIATION_OPERATOR'), fileId);
      assert.equal(reviewer.record.purpose, 'KYC_NATIONAL_ID');
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('after approval the name and birth date stay editable while the national id is locked', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-kyc4-'));
  try {
    await withDb(async (testDb) => {
      const applicant = await signInWithVerifiedMobile(testDb.db, '09123450012');
      const operator = await signInWithVerifiedMobile(testDb.db, '09123450013');
      const applicantActor = actorFor(applicant.accountId);
      const operatorActor = actorFor(operator.accountId, 'ASSOCIATION_OPERATOR');

      await saveProfile(testDb.db, applicantActor, { firstName: 'حسن', lastName: 'الفت', nationalId: VALID_ID_A, birthDate: '1985-04-04' });
      await attachKycDocument(testDb.db, root, applicantActor, { bytes: JPEG });
      const submitted = await submitKyc(testDb.db, applicantActor);
      await reviewKyc(testDb.db, operatorActor, { caseId: submitted.id, decision: 'APPROVED' });

      // §6.4: directly editable, no support gate and no second KYC.
      const edited = await saveProfile(testDb.db, applicantActor, {
        firstName: 'حسین',
        lastName: 'بهرامی',
        nationalId: VALID_ID_A,
        birthDate: '1985-05-05',
        displayName: 'حسین ب.',
        displayNameVisible: true,
      });
      assert.equal(edited.firstName, 'حسین');
      assert.equal(edited.birthDate, '1985-05-05');
      assert.equal(edited.displayNameVisible, true);
      assert.equal((await findCase(testDb.db, applicant.accountId))?.status, 'APPROVED', 'editing does not reopen KYC');

      await assert.rejects(
        () => saveProfile(testDb.db, applicantActor, { firstName: 'حسین', lastName: 'بهرامی', nationalId: VALID_ID_B, birthDate: '1985-05-05' }),
        /کد ملی پس از تأیید احراز هویت قابل تغییر نیست/,
      );
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a failed or cancelled mobile change leaves the current number untouched', async () => {
  await withDb(async (testDb) => {
    const account = await signInWithVerifiedMobile(testDb.db, '09123450014');
    const actor = actorFor(account.accountId);
    const session = await createSession(testDb.db, account.accountId);
    const sms = devOutboxSmsSender(testDb.db, DEV);

    const started = await requestOtp(
      testDb.db,
      { rawMobile: '09123450015', purpose: 'MOBILE_CHANGE', accountId: account.accountId },
      sms,
    );
    assert.ok(started.state === 'OTP_SENT');

    // Wrong code: nothing changes.
    const wrong = await confirmMobileChange(testDb.db, actor, {
      challengeId: started.challengeId,
      code: '000000',
      sessionId: session.sessionId,
    });
    assert.notEqual(wrong.outcome.state, 'OTP_VERIFIED');
    let [row] = await testDb.db.select().from(accounts).where(eq(accounts.id, account.accountId));
    assert.equal(row?.mobile, '09123450014');

    // Simply abandoning the flow also changes nothing.
    [row] = await testDb.db.select().from(accounts).where(eq(accounts.id, account.accountId));
    assert.equal(row?.mobile, '09123450014');

    // The correct code moves the number and keeps the acting session alive.
    const code = await lastCode(testDb, '09123450015');
    const done = await confirmMobileChange(testDb.db, actor, {
      challengeId: started.challengeId,
      code,
      sessionId: session.sessionId,
    });
    assert.equal(done.outcome.state, 'OTP_VERIFIED');
    [row] = await testDb.db.select().from(accounts).where(eq(accounts.id, account.accountId));
    assert.equal(row?.mobile, '09123450015');
    assert.ok(await resolveSession(testDb.db, session.token));
  });
});

test('a login code cannot be replayed as a mobile change, and a taken number is refused', async () => {
  await withDb(async (testDb) => {
    const owner = await signInWithVerifiedMobile(testDb.db, '09123450016');
    const other = await signInWithVerifiedMobile(testDb.db, '09123450017');
    const actor = actorFor(owner.accountId);
    const session = await createSession(testDb.db, owner.accountId);
    const sms = devOutboxSmsSender(testDb.db, DEV);

    // A LOGIN challenge for a different number must not be usable here.
    const login = await requestOtp(testDb.db, { rawMobile: '09123450018', purpose: 'LOGIN' }, sms);
    assert.ok(login.state === 'OTP_SENT');
    const code = await lastCode(testDb, '09123450018');
    await assert.rejects(
      () => confirmMobileChange(testDb.db, actor, { challengeId: login.challengeId, code, sessionId: session.sessionId }),
      /برای تغییر شماره این حساب صادر نشده/,
    );
    const [row] = await testDb.db.select().from(accounts).where(eq(accounts.id, owner.accountId));
    assert.equal(row?.mobile, '09123450016');

    // A number already used by another account is refused before any code is sent.
    await assert.rejects(() => assertMobileAvailable(testDb.db, '09123450017', owner.accountId), /قبلاً برای حساب دیگری/);
    assert.ok(other.accountId);
    await assert.rejects(() => assertMobileAvailable(testDb.db, '09123450016', owner.accountId), /همان شماره فعلی/);
  });
});

test('changing the mobile ends the account other sessions', async () => {
  await withDb(async (testDb) => {
    const account = await signInWithVerifiedMobile(testDb.db, '09123450019');
    const actor = actorFor(account.accountId);
    const keep = await createSession(testDb.db, account.accountId);
    const otherDevice = await createSession(testDb.db, account.accountId);
    const sms = devOutboxSmsSender(testDb.db, DEV);

    const started = await requestOtp(
      testDb.db,
      { rawMobile: '09123450020', purpose: 'MOBILE_CHANGE', accountId: account.accountId },
      sms,
    );
    assert.ok(started.state === 'OTP_SENT');
    const code = await lastCode(testDb, '09123450020');
    await confirmMobileChange(testDb.db, actor, { challengeId: started.challengeId, code, sessionId: keep.sessionId });

    assert.ok(await resolveSession(testDb.db, keep.token), 'the acting session survives');
    assert.equal(await resolveSession(testDb.db, otherDevice.token), null, 'other devices are signed out');
  });
});

test('OTP limits come from settings, so changing a setting changes the behaviour', async () => {
  await withDb(async (testDb) => {
    const admin = await signInWithVerifiedMobile(testDb.db, '09123450021');
    await updateSetting(testDb.db, actorFor(admin.accountId, 'SUPERADMIN'), { key: 'otp.max_attempts', value: 3 });

    const sms = devOutboxSmsSender(testDb.db, DEV);
    const sent = await requestOtp(testDb.db, { rawMobile: '09123450022', purpose: 'LOGIN' }, sms);
    assert.ok(sent.state === 'OTP_SENT');
    assert.equal(sent.attemptsRemaining, 3);

    for (let i = 0; i < 2; i += 1) {
      const outcome = await verifyOtp(testDb.db, { challengeId: sent.challengeId, code: '000000' });
      assert.equal(outcome.state, 'OTP_INVALID');
    }
    const locked = await verifyOtp(testDb.db, { challengeId: sent.challengeId, code: '000000' });
    assert.equal(locked.state, 'TOO_MANY_ATTEMPTS');
  });
});

test('a KYC case belongs to exactly one account', async () => {
  await withDb(async (testDb) => {
    const account = await signInWithVerifiedMobile(testDb.db, '09123450023');
    const first = await getOrCreateCase(testDb.db, account.accountId);
    const second = await getOrCreateCase(testDb.db, account.accountId);
    assert.equal(first.id, second.id);
  });
});
