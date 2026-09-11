'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import {
  addMedicalClaim,
  archiveMedicalClaim,
  changeBreedStatus,
  markBreedDuplicate,
  updateBreedProfile,
} from '../../../../src/breeds/service.ts';
import { parseAltNames } from '../../../../src/breeds/model.ts';
import { AppError } from '../../../../src/domain/errors.ts';

export interface BreedEditState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');
const optional = (form: FormData, key: string): string | null => {
  const value = form.get(key);
  return value === null ? null : String(value);
};

async function superadmin() {
  const guard = await guardRoute('/admin/breeds');
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): BreedEditState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(breedId: string): void {
  revalidatePath('/admin/breeds');
  revalidatePath('/admin/breeds/' + breedId);
}

export async function updateBreedProfileAction(_previous: BreedEditState, form: FormData): Promise<BreedEditState> {
  const breedId = text(form, 'breedId');
  try {
    const actor = await superadmin();
    await updateBreedProfile(db(), actor, {
      breedId,
      expectedVersion: Number(text(form, 'expectedVersion')),
      nameFa: text(form, 'nameFa'),
      nameEn: text(form, 'nameEn'),
      slug: text(form, 'slug'),
      altNames: parseAltNames(text(form, 'altNames')),
      speciesCode: text(form, 'speciesCode'),
      groupId: optional(form, 'groupId'),
      originCountry: optional(form, 'originCountry'),
      size: optional(form, 'size'),
      coat: optional(form, 'coat'),
      energy: optional(form, 'energy'),
      trainability: optional(form, 'trainability'),
      careNeed: optional(form, 'careNeed'),
      withChildren: optional(form, 'withChildren'),
      withOtherAnimals: optional(form, 'withOtherAnimals'),
      historyFa: optional(form, 'historyFa'),
      standardFa: optional(form, 'standardFa'),
      standardUrl: optional(form, 'standardUrl'),
    });
    refresh(breedId);
    return { ok: true, message: 'پرونده نژاد ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function changeBreedStatusAction(_previous: BreedEditState, form: FormData): Promise<BreedEditState> {
  const breedId = text(form, 'breedId');
  try {
    const actor = await superadmin();
    const row = await changeBreedStatus(db(), actor, {
      breedId,
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to'),
      reason: text(form, 'reason'),
    });
    refresh(breedId);
    return {
      ok: true,
      message:
        row.profileStatus === 'PUBLISHED'
          ? 'صفحه نژاد منتشر شد.'
          : row.profileStatus === 'ARCHIVED'
            ? 'صفحه نژاد بایگانی شد.'
            : 'صفحه نژاد از انتشار خارج شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function markBreedDuplicateAction(_previous: BreedEditState, form: FormData): Promise<BreedEditState> {
  const breedId = text(form, 'breedId');
  try {
    const actor = await superadmin();
    await markBreedDuplicate(db(), actor, {
      breedId,
      primaryBreedId: text(form, 'primaryBreedId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      reason: text(form, 'reason'),
    });
    refresh(breedId);
    return { ok: true, message: 'نژاد به‌عنوان تکراری ثبت شد و از انتخاب‌های جدید کنار رفت.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addMedicalClaimAction(_previous: BreedEditState, form: FormData): Promise<BreedEditState> {
  const breedId = text(form, 'breedId');
  try {
    const actor = await superadmin();
    await addMedicalClaim(db(), actor, {
      breedId,
      kind: text(form, 'kind'),
      titleFa: text(form, 'titleFa'),
      noteFa: optional(form, 'noteFa'),
      sourceTitle: text(form, 'sourceTitle'),
      sourceUrl: optional(form, 'sourceUrl'),
      reviewedOn: text(form, 'reviewedOn'),
    });
    refresh(breedId);
    return { ok: true, message: 'مطلب سلامت با منبع و تاریخ بازبینی ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveMedicalClaimAction(_previous: BreedEditState, form: FormData): Promise<BreedEditState> {
  const breedId = text(form, 'breedId');
  try {
    const actor = await superadmin();
    await archiveMedicalClaim(db(), actor, { claimId: text(form, 'claimId'), reason: text(form, 'reason') });
    refresh(breedId);
    return { ok: true, message: 'مطلب سلامت از صفحه برداشته شد؛ سابقه آن می‌ماند.' };
  } catch (error) {
    return failure(error);
  }
}
