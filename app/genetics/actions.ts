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
import { answerAppeal, takeAppeal } from '../../src/genetics/appeals.ts';
import { AppError, staleOf } from '../../src/domain/errors.ts';
import type { UnusableStatus } from '../../src/domain/microchip.ts';
import type { BulkResultState } from '../../src/ui/bulk-action-bar.tsx';

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
  if (error instanceof AppError) return { ok: false, message: error.message, ...staleOf(error) };
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

/**
 * «ثبت دریافت نمونه (n)» on K19 (approved decision 11): each selected sample is
 * received on its own, with the same rules as the one-row button, and reported
 * per sample. Receiving needs no document, so it may be bulk (P09).
 */
export async function bulkReceiveSamplesAction(_previous: BulkResultState, form: FormData): Promise<BulkResultState> {
  const guard = await guardRoute('/genetics/samples');
  if (!guard.ok) return { tone: 'error', message: guard.denied.message };
  if (text(form, 'bulkAction') !== 'receive') return { tone: 'error', message: 'کنش گروهی معتبر نیست.' };
  const ids = [...new Set(form.getAll('ids').map(String))].slice(0, 100);
  if (ids.length === 0) return { tone: 'error', message: 'هیچ نمونه‌ای انتخاب نشده است.' };
  const results: { id: string; label: string; ok: boolean; message?: string }[] = [];
  for (const sampleId of ids) {
    const label = text(form, 'code-' + sampleId) || sampleId;
    try {
      await receiveSample(db(), guard.actor, sampleId);
      results.push({ id: sampleId, label: label + ' — دریافت ثبت شد', ok: true });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      results.push({ id: sampleId, label, ok: false, message: error.message });
    }
  }
  revalidatePath('/genetics/samples');
  const done = results.filter((result) => result.ok).length;
  const fa = (value: number) => value.toLocaleString('fa-IR');
  return {
    tone: done === results.length ? 'success' : done === 0 ? 'error' : 'warning',
    message: 'دریافت ' + fa(done) + ' نمونه از ' + fa(results.length) + ' ثبت شد.',
    results,
  };
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

/** The centre takes an appeal into review, so the owner sees it moved (§14.5). */
export async function takeAppealAction(
  _previous: CentreFormState,
  form: FormData,
): Promise<CentreFormState> {
  const appealId = text(form, 'appealId');
  try {
    const actor = await requireActor('/genetics/appeals/' + appealId);
    await takeAppeal(db(), actor, appealId);
    revalidatePath('/genetics/appeals');
    return { ok: true, message: 'اعتراض در دست بررسی قرار گرفت.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * The centre answers, and may record a corrected result as a new version.
 * The disputed result and any issued document are left exactly as they are.
 */
export async function answerAppealAction(
  _previous: CentreFormState,
  form: FormData,
): Promise<CentreFormState> {
  const appealId = text(form, 'appealId');
  try {
    const actor = await requireActor('/genetics/appeals/' + appealId);
    await answerAppeal(db(), actor, {
      appealId,
      responseFa: text(form, 'response'),
      expectedVersion: Number(text(form, 'version')),
      ...(form.get('correct') === 'on'
        ? { correctResult: { technicalNoteFa: text(form, 'correctionNote') || null } }
        : {}),
    });
    revalidatePath('/genetics/appeals');
    return { ok: true, message: 'پاسخ ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}
