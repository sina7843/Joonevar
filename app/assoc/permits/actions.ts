'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { reviewPermit } from '../../../src/mating/permits.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface PermitReviewState {
  readonly ok?: boolean;
  readonly message?: string;
}

/**
 * The operational decision — §16 steps 8 and 9.
 *
 * Issuing is the only thing that creates the permit number, and it happens here
 * rather than as a side effect of the payment.
 */
export async function reviewPermitAction(
  _previous: PermitReviewState,
  form: FormData,
): Promise<PermitReviewState> {
  const permitId = String(form.get('permitId') ?? '');
  try {
    const guard = await guardRoute('/assoc/permits/' + permitId);
    if (!guard.ok) throw guard.denied;
    await reviewPermit(db(), guard.actor, {
      permitId,
      decision: String(form.get('decision') ?? '') as 'ISSUED' | 'NEEDS_CORRECTION' | 'REJECTED',
      reasonFa: String(form.get('reason') ?? ''),
      expectedVersion: Number(form.get('version')),
    });
    revalidatePath('/assoc/permits');
    revalidatePath('/assoc/permits/' + permitId);
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
