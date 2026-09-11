'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import {
  addCity,
  changeVetPublicStatus,
  updateLocationPublic,
  updateVetPublicProfile,
} from '../../../../src/vets/directory.ts';
import { AppError } from '../../../../src/domain/errors.ts';

export interface DirectoryEditState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function superadmin(accountId: string) {
  const guard = await guardRoute('/admin/vets/' + encodeURIComponent(accountId));
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): DirectoryEditState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(accountId: string): void {
  revalidatePath('/admin/vets');
  revalidatePath('/admin/vets/' + accountId);
}

export async function updateVetPublicProfileAction(_previous: DirectoryEditState, form: FormData): Promise<DirectoryEditState> {
  const accountId = text(form, 'accountId');
  try {
    const actor = await superadmin(accountId);
    await updateVetPublicProfile(db(), actor, {
      accountId,
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
    refresh(accountId);
    return { ok: true, message: 'پروفایل عمومی ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function changeVetPublicStatusAction(_previous: DirectoryEditState, form: FormData): Promise<DirectoryEditState> {
  const accountId = text(form, 'accountId');
  try {
    const actor = await superadmin(accountId);
    const row = await changeVetPublicStatus(db(), actor, {
      accountId,
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to'),
      reason: text(form, 'reason'),
    });
    refresh(accountId);
    return { ok: true, message: row.publicStatus === 'PUBLISHED' ? 'پروفایل منتشر شد.' : 'پروفایل پنهان شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function updateLocationPublicAction(_previous: DirectoryEditState, form: FormData): Promise<DirectoryEditState> {
  const accountId = text(form, 'accountId');
  try {
    const actor = await superadmin(accountId);
    await updateLocationPublic(db(), actor, {
      locationId: text(form, 'locationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      isPublic: form.get('isPublic') === 'on',
      provinceCode: text(form, 'provinceCode'),
      cityId: text(form, 'cityId'),
      hoursNoteFa: text(form, 'hoursNoteFa'),
      reason: text(form, 'reason'),
    });
    refresh(accountId);
    return { ok: true, message: 'محل کار ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addCityAction(_previous: DirectoryEditState, form: FormData): Promise<DirectoryEditState> {
  const accountId = text(form, 'accountId');
  try {
    const actor = await superadmin(accountId);
    const city = await addCity(db(), actor, { provinceCode: text(form, 'provinceCode'), nameFa: text(form, 'nameFa') });
    refresh(accountId);
    return { ok: true, message: 'شهر ' + city.nameFa + ' اضافه شد.' };
  } catch (error) {
    return failure(error);
  }
}
