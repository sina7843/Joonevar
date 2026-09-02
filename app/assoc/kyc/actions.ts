'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { reviewKyc, type KycDecision } from '../../../src/identity/kyc.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface ReviewState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'success' | 'error';
}

/**
 * Record a review decision. The guard runs again on the server, so the action
 * cannot be replayed from a page that was open before the role changed.
 */
export async function reviewKycAction(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  try {
    const guard = await guardRoute('/assoc/kyc');
    if (!guard.ok) throw guard.denied;

    const caseId = String(form.get('caseId') ?? '');
    const decision = String(form.get('decision') ?? '') as KycDecision;
    const reasonFa = String(form.get('reasonFa') ?? '');
    const expectedVersion = Number(form.get('expectedVersion') ?? '0');

    await reviewKyc(db(), guard.actor, { caseId, decision, reasonFa, expectedVersion });
    revalidatePath('/assoc/kyc');
    return { ok: true, message: 'نتیجه بررسی ثبت شد و به کاربر اعلام شد.', tone: 'success' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
    throw error;
  }
}
