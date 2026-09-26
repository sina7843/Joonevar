'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import {
  confirmDate,
  confirmDateOn,
  declareDate,
  declareDateOn,
  declareDifferentDate,
  declareDifferentDateOn,
  personalMatingForParty,
  personalSubject,
} from '../../src/mating/dates.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface DateFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

/**
 * The same forms serve the official permit and the Finder's contract-backed
 * personal mating (PHASE-4 PROMPT-006); `kind` picks the subject, and the
 * subject's own party check runs on the server either way.
 */
const isPersonal = (form: FormData) => text(form, 'kind') === 'PERSONAL';
const pageOf = (form: FormData, id: string) =>
  isPersonal(form) ? '/account/mating-finder/personal/' + id : '/mating/permits/' + id + '/dates';

async function requireActor(form: FormData, id: string) {
  const guard = await guardRoute(pageOf(form, id));
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

async function personal(form: FormData, id: string) {
  const actor = await requireActor(form, id);
  return { actor, subject: personalSubject(await personalMatingForParty(db(), actor, id, { requireActive: true })) };
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
    const input = {
      matedOn: text(form, 'matedOn'),
      noteFa: text(form, 'note'),
      replacesVersion: replaces === '' ? null : Number(replaces),
    };
    let row;
    if (isPersonal(form)) {
      const { actor, subject } = await personal(form, permitId);
      row = await declareDateOn(db(), actor, subject, input);
    } else {
      row = await declareDate(db(), await requireActor(form, permitId), permitId, input);
    }
    revalidatePath(pageOf(form, permitId));
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
    const input = {
      declarationId: text(form, 'declarationId'),
      expectedVersion: Number(text(form, 'version')),
    };
    let row;
    if (isPersonal(form)) {
      const { actor, subject } = await personal(form, permitId);
      row = await confirmDateOn(db(), actor, subject, input);
    } else {
      row = await confirmDate(db(), await requireActor(form, permitId), permitId, input);
    }
    revalidatePath(pageOf(form, permitId));
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
    const input = {
      declarationId: text(form, 'declarationId'),
      expectedVersion: Number(text(form, 'version')),
      matedOn: text(form, 'matedOn'),
      noteFa: text(form, 'note'),
    };
    let result;
    if (isPersonal(form)) {
      const { actor, subject } = await personal(form, permitId);
      result = await declareDifferentDateOn(db(), actor, subject, input);
    } else {
      result = await declareDifferentDate(db(), await requireActor(form, permitId), permitId, input);
    }
    const { proposed } = result;
    revalidatePath(pageOf(form, permitId));
    return {
      ok: true,
      tone: 'info',
      message: 'مغایرت تاریخ ثبت شد؛ نسخه ' + proposed.version + ' برای تأیید طرف مقابل ارسال شد.',
    };
  } catch (error) {
    return failure(error);
  }
}
