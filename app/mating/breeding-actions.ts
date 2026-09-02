'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { attachPregnancyCheck, declarePregnancy } from '../../src/mating/pregnancy.ts';
import { correctBirth, recordBirth, recordPuppyDeath, renamePuppy } from '../../src/mating/birth.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface BreedingFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');
const int = (form: FormData, key: string): number => {
  const raw = text(form, key).trim();
  // An empty box is not zero: it is a missing answer, and the service says so.
  return raw === '' ? Number.NaN : Number(raw);
};
const optionalInt = (form: FormData, key: string): number | null => {
  const raw = text(form, key).trim();
  return raw === '' ? null : Number(raw);
};

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): BreedingFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

/** §18.1: the owner's own record, UNVERIFIED and independent of any vet. */
export async function declarePregnancyAction(
  _previous: BreedingFormState,
  form: FormData,
): Promise<BreedingFormState> {
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor('/mating/permits/' + permitId + '/pregnancy');
    const row = await declarePregnancy(db(), actor, permitId, {
      pregnant: text(form, 'pregnant') === 'YES',
      expectedCount: optionalInt(form, 'expectedCount'),
      noteFa: text(form, 'note'),
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/mating/permits/' + permitId + '/pregnancy');
    return { ok: true, tone: 'success', message: 'اعلام شما (نسخه ' + row.version + ') ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** §18.2: an existing Finder visit request is attached to this case. */
export async function attachCheckAction(
  _previous: BreedingFormState,
  form: FormData,
): Promise<BreedingFormState> {
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor('/mating/permits/' + permitId + '/pregnancy');
    await attachPregnancyCheck(db(), actor, permitId, text(form, 'requestId'));
    revalidatePath('/mating/permits/' + permitId + '/pregnancy');
    return { ok: true, tone: 'success', message: 'درخواست بررسی به این پرونده وصل شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Sends the owner to the Finder in the pregnancy context (§11, §18.2). */
export async function startPregnancyFinderAction(form: FormData): Promise<void> {
  const permitId = String(form.get('permitId') ?? '');
  await requireActor('/mating/permits/' + permitId + '/pregnancy');
  redirect('/requests/new?context=PREGNANCY');
}

export async function recordBirthAction(
  _previous: BreedingFormState,
  form: FormData,
): Promise<BreedingFormState> {
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor('/mating/permits/' + permitId + '/birth');
    const { event, created } = await recordBirth(db(), actor, permitId, {
      bornOn: text(form, 'bornOn'),
      liveCount: int(form, 'liveCount'),
      deadCount: int(form, 'deadCount'),
      noteFa: text(form, 'note'),
    });
    revalidatePath('/mating/permits/' + permitId + '/birth');
    return {
      ok: true,
      tone: 'success',
      message:
        'نتیجه زایمان ثبت شد: ' +
        event.liveCount +
        ' زنده و ' +
        event.deadCount +
        ' مرده؛ ' +
        created.length +
        ' پرونده موقت توله ساخته شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

/** §19.2: a correction with actor, time and reason; profiles are never dropped. */
export async function correctBirthAction(
  _previous: BreedingFormState,
  form: FormData,
): Promise<BreedingFormState> {
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor('/mating/permits/' + permitId + '/birth');
    const { event, created, withdrawn } = await correctBirth(db(), actor, permitId, {
      liveCount: int(form, 'liveCount'),
      deadCount: int(form, 'deadCount'),
      reasonFa: text(form, 'reason'),
      expectedVersion: Number(text(form, 'version')),
      withdrawPuppyIds: form.getAll('withdraw').map(String),
    });
    revalidatePath('/mating/permits/' + permitId + '/birth');
    return {
      ok: true,
      tone: 'success',
      message:
        'نسخه ' +
        event.version +
        ' ثبت شد؛ ' +
        created.length +
        ' پرونده تازه ساخته و ' +
        withdrawn.length +
        ' پرونده با علت ثبت‌شده کنار گذاشته شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

/** §19.2: a death after birth, which keeps the profile and the history. */
export async function recordPuppyDeathAction(
  _previous: BreedingFormState,
  form: FormData,
): Promise<BreedingFormState> {
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor('/mating/permits/' + permitId + '/birth');
    await recordPuppyDeath(db(), actor, permitId, {
      puppyId: text(form, 'puppyId'),
      diedOn: text(form, 'diedOn'),
      reasonFa: text(form, 'reason'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/mating/permits/' + permitId + '/birth');
    return { ok: true, tone: 'info', message: 'مرگ توله ثبت شد؛ پرونده و سابقه آن حفظ شده است.' };
  } catch (error) {
    return failure(error);
  }
}

export async function renamePuppyAction(
  _previous: BreedingFormState,
  form: FormData,
): Promise<BreedingFormState> {
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor('/mating/permits/' + permitId + '/birth');
    await renamePuppy(db(), actor, permitId, {
      puppyId: text(form, 'puppyId'),
      nameFa: text(form, 'name'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/mating/permits/' + permitId + '/birth');
    return { ok: true, tone: 'success', message: 'نام توله ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}
