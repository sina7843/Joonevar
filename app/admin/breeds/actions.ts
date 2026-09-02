'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { addBreedToRegistry, setBreedActive } from '../../../src/operations/service.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface BreedFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function superadmin() {
  const guard = await guardRoute('/admin/breeds');
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): BreedFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

/** §21.4: a reference list is managed data, not a code change. */
export async function addBreedAction(_previous: BreedFormState, form: FormData): Promise<BreedFormState> {
  try {
    const actor = await superadmin();
    await addBreedToRegistry(db(), actor, { nameFa: text(form, 'nameFa'), nameEn: text(form, 'nameEn') });
    revalidatePath('/admin/breeds');
    return { ok: true, message: 'نژاد به فهرست مرجع اضافه شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Retiring hides a breed from new choices and rewrites no existing animal. */
export async function setBreedActiveAction(
  _previous: BreedFormState,
  form: FormData,
): Promise<BreedFormState> {
  const active = text(form, 'active') === 'YES';
  try {
    const actor = await superadmin();
    await setBreedActive(db(), actor, { breedId: text(form, 'breedId'), active });
    revalidatePath('/admin/breeds');
    return { ok: true, message: active ? 'نژاد دوباره فعال شد.' : 'نژاد از انتخاب‌های جدید کنار گذاشته شد.' };
  } catch (error) {
    return failure(error);
  }
}
