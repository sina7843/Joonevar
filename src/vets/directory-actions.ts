'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError, validation } from '../domain/errors.ts';
import { addCity, addOwnLocation, changeVetPublicStatus, updateLocationPublic, updateVetPublicProfile } from './directory.ts';

export interface DirectoryEditState {
  readonly ok?: boolean;
  readonly message?: string;
}

/**
 * The environment a directory form was submitted from. The guard checks that
 * the actor may be in that environment; the service then checks the record
 * itself, so a forged surface gains nothing (DEC-0166).
 */
const SURFACES = { admin: '/admin/vets', owner: '/account/vet-profile', review: '/review/vets/unowned' } as const;
export type DirectorySurface = keyof typeof SURFACES;

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorOf(form: FormData) {
  const surface = text(form, 'surface');
  if (!Object.hasOwn(SURFACES, surface)) throw validation('محیط ارسال فرم معتبر نیست.');
  const guard = await guardRoute(SURFACES[surface as DirectorySurface]);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): DirectoryEditState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  for (const path of Object.values(SURFACES)) revalidatePath(path, 'layout');
}

export async function updateVetPublicProfileAction(_previous: DirectoryEditState, form: FormData): Promise<DirectoryEditState> {
  try {
    await updateVetPublicProfile(db(), await actorOf(form), {
      profileId: text(form, 'profileId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      headlineFa: text(form, 'headlineFa'),
      bioFa: text(form, 'bioFa'),
      experienceFa: text(form, 'experienceFa'),
      showPhone: form.get('showPhone') === 'on',
      showCouncilCode: form.get('showCouncilCode') === 'on',
      specialtyCodes: form.getAll('specialty').map(String),
      speciesCodes: form.getAll('species').map(String),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'پروفایل عمومی ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function changeVetPublicStatusAction(_previous: DirectoryEditState, form: FormData): Promise<DirectoryEditState> {
  try {
    const row = await changeVetPublicStatus(db(), await actorOf(form), {
      profileId: text(form, 'profileId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: row.publicStatus === 'PUBLISHED' ? 'پروفایل منتشر شد.' : 'پروفایل پنهان شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function updateLocationPublicAction(_previous: DirectoryEditState, form: FormData): Promise<DirectoryEditState> {
  try {
    await updateLocationPublic(db(), await actorOf(form), {
      locationId: text(form, 'locationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      isPublic: form.get('isPublic') === 'on',
      provinceCode: text(form, 'provinceCode'),
      cityId: text(form, 'cityId'),
      hoursNoteFa: text(form, 'hoursNoteFa'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'محل کار ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addOwnLocationAction(_previous: DirectoryEditState, form: FormData): Promise<DirectoryEditState> {
  try {
    await addOwnLocation(db(), await actorOf(form), {
      nameFa: text(form, 'nameFa'),
      kind: text(form, 'kind'),
      cityId: text(form, 'cityId'),
      neighborhoodFa: text(form, 'neighborhoodFa'),
      addressFa: text(form, 'addressFa'),
      phone: text(form, 'phone'),
      hoursNoteFa: text(form, 'hoursNoteFa'),
      isPublic: form.get('isPublic') === 'on',
    });
    refresh();
    return { ok: true, message: 'محل کار اضافه شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addCityAction(_previous: DirectoryEditState, form: FormData): Promise<DirectoryEditState> {
  try {
    const city = await addCity(db(), await actorOf(form), { provinceCode: text(form, 'provinceCode'), nameFa: text(form, 'nameFa') });
    refresh();
    return { ok: true, message: 'شهر ' + city.nameFa + ' اضافه شد.' };
  } catch (error) {
    return failure(error);
  }
}
