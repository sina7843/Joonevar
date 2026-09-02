'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { reviewForeignCase, type ForeignDecision } from '../../../src/animals/foreign-pedigree.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface ReviewState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'success' | 'error';
}

/**
 * Record the association decision. The guard runs again on the server, so a
 * page opened before the role changed cannot replay the action.
 */
export async function reviewForeignAction(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  try {
    const guard = await guardRoute('/assoc/foreign-pedigree');
    if (!guard.ok) throw guard.denied;

    const caseId = String(form.get('caseId') ?? '');
    const decision = String(form.get('decision') ?? '') as ForeignDecision;
    const reasonFa = String(form.get('reasonFa') ?? '');
    const rawGeneration = String(form.get('extractedGeneration') ?? '');
    const expectedVersion = Number(form.get('expectedVersion') ?? '0');

    await reviewForeignCase(db(), guard.actor, {
      caseId,
      decision,
      reasonFa,
      extractedGeneration: rawGeneration === '' ? undefined : Number(rawGeneration),
      expectedVersion,
    });
    revalidatePath('/assoc/foreign-pedigree');
    return { ok: true, message: 'نتیجه بررسی ثبت شد و به مالک اعلام شد.', tone: 'success' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
    throw error;
  }
}
