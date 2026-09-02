'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import {
  receiveSample,
  recordResult,
  refreshWaitingResult,
  reviewReceipt,
  startProcessing,
} from '../../src/genetics/service.ts';
import { markSampleUnusable } from '../../src/clinical/samples.ts';
import { AppError } from '../../src/domain/errors.ts';
import type { UnusableStatus } from '../../src/domain/microchip.ts';

export interface CentreFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): CentreFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

/** Approving also asks the actual custodian to send each sample (§14.1). */
export async function reviewReceiptAction(
  _previous: CentreFormState,
  form: FormData,
): Promise<CentreFormState> {
  const receiptId = text(form, 'receiptId');
  try {
    const actor = await requireActor('/genetics/receipts/' + receiptId);
    await reviewReceipt(db(), actor, {
      receiptId,
      decision: text(form, 'decision') as 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED',
      reasonFa: text(form, 'reason'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/genetics/receipts');
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function receiveSampleAction(
  _previous: CentreFormState,
  form: FormData,
): Promise<CentreFormState> {
  try {
    const actor = await requireActor('/genetics/samples');
    await receiveSample(db(), actor, text(form, 'sampleId'));
    revalidatePath('/genetics/samples');
    return { ok: true, message: 'دریافت نمونه ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function startProcessingAction(
  _previous: CentreFormState,
  form: FormData,
): Promise<CentreFormState> {
  try {
    const actor = await requireActor('/genetics/samples');
    await startProcessing(db(), actor, text(form, 'sampleId'));
    revalidatePath('/genetics/samples');
    revalidatePath('/genetics/results');
    return { ok: true, message: 'پردازش آغاز شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** An unusable sample goes back to the existing resampling path (§12.4, §14.4). */
export async function rejectSampleAction(
  _previous: CentreFormState,
  form: FormData,
): Promise<CentreFormState> {
  try {
    const actor = await requireActor('/genetics/samples');
    await markSampleUnusable(
      db(),
      actor,
      text(form, 'sampleId'),
      text(form, 'status') as UnusableStatus,
      text(form, 'reason'),
    );
    revalidatePath('/genetics/samples');
    return { ok: true, message: 'نمونه غیرقابل‌استفاده ثبت شد؛ نمونه‌گیری مجدد از همان درخواست انجام می‌شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function recordResultAction(
  _previous: CentreFormState,
  form: FormData,
): Promise<CentreFormState> {
  try {
    const actor = await requireActor('/genetics/results');
    const result = await recordResult(db(), actor, {
      sampleId: text(form, 'sampleId'),
      technicalNoteFa: text(form, 'note') || null,
    });
    revalidatePath('/genetics/results');
    return {
      ok: true,
      message:
        result.status === 'FINAL'
          ? 'نتیجه نهایی ثبت شد.'
          : 'نتیجه ثبت شد و در انتظار تکمیل نتایج والدین است.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function refreshResultAction(
  _previous: CentreFormState,
  form: FormData,
): Promise<CentreFormState> {
  try {
    const actor = await requireActor('/genetics/results');
    await refreshWaitingResult(db(), actor, text(form, 'resultId'));
    revalidatePath('/genetics/results');
    return { ok: true, message: 'نتیجه نهایی شد.' };
  } catch (error) {
    return failure(error);
  }
}
