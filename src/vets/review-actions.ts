'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { REVIEW_CHECKS, type VetCaseType } from './professional-profile-model.ts';
import { claimCase, recordReviewChecks, releaseCase } from './review-workbench.ts';

export interface ReviewState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): ReviewState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  revalidatePath('/assoc', 'layout');
  revalidatePath('/account/vet-profile', 'layout');
}

const target = (form: FormData) => ({ caseId: text(form, 'caseId'), expectedVersion: Number(text(form, 'expectedVersion')) });

export async function claimCaseAction(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  try {
    await claimCase(db(), await actorAt('/assoc/vet-review'), target(form));
    refresh();
    return { ok: true, message: 'پرونده را برداشتید؛ تا تصمیم یا رها کردن، فقط شما روی آن اقدام می‌کنید.' };
  } catch (error) {
    return failure(error);
  }
}

export async function releaseCaseAction(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  try {
    await releaseCase(db(), await actorAt('/assoc/vet-review'), { ...target(form), reasonFa: text(form, 'reasonFa') });
    refresh();
    return { ok: true, message: 'پرونده به صف برگشت.' };
  } catch (error) {
    return failure(error);
  }
}

export async function recordChecksAction(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  try {
    const caseType = text(form, 'caseType') as VetCaseType;
    const definitions = REVIEW_CHECKS[caseType] ?? [];
    // Only the checks the reviewer answered are recorded; an unanswered one stays open.
    const checks = definitions
      .map((definition) => ({ code: definition.code, result: text(form, 'check_' + definition.code), noteFa: text(form, 'note_' + definition.code) }))
      .filter((check) => check.result !== '');
    await recordReviewChecks(db(), await actorAt('/assoc/vet-review'), { ...target(form), checks });
    refresh();
    return { ok: true, message: 'نتیجه بررسی‌ها ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}
