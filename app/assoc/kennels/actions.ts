'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { reviewKennel } from '../../../src/kennels/service.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface KennelReviewState {
  readonly ok?: boolean;
  readonly message?: string;
}

/** The association decides; approval is also what activates the breeder role. */
export async function reviewKennelAction(
  _previous: KennelReviewState,
  form: FormData,
): Promise<KennelReviewState> {
  const kennelId = String(form.get('kennelId') ?? '');
  try {
    const guard = await guardRoute('/assoc/kennels/' + kennelId);
    if (!guard.ok) throw guard.denied;
    await reviewKennel(db(), guard.actor, {
      kennelId,
      decision: String(form.get('decision') ?? '') as 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED',
      reasonFa: String(form.get('reason') ?? ''),
      expectedVersion: Number(form.get('version')),
    });
    revalidatePath('/assoc/kennels');
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
