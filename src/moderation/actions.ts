'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { decideContentReports, liftRestriction, submitContentReport } from './service.ts';
import { DECISION_FA } from './model.ts';

export interface ModerationFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): ModerationFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

export async function submitReportAction(_previous: ModerationFormState, form: FormData): Promise<ModerationFormState> {
  const contentId = text(form, 'contentId');
  try {
    await submitContentReport(db(), await actorAt('/report/content/' + encodeURIComponent(contentId)), {
      contentId,
      reason: text(form, 'reason'),
      details: text(form, 'details'),
    });
    return { ok: true, message: 'گزارش شما ثبت شد. ادمین محتوا آن را بررسی می‌کند.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideReportsAction(_previous: ModerationFormState, form: FormData): Promise<ModerationFormState> {
  const contentId = text(form, 'contentId');
  const path = '/content/reports/' + contentId;
  try {
    const iso = text(form, 'restrictUntilIso');
    const until = iso === '' ? null : new Date(iso);
    const result = await decideContentReports(db(), await actorAt(path), {
      contentId,
      decision: text(form, 'decision'),
      reason: text(form, 'reason'),
      restrictUntil: until,
    });
    revalidatePath('/content/reports');
    revalidatePath(path);
    return {
      ok: true,
      message: DECISION_FA[result.decision] + ' ثبت شد؛ ' + result.closed.toLocaleString('fa-IR') + ' گزارش بسته شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function liftRestrictionAction(_previous: ModerationFormState, form: FormData): Promise<ModerationFormState> {
  try {
    await liftRestriction(db(), await actorAt('/content/restrictions'), {
      restrictionId: text(form, 'restrictionId'),
      reason: text(form, 'reason'),
    });
    revalidatePath('/content/restrictions');
    return { ok: true, message: 'محدودیت برداشته شد.' };
  } catch (error) {
    return failure(error);
  }
}
