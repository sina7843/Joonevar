'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { addLocation, updateLocation, upsertVetProfile } from '../../../src/vets/registry.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface AdminFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

async function requireActor() {
  const guard = await guardRoute('/admin/vets');
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): AdminFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');
const optional = (form: FormData, key: string): string | null => {
  const value = text(form, key).trim();
  return value === '' ? null : value;
};
const number = (form: FormData, key: string): number | null => {
  const raw = text(form, key).trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/** Records an already-approved veterinarian. This is not an onboarding request (D01). */
export async function saveVetAction(_previous: AdminFormState, form: FormData): Promise<AdminFormState> {
  try {
    const actor = await requireActor();
    await upsertVetProfile(db(), actor, {
      mobile: text(form, 'mobile'),
      displayNameFa: text(form, 'displayNameFa'),
      councilCode: text(form, 'councilCode'),
      phone: optional(form, 'phone'),
    });
    revalidatePath('/admin/vets');
    return { ok: true, message: 'پرونده حرفه‌ای دامپزشک ثبت شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

export async function addLocationAction(_previous: AdminFormState, form: FormData): Promise<AdminFormState> {
  try {
    const actor = await requireActor();
    await addLocation(db(), actor, text(form, 'vetAccountId'), {
      nameFa: text(form, 'nameFa'),
      kind: (optional(form, 'kind') ?? 'CLINIC') as 'CLINIC' | 'HOSPITAL' | 'CENTRE',
      provinceFa: optional(form, 'provinceFa'),
      cityFa: optional(form, 'cityFa'),
      neighborhoodFa: optional(form, 'neighborhoodFa'),
      addressFa: optional(form, 'addressFa'),
      phone: optional(form, 'phone'),
      latitude: number(form, 'latitude'),
      longitude: number(form, 'longitude'),
      licenceNumber: optional(form, 'licenceNumber'),
      licenceStatus: (optional(form, 'licenceStatus') ?? 'NONE') as 'NONE' | 'VALID' | 'EXPIRED' | 'REVOKED',
      canImplantMicrochip: form.get('canImplantMicrochip') === 'on',
      canDrawBloodSample: form.get('canDrawBloodSample') === 'on',
      canPregnancyCheck: form.get('canPregnancyCheck') === 'on',
    });
    revalidatePath('/admin/vets');
    revalidatePath('/vets');
    return { ok: true, message: 'مرکز ثبت شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Licence and capability changes.
 *
 * They take effect on the next Finder query and the next issuance; codes
 * already issued keep the deadline they were issued with (§11.4).
 */
export async function updateLocationAction(
  _previous: AdminFormState,
  form: FormData,
): Promise<AdminFormState> {
  try {
    const actor = await requireActor();
    await updateLocation(
      db(),
      actor,
      text(form, 'locationId'),
      {
        nameFa: text(form, 'nameFa'),
        licenceStatus: (optional(form, 'licenceStatus') ?? 'NONE') as 'NONE' | 'VALID' | 'EXPIRED' | 'REVOKED',
        canImplantMicrochip: form.get('canImplantMicrochip') === 'on',
        canDrawBloodSample: form.get('canDrawBloodSample') === 'on',
        canPregnancyCheck: form.get('canPregnancyCheck') === 'on',
        isActive: form.get('isActive') === 'on',
      },
      Number(text(form, 'version')),
    );
    revalidatePath('/admin/vets');
    revalidatePath('/vets');
    return { ok: true, message: 'اطلاعات مرکز به‌روزرسانی شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}
