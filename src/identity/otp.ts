/**
 * One-time codes — §6.1.
 *
 * The states are the ones the source names: PHONE_INVALID, OTP_SENT,
 * OTP_RESENT, OTP_INVALID, OTP_EXPIRED, TOO_MANY_ATTEMPTS, OTP_VERIFIED, plus a
 * retryable technical failure.
 *
 * Every limit — lifetime, resend interval, attempt ceiling, lock duration and
 * the hourly send cap — is read from product settings, so none of them is a
 * constant in this file. The values are technical defaults (DEC-0006,
 * DEC-0016), not approved product policy.
 *
 * Only a hash of the code is stored, and the code never reaches a log or an
 * audit row. There is no bypass code and no development shortcut that returns
 * the code over HTTP.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { otpChallenges } from '../db/schema/identity.ts';
import { readInt } from '../settings/service.ts';
import { assertMobile } from '../domain/identity.ts';
import { AppError } from '../domain/errors.ts';
import type { SmsSender } from '../adapters/registry.ts';

export const CODE_LENGTH = 6;

export type OtpPurpose = 'LOGIN' | 'MOBILE_CHANGE';

export interface OtpPolicy {
  readonly ttlSeconds: number;
  readonly resendIntervalSeconds: number;
  readonly maxAttempts: number;
  readonly lockMinutes: number;
  readonly maxSendsPerHour: number;
}

export async function loadOtpPolicy(database: DbClient): Promise<OtpPolicy> {
  return {
    ttlSeconds: await readInt(database, 'otp.ttl_seconds'),
    resendIntervalSeconds: await readInt(database, 'otp.resend_interval_seconds'),
    maxAttempts: await readInt(database, 'otp.max_attempts'),
    lockMinutes: await readInt(database, 'otp.lock_minutes'),
    maxSendsPerHour: await readInt(database, 'otp.max_sends_per_hour'),
  };
}

function hashCode(challengeId: string, code: string): string {
  // The challenge id is unique per issue, so it salts the hash without needing
  // a shared secret and makes the same code in two challenges hash differently.
  return createHash('sha256').update(challengeId + ':' + code).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function newCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += String(randomInt(10));
  return code;
}

export type RequestOutcome =
  | {
      readonly state: 'OTP_SENT' | 'OTP_RESENT';
      readonly challengeId: string;
      readonly mobile: string;
      readonly expiresAt: Date;
      readonly resendAfterSeconds: number;
      readonly attemptsRemaining: number;
    }
  | { readonly state: 'RESEND_TOO_SOON'; readonly retryAfterSeconds: number; readonly challengeId: string }
  | { readonly state: 'TOO_MANY_ATTEMPTS'; readonly retryAfterSeconds: number };

export interface RequestOtpInput {
  readonly rawMobile: string;
  readonly purpose: OtpPurpose;
  readonly accountId?: string | null;
}

/**
 * Issue or resend a code.
 *
 * An unexpired challenge for the same mobile and purpose is resent rather than
 * replaced, so the countdown the user is watching stays the same code.
 */
export async function requestOtp(
  database: Database,
  input: RequestOtpInput,
  sms: SmsSender,
  now: Date = new Date(),
): Promise<RequestOutcome> {
  // PHONE_INVALID is raised by the caller-visible validation error.
  const mobile = assertMobile(input.rawMobile);
  const policy = await loadOtpPolicy(database);

  const windowStart = new Date(now.getTime() - 3_600_000);
  const [sent] = await database
    .select({ total: sql<string>`count(*)` })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.mobile, mobile), gte(otpChallenges.createdAt, windowStart)));
  if (Number(sent?.total ?? 0) >= policy.maxSendsPerHour) {
    return { state: 'TOO_MANY_ATTEMPTS', retryAfterSeconds: 3600 };
  }

  const [existing] = await database
    .select()
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.mobile, mobile),
        eq(otpChallenges.purpose, input.purpose),
        isNull(otpChallenges.consumedAt),
        gte(otpChallenges.expiresAt, now),
      ),
    )
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);

  if (existing) {
    if (existing.lockedUntil !== null && existing.lockedUntil > now) {
      return {
        state: 'TOO_MANY_ATTEMPTS',
        retryAfterSeconds: Math.ceil((existing.lockedUntil.getTime() - now.getTime()) / 1000),
      };
    }
    const elapsed = (now.getTime() - existing.lastSentAt.getTime()) / 1000;
    if (elapsed < policy.resendIntervalSeconds) {
      return {
        state: 'RESEND_TOO_SOON',
        retryAfterSeconds: Math.ceil(policy.resendIntervalSeconds - elapsed),
        challengeId: existing.id,
      };
    }

    // Resending issues a fresh code: the previous one stops working immediately.
    const code = newCode();
    const expiresAt = new Date(now.getTime() + policy.ttlSeconds * 1000);
    await database
      .update(otpChallenges)
      .set({
        codeHash: hashCode(existing.id, code),
        expiresAt,
        lastSentAt: now,
        resendCount: existing.resendCount + 1,
        attempts: 0,
      })
      .where(eq(otpChallenges.id, existing.id));
    await sms.send({ to: mobile, text: 'کد ورود همزیست: ' + code });
    return {
      state: 'OTP_RESENT',
      challengeId: existing.id,
      mobile,
      expiresAt,
      resendAfterSeconds: policy.resendIntervalSeconds,
      attemptsRemaining: policy.maxAttempts,
    };
  }

  const code = newCode();
  const expiresAt = new Date(now.getTime() + policy.ttlSeconds * 1000);
  const [created] = await database
    .insert(otpChallenges)
    .values({
      purpose: input.purpose,
      mobile,
      accountId: input.accountId ?? null,
      // Replaced immediately below; the id is needed to salt the hash.
      codeHash: 'pending',
      expiresAt,
      maxAttempts: policy.maxAttempts,
      lastSentAt: now,
    })
    .returning();

  const row = created!;
  await database
    .update(otpChallenges)
    .set({ codeHash: hashCode(row.id, code) })
    .where(eq(otpChallenges.id, row.id));

  await sms.send({ to: mobile, text: 'کد ورود همزیست: ' + code });

  return {
    state: 'OTP_SENT',
    challengeId: row.id,
    mobile,
    expiresAt,
    resendAfterSeconds: policy.resendIntervalSeconds,
    attemptsRemaining: policy.maxAttempts,
  };
}

export type VerifyOutcome =
  | { readonly state: 'OTP_VERIFIED'; readonly challengeId: string; readonly mobile: string; readonly accountId: string | null }
  | { readonly state: 'OTP_INVALID'; readonly attemptsRemaining: number }
  | { readonly state: 'OTP_EXPIRED' }
  | { readonly state: 'TOO_MANY_ATTEMPTS'; readonly retryAfterSeconds: number };

/**
 * Verify a code exactly once.
 *
 * The consuming update is conditional on the challenge still being unconsumed,
 * so a replayed code — or two requests racing with the same code — can only
 * succeed once.
 */
export async function verifyOtp(
  database: Database,
  input: { challengeId: string; code: string },
  now: Date = new Date(),
): Promise<VerifyOutcome> {
  const [challenge] = await database
    .select()
    .from(otpChallenges)
    .where(eq(otpChallenges.id, input.challengeId))
    .limit(1);
  if (!challenge) return { state: 'OTP_INVALID', attemptsRemaining: 0 };

  if (challenge.lockedUntil !== null && challenge.lockedUntil > now) {
    return {
      state: 'TOO_MANY_ATTEMPTS',
      retryAfterSeconds: Math.ceil((challenge.lockedUntil.getTime() - now.getTime()) / 1000),
    };
  }
  // A consumed code is spent, whether it is replayed a second later or a day later.
  if (challenge.consumedAt !== null) return { state: 'OTP_EXPIRED' };
  if (challenge.expiresAt <= now) return { state: 'OTP_EXPIRED' };

  const submitted = String(input.code).trim();
  const matches =
    /^\d+$/.test(submitted) && safeEqualHex(hashCode(challenge.id, submitted), challenge.codeHash);

  if (!matches) {
    const attempts = challenge.attempts + 1;
    const exhausted = attempts >= challenge.maxAttempts;
    const policy = await loadOtpPolicy(database);
    const lockedUntil = exhausted ? new Date(now.getTime() + policy.lockMinutes * 60_000) : null;
    await database
      .update(otpChallenges)
      .set({ attempts, lockedUntil })
      .where(eq(otpChallenges.id, challenge.id));
    if (exhausted) {
      return { state: 'TOO_MANY_ATTEMPTS', retryAfterSeconds: policy.lockMinutes * 60 };
    }
    return { state: 'OTP_INVALID', attemptsRemaining: challenge.maxAttempts - attempts };
  }

  const consumed = await database
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id });

  if (consumed.length === 0) return { state: 'OTP_EXPIRED' };

  return {
    state: 'OTP_VERIFIED',
    challengeId: challenge.id,
    mobile: challenge.mobile,
    accountId: challenge.accountId,
  };
}

/** Product-facing message for each state, so no screen invents its own wording. */
export const OTP_MESSAGE_FA: Record<string, string> = {
  PHONE_INVALID: 'شماره موبایل معتبر نیست. شماره را به شکل ۰۹xxxxxxxxx وارد کنید.',
  OTP_SENT: 'کد تأیید ارسال شد.',
  OTP_RESENT: 'کد تأیید دوباره ارسال شد.',
  OTP_INVALID: 'کد واردشده درست نیست.',
  OTP_EXPIRED: 'مهلت این کد تمام شده است. کد تازه بگیرید.',
  TOO_MANY_ATTEMPTS: 'تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
  RESEND_TOO_SOON: 'برای ارسال دوباره کد، کمی صبر کنید.',
};

export const otpError = (state: keyof typeof OTP_MESSAGE_FA) =>
  new AppError(state === 'TOO_MANY_ATTEMPTS' ? 'RATE_LIMITED' : 'VALIDATION', OTP_MESSAGE_FA[state]!);
