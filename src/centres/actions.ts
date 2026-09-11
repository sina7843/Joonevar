'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError, validation } from '../domain/errors.ts';
import { WEEKDAYS_FA } from './model.ts';
import {
  addCentreBranch,
  assignCentreOwner,
  attachLocationToCentre,
  changeCentreStatus,
  createCentre,
  inviteCentreMember,
  removeCentreMember,
  respondToCentreInvitation,
  setCentreLicence,
  updateCentreBranch,
  updateCentreProfile,
} from './service.ts';

export interface CentreFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

/**
 * The environment a centre form was submitted from. The guard checks that the
 * actor may be there; the service then checks the record itself, so a forged
 * surface gains nothing (DEC-0168).
 */
const SURFACES = { admin: '/admin/centres', review: '/review/centres', owner: '/account/centres' } as const;
export type CentreSurface = keyof typeof SURFACES;

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');
const optionalNumber = (form: FormData, key: string): number | null => {
  const raw = text(form, key).trim();
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw validation('مختصات باید عدد باشد.');
  return value;
};

async function actorOf(form: FormData) {
  const surface = text(form, 'surface');
  if (!Object.hasOwn(SURFACES, surface)) throw validation('محیط ارسال فرم معتبر نیست.');
  const guard = await guardRoute(SURFACES[surface as CentreSurface]);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): CentreFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  for (const path of Object.values(SURFACES)) revalidatePath(path, 'layout');
  revalidatePath('/account/vet-profile', 'layout');
  revalidatePath('/centers', 'layout');
}

const branchFields = (form: FormData) => ({
  nameFa: text(form, 'nameFa'),
  kind: text(form, 'kind'),
  cityId: text(form, 'cityId'),
  neighborhoodFa: text(form, 'neighborhoodFa'),
  addressFa: text(form, 'addressFa'),
  phone: text(form, 'phone'),
  latitude: optionalNumber(form, 'latitude'),
  longitude: optionalNumber(form, 'longitude'),
  isOpen24h: form.get('isOpen24h') === 'on',
  hoursNoteFa: text(form, 'hoursNoteFa'),
  isPublic: form.get('isPublic') === 'on',
});

/** One row per weekday, empty when the day is not announced. */
const hoursOf = (form: FormData) =>
  WEEKDAYS_FA.map((_, weekday) => ({
    weekday,
    opensAt: text(form, 'opens_' + weekday),
    closesAt: text(form, 'closes_' + weekday),
  }));

export async function createCentreAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    const centre = await createCentre(db(), await actorOf(form), {
      typeCode: text(form, 'typeCode'),
      displayNameFa: text(form, 'displayNameFa'),
      cityId: text(form, 'cityId'),
      contactFa: text(form, 'contactFa'),
      sourceFa: text(form, 'sourceFa'),
      reason: text(form, 'reason'),
      confirmedNotDuplicate: form.get('confirmedNotDuplicate') === 'on',
    });
    refresh();
    return { ok: true, message: 'مرکز «' + centre.displayNameFa + '» ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCentreProfileAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    await updateCentreProfile(db(), await actorOf(form), {
      centreId: text(form, 'centreId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      typeCode: text(form, 'typeCode'),
      displayNameFa: text(form, 'displayNameFa'),
      aboutFa: text(form, 'aboutFa'),
      phone: text(form, 'phone'),
      websiteUrl: text(form, 'websiteUrl'),
      serviceCodes: form.getAll('service').map(String),
      speciesCodes: form.getAll('species').map(String),
      facilityCodes: form.getAll('facility').map(String),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'پرونده مرکز ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setCentreLicenceAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    await setCentreLicence(db(), await actorOf(form), {
      centreId: text(form, 'centreId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      licenceNumber: text(form, 'licenceNumber'),
      licenceStatus: text(form, 'licenceStatus'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'مجوز مرکز ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function changeCentreStatusAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    const row = await changeCentreStatus(db(), await actorOf(form), {
      centreId: text(form, 'centreId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: row.publicStatus === 'PUBLISHED' ? 'مرکز منتشر شد.' : 'مرکز پنهان شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function assignCentreOwnerAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    await assignCentreOwner(db(), await actorOf(form), {
      centreId: text(form, 'centreId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      mobile: text(form, 'mobile'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'مدیریت مرکز واگذار شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addCentreBranchAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    await addCentreBranch(db(), await actorOf(form), text(form, 'centreId'), { ...branchFields(form), hours: hoursOf(form) });
    refresh();
    return { ok: true, message: 'شعبه اضافه شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCentreBranchAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    await updateCentreBranch(db(), await actorOf(form), {
      locationId: text(form, 'locationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      ...branchFields(form),
      isActive: form.get('isActive') === 'on',
      hours: hoursOf(form),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'شعبه ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function attachLocationToCentreAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    await attachLocationToCentre(db(), await actorOf(form), {
      centreId: text(form, 'centreId'),
      locationId: text(form, 'locationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'محل کار موجود به این مرکز پیوند خورد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function inviteCentreMemberAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    await inviteCentreMember(db(), await actorOf(form), {
      centreId: text(form, 'centreId'),
      vetRef: text(form, 'vetRef'),
      roleFa: text(form, 'roleFa'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'دعوت فرستاده شد؛ نام دامپزشک پس از پذیرش او نمایش داده می‌شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function removeCentreMemberAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    await removeCentreMember(db(), await actorOf(form), {
      memberId: text(form, 'memberId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'عضو از فهرست برداشته شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** The veterinarian's own answer, from their profile page. */
export async function respondToCentreInvitationAction(_previous: CentreFormState, form: FormData): Promise<CentreFormState> {
  try {
    const guard = await guardRoute('/account/vet-profile');
    if (!guard.ok) throw guard.denied;
    const row = await respondToCentreInvitation(db(), guard.actor, {
      memberId: text(form, 'memberId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      accept: text(form, 'answer') === 'ACCEPT',
    });
    refresh();
    return { ok: true, message: row.status === 'ACCEPTED' ? 'عضویت در این مرکز پذیرفته شد.' : 'دعوت رد شد.' };
  } catch (error) {
    return failure(error);
  }
}
