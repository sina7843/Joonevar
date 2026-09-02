'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { confirmDate, declareDate, declareDifferentDate } from '../../src/mating/dates.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface DateFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function requireActor(permitId: string) {
  const guard = await guardRoute('/mating/permits/' + permitId + '/dates');
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): DateFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

/** §17.1: either participant declares, as often as they need to. */
export async function declareDateAction(
  _previous: DateFormState,
  form: FormData,
): Promise<DateFormState> {
  const permitId = text(form, 'permitId');
  const replaces = text(form, 'replacesVersion').trim();
  try {
    const actor = await requireActor(permitId);
    const row = await declareDate(db(), actor, permitId, {
      matedOn: text(form, 'matedOn'),
      noteFa: text(form, 'note'),
      replacesVersion: replaces === '' ? null : Number(replaces),
    });
    revalidatePath('/mating/permits/' + permitId + '/dates');
    return {
      ok: true,
      tone: 'success',
      message:
        (replaces === '' ? 'تاریخ اعلام شد' : 'نسخه اصلاحی ثبت شد') +
        ' (نسخه ' +
        row.version +
        ') و برای تأیید طرف مقابل ارسال شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

/** The confirmation carries the version it was shown for (§17.1, §26). */
export async function confirmDateAction(
  _previous: DateFormState,
  form: FormData,
): Promise<DateFormState> {
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor(permitId);
    const row = await confirmDate(db(), actor, permitId, {
      declarationId: text(form, 'declarationId'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/mating/permits/' + permitId + '/dates');
    return { ok: true, tone: 'success', message: 'نسخه ' + row.version + ' به‌صورت دوطرفه تأیید شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Answering with a different date makes the disagreement explicit (§17.1). */
export async function differentDateAction(
  _previous: DateFormState,
  form: FormData,
): Promise<DateFormState> {
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor(permitId);
    const { proposed } = await declareDifferentDate(db(), actor, permitId, {
      declarationId: text(form, 'declarationId'),
      expectedVersion: Number(text(form, 'version')),
      matedOn: text(form, 'matedOn'),
      noteFa: text(form, 'note'),
    });
    revalidatePath('/mating/permits/' + permitId + '/dates');
    return {
      ok: true,
      tone: 'info',
      message: 'مغایرت تاریخ ثبت شد؛ نسخه ' + proposed.version + ' برای تأیید طرف مقابل ارسال شد.',
    };
  } catch (error) {
    return failure(error);
  }
}
