'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { env } from '../config/env.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { recordAnimalLifeEvent } from '../animals/life-events.ts';
import {
  activateProfile,
  addProfileMedia,
  changeProfileState,
  declareFertility,
  PROFILES_ROUTE,
  removeProfileMedia,
  setPrimaryMedia,
  submitProfileReport,
  updatePreferences,
} from './profiles.ts';

export interface ProfileFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const field = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();

async function owner() {
  const guard = await guardRoute(PROFILES_ROUTE);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

async function run(animalId: string, work: () => Promise<string>): Promise<ProfileFormState> {
  try {
    const message = await work();
    revalidatePath(PROFILES_ROUTE, 'layout');
    if (animalId) revalidatePath(PROFILES_ROUTE + '/' + animalId);
    return { ok: true, message };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function declareFertilityAction(_p: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const animalId = field(form, 'animalId');
  return run(animalId, async () => {
    await declareFertility(db(), await owner(), { animalId, status: field(form, 'status'), noteFa: field(form, 'noteFa') || null });
    return 'اظهار شما ثبت شد.';
  });
}

export async function addMediaAction(_p: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const animalId = field(form, 'animalId');
  return run(animalId, async () => {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AppError('VALIDATION', 'فایلی انتخاب نشده است.');
    const kind = field(form, 'kind') === 'VIDEO' ? 'VIDEO' : 'IMAGE';
    const role = kind === 'VIDEO' ? 'OTHER' : (['FULL_BODY', 'FACE'].includes(field(form, 'role')) ? field(form, 'role') : 'OTHER');
    await addProfileMedia(db(), env().PRIVATE_STORAGE_DIR, await owner(), {
      animalId,
      kind,
      role: role as 'FULL_BODY' | 'FACE' | 'OTHER',
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
      altFa: field(form, 'altFa'),
    });
    return kind === 'VIDEO' ? 'ویدئو افزوده شد.' : 'تصویر افزوده شد.';
  });
}

export async function removeMediaAction(_p: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  return run(field(form, 'animalId'), async () => {
    await removeProfileMedia(db(), await owner(), { mediaId: field(form, 'mediaId') });
    return 'رسانه حذف شد.';
  });
}

export async function setPrimaryAction(_p: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  return run(field(form, 'animalId'), async () => {
    await setPrimaryMedia(db(), await owner(), { mediaId: field(form, 'mediaId') });
    return 'تصویر اصلی انتخاب شد.';
  });
}

export async function activateAction(_p: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const animalId = field(form, 'animalId');
  return run(animalId, async () => {
    await activateProfile(db(), await owner(), { animalId });
    return 'پروفایل در جفت‌یابی فعال شد.';
  });
}

export async function changeStateAction(_p: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  return run(field(form, 'animalId'), async () => {
    await changeProfileState(db(), await owner(), {
      profileId: field(form, 'profileId'),
      to: field(form, 'to'),
      expectedVersion: Number(field(form, 'expectedVersion')),
    });
    return 'وضعیت پروفایل تغییر کرد.';
  });
}

export async function preferencesAction(_p: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const animalId = field(form, 'animalId');
  return run(animalId, async () => {
    await updatePreferences(db(), await owner(), { animalId, preferencesFa: field(form, 'preferencesFa') });
    return 'ترجیحات ذخیره شد.';
  });
}

export async function lifeEventAction(_p: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const animalId = field(form, 'animalId');
  return run(animalId, async () => {
    await recordAnimalLifeEvent(db(), await owner(), {
      animalId,
      kind: field(form, 'kind'),
      occurredOn: field(form, 'occurredOn'),
      reasonFa: field(form, 'reasonFa'),
    });
    return 'رویداد ثبت شد.';
  });
}

export async function reportProfileAction(_p: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  try {
    const guard = await guardRoute('/report');
    if (!guard.ok) throw guard.denied;
    await submitProfileReport(db(), guard.actor, {
      profileId: field(form, 'profileId'),
      mediaId: field(form, 'mediaId') || null,
      reason: field(form, 'reason'),
      details: field(form, 'details') || null,
    });
    return { ok: true, message: 'گزارش شما ثبت شد و بررسی می‌شود.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
