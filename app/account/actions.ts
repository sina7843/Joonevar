'use server';

import { redirect } from 'next/navigation';
import { currentSmsSender } from '../../src/adapters/current.ts';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { currentSession } from '../../src/authz/request-actor.ts';
import { requestOtp, OTP_MESSAGE_FA } from '../../src/identity/otp.ts';
import {
  assertMobileAvailable,
  confirmMobileChange,
  saveProfile,
  saveResidence,
} from '../../src/identity/account.ts';
import { attachKycDocument, submitKyc } from '../../src/identity/kyc.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface FormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
  readonly challengeId?: string;
  readonly pendingMobile?: string;
}

/** Every action re-runs the route guard; a stale page cannot act on the server. */
async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): FormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

export async function saveProfileAction(_previous: FormState, form: FormData): Promise<FormState> {
  try {
    const actor = await requireActor('/account/profile');
    await saveProfile(db(), actor, {
      firstName: text(form, 'firstName'),
      lastName: text(form, 'lastName'),
      nationalId: text(form, 'nationalId'),
      birthDate: text(form, 'birthDate'),
      displayName: text(form, 'displayName'),
      displayNameVisible: form.get('displayNameVisible') === 'on',
    });
    revalidatePath('/account/profile');
    return { ok: true, message: 'اطلاعات هویتی ذخیره شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Completing the account for the first time. On success the flow returns to the
 * originating request when there is one (§8).
 */
export async function completeProfileAction(_previous: FormState, form: FormData): Promise<FormState> {
  let destination = '/dashboard';
  try {
    const actor = await requireActor('/account/complete');
    await saveProfile(db(), actor, {
      firstName: text(form, 'firstName'),
      lastName: text(form, 'lastName'),
      nationalId: text(form, 'nationalId'),
      birthDate: text(form, 'birthDate'),
      displayName: text(form, 'displayName'),
      displayNameVisible: form.get('displayNameVisible') === 'on',
    });
    const next = text(form, 'next');
    if (next.startsWith('/') && !next.startsWith('//')) destination = next;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** Residence stays optional; saving it empty is a valid outcome (§6.2). */
export async function saveResidenceAction(_previous: FormState, form: FormData): Promise<FormState> {
  try {
    const actor = await requireActor('/account/profile');
    await saveResidence(db(), actor, {
      province: text(form, 'province'),
      city: text(form, 'city'),
      address: text(form, 'address'),
      postalCode: text(form, 'postalCode'),
    });
    revalidatePath('/account/profile');
    return { ok: true, message: 'اطلاعات سکونت ذخیره شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadKycDocumentAction(_previous: FormState, form: FormData): Promise<FormState> {
  try {
    const actor = await requireActor('/account/kyc');
    const file = form.get('document');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'فایلی انتخاب نشده است.', tone: 'error' };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await attachKycDocument(db(), env().PRIVATE_STORAGE_DIR, actor, { bytes, originalName: file.name });
    revalidatePath('/account/kyc');
    return { ok: true, message: 'تصویر کارت ملی بارگذاری شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

export async function submitKycAction(_previous: FormState): Promise<FormState> {
  try {
    const actor = await requireActor('/account/kyc');
    await submitKyc(db(), actor);
    revalidatePath('/account/kyc');
    return { ok: true, message: 'پرونده برای بررسی ارسال شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Mobile change (§6.4). The current number stays valid until the code sent to
 * the new number is verified; a cancelled or failed attempt changes nothing.
 */
export async function startMobileChangeAction(_previous: FormState, form: FormData): Promise<FormState> {
  try {
    const actor = await requireActor('/account/profile/mobile');
    const mobile = await assertMobileAvailable(db(), text(form, 'mobile'), actor.accountId);
    const outcome = await requestOtp(
      db(),
      { rawMobile: mobile, purpose: 'MOBILE_CHANGE', accountId: actor.accountId },
      await currentSmsSender(),
    );
    if (outcome.state === 'TOO_MANY_ATTEMPTS') {
      return { ok: false, message: OTP_MESSAGE_FA.TOO_MANY_ATTEMPTS, tone: 'error' };
    }
    if (outcome.state === 'RESEND_TOO_SOON') {
      return {
        ok: false,
        message: OTP_MESSAGE_FA.RESEND_TOO_SOON,
        tone: 'error',
        challengeId: outcome.challengeId,
        pendingMobile: mobile,
      };
    }
    return {
      ok: true,
      message: OTP_MESSAGE_FA[outcome.state],
      tone: 'info',
      challengeId: outcome.challengeId,
      pendingMobile: outcome.mobile,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmMobileChangeAction(previous: FormState, form: FormData): Promise<FormState> {
  try {
    const actor = await requireActor('/account/profile/mobile');
    const session = await currentSession(db());
    if (session === null) return { ok: false, message: OTP_MESSAGE_FA.OTP_EXPIRED, tone: 'error' };

    const { outcome } = await confirmMobileChange(db(), actor, {
      challengeId: text(form, 'challengeId'),
      code: text(form, 'code'),
      sessionId: session.sessionId,
    });

    if (outcome.state !== 'OTP_VERIFIED') {
      return {
        ...previous,
        ok: false,
        message: OTP_MESSAGE_FA[outcome.state],
        tone: 'error',
      };
    }
    revalidatePath('/account/profile');
    return { ok: true, message: 'شماره موبایل حساب تغییر کرد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}
