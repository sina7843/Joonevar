'use server';

import { cookies } from 'next/headers';
import { currentSmsSender } from '../../src/adapters/current.ts';
import { redirect } from 'next/navigation';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { requestOtp, verifyOtp, OTP_MESSAGE_FA } from '../../src/identity/otp.ts';
import { createSession, SESSION_COOKIE } from '../../src/identity/session.ts';
import { signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { findProfile } from '../../src/identity/account.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface LoginState {
  readonly step: 'MOBILE' | 'CODE';
  readonly challengeId?: string;
  readonly mobile?: string;
  readonly message?: string;
  readonly tone?: 'info' | 'error';
  readonly resendAfterSeconds?: number;
  readonly attemptsRemaining?: number;
}

/** Only a relative path is ever followed back, so `next` cannot become an open redirect. */
function safeNext(raw: FormDataEntryValue | null): string | null {
  const value = typeof raw === 'string' ? raw : '';
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export async function requestCodeAction(_previous: LoginState, form: FormData): Promise<LoginState> {
  const rawMobile = String(form.get('mobile') ?? '');
  try {
    const outcome = await requestOtp(
      db(),
      { rawMobile, purpose: 'LOGIN' },
      await currentSmsSender(),
    );

    if (outcome.state === 'TOO_MANY_ATTEMPTS') {
      return { step: 'MOBILE', message: OTP_MESSAGE_FA.TOO_MANY_ATTEMPTS, tone: 'error' };
    }
    if (outcome.state === 'RESEND_TOO_SOON') {
      return {
        step: 'CODE',
        challengeId: outcome.challengeId,
        mobile: rawMobile,
        message: OTP_MESSAGE_FA.RESEND_TOO_SOON,
        tone: 'error',
        resendAfterSeconds: outcome.retryAfterSeconds,
      };
    }
    return {
      step: 'CODE',
      challengeId: outcome.challengeId,
      mobile: outcome.mobile,
      message: OTP_MESSAGE_FA[outcome.state],
      tone: 'info',
      resendAfterSeconds: outcome.resendAfterSeconds,
      attemptsRemaining: outcome.attemptsRemaining,
    };
  } catch (error) {
    if (error instanceof AppError) return { step: 'MOBILE', message: error.message, tone: 'error' };
    throw error;
  }
}

export async function verifyCodeAction(previous: LoginState, form: FormData): Promise<LoginState> {
  const challengeId = String(form.get('challengeId') ?? '');
  const code = String(form.get('code') ?? '');
  const next = safeNext(form.get('next'));

  const outcome = await verifyOtp(db(), { challengeId, code });

  // The challenge id is carried back so the form stays on the code step and the
  // error is shown against the code, not against the mobile number.
  if (outcome.state === 'OTP_INVALID') {
    return {
      ...previous,
      step: 'CODE',
      challengeId,
      message: OTP_MESSAGE_FA.OTP_INVALID,
      tone: 'error',
      attemptsRemaining: outcome.attemptsRemaining,
    };
  }
  if (outcome.state === 'OTP_EXPIRED') {
    return { step: 'MOBILE', message: OTP_MESSAGE_FA.OTP_EXPIRED, tone: 'error' };
  }
  if (outcome.state === 'TOO_MANY_ATTEMPTS') {
    return { step: 'MOBILE', message: OTP_MESSAGE_FA.TOO_MANY_ATTEMPTS, tone: 'error' };
  }

  const account = await signInWithVerifiedMobile(db(), outcome.mobile);
  const issued = await createSession(db(), account.accountId, 'USER');
  const store = await cookies();
  store.set(SESSION_COOKIE, issued.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().APP_ENV === 'production',
    path: '/',
    expires: issued.expiresAt,
  });

  // §6.1 step 5: a returning account resumes the originating request; with no
  // origin it lands on the dashboard. A new account completes its profile first.
  const profile = await findProfile(db(), account.accountId);
  redirect(profile === null ? '/account/complete' + (next ? '?next=' + encodeURIComponent(next) : '') : (next ?? '/dashboard'));
}

