'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { env } from '../config/env.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { VET_DOCUMENT_KINDS } from './onboarding-model.ts';
import {
  appealVetApplication,
  createUnownedVetProfile,
  decideVetApplication,
  resubmitVetApplication,
  submitVetApplication,
  withdrawVetApplication,
  type ApplicationDocumentInput,
} from './onboarding.ts';

export interface OnboardingState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): OnboardingState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  revalidatePath('/account/vet-profile', 'layout');
  revalidatePath('/review/vets', 'layout');
  revalidatePath('/veterinarians', 'layout');
}

/** One file per document kind; the storage layer checks each file's real type and size. */
async function documentsOf(form: FormData): Promise<ApplicationDocumentInput[]> {
  const documents: ApplicationDocumentInput[] = [];
  for (const kind of VET_DOCUMENT_KINDS) {
    const file = form.get('document_' + kind);
    if (file instanceof File && file.size > 0) {
      documents.push({ kind, bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name });
    }
  }
  return documents;
}

const fields = (form: FormData) => ({
  displayNameFa: text(form, 'displayNameFa'),
  councilCode: text(form, 'councilCode'),
  phone: text(form, 'phone'),
  cityId: text(form, 'cityId'),
  statementFa: text(form, 'statementFa'),
});

export async function submitVetApplicationAction(_previous: OnboardingState, form: FormData): Promise<OnboardingState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await submitVetApplication(db(), env().PRIVATE_STORAGE_DIR, actor, {
      kind: text(form, 'kind'),
      claimSlug: text(form, 'claimSlug'),
      ...fields(form),
      documents: await documentsOf(form),
    });
    refresh();
    return { ok: true, message: 'درخواست ثبت شد و برای بررسی ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function resubmitVetApplicationAction(_previous: OnboardingState, form: FormData): Promise<OnboardingState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await resubmitVetApplication(db(), env().PRIVATE_STORAGE_DIR, actor, {
      applicationId: text(form, 'applicationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      ...fields(form),
      documents: await documentsOf(form),
    });
    refresh();
    return { ok: true, message: 'اصلاحات ثبت شد و درخواست دوباره برای بررسی ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function withdrawVetApplicationAction(_previous: OnboardingState, form: FormData): Promise<OnboardingState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await withdrawVetApplication(db(), actor, {
      applicationId: text(form, 'applicationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
    });
    refresh();
    return { ok: true, message: 'از درخواست انصراف دادید؛ درخواست بایگانی شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function appealVetApplicationAction(_previous: OnboardingState, form: FormData): Promise<OnboardingState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await appealVetApplication(db(), actor, {
      applicationId: text(form, 'applicationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      appealFa: text(form, 'appealFa'),
    });
    refresh();
    return { ok: true, message: 'تجدیدنظر ثبت شد و درخواست دوباره بررسی می‌شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideVetApplicationAction(_previous: OnboardingState, form: FormData): Promise<OnboardingState> {
  try {
    const actor = await actorAt('/review/vets');
    const row = await decideVetApplication(db(), actor, {
      applicationId: text(form, 'applicationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh();
    return {
      ok: true,
      message: row.status === 'APPROVED' ? 'درخواست تأیید شد.' : row.status === 'REJECTED' ? 'درخواست رد شد.' : 'درخواست اصلاح ثبت شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function createUnownedVetProfileAction(_previous: OnboardingState, form: FormData): Promise<OnboardingState> {
  try {
    const actor = await actorAt('/review/vets/unowned');
    const row = await createUnownedVetProfile(db(), actor, {
      displayNameFa: text(form, 'displayNameFa'),
      cityId: text(form, 'cityId'),
      contactFa: text(form, 'contactFa'),
      sourceFa: text(form, 'sourceFa'),
      councilCode: text(form, 'councilCode'),
      reason: text(form, 'reason'),
      confirmedNotDuplicate: form.get('confirmedNotDuplicate') === 'on',
    });
    refresh();
    return { ok: true, message: 'پروفایل بدون مالک «' + row.displayNameFa + '» منتشر شد.' };
  } catch (error) {
    return failure(error);
  }
}
