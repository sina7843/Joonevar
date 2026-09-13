'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { env } from '../config/env.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { DOCTOR_DOCUMENT_KINDS } from './professional-profile-model.ts';
import { decideDoctorCase, resubmitDoctorApplication, submitDoctorApplication, type DoctorDocumentInput } from './doctor-application.ts';

export interface DoctorState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): DoctorState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  revalidatePath('/account/vet-profile', 'layout');
  revalidatePath('/dashboard');
  revalidatePath('/assoc', 'layout');
  revalidatePath('/veterinarians', 'layout');
}

async function documentsOf(form: FormData): Promise<DoctorDocumentInput[]> {
  const documents: DoctorDocumentInput[] = [];
  for (const kind of DOCTOR_DOCUMENT_KINDS) {
    const file = form.get('document_' + kind);
    if (file instanceof File && file.size > 0) documents.push({ kind, bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name });
  }
  return documents;
}

const fields = (form: FormData) => ({
  displayNameFa: text(form, 'displayNameFa'),
  practiceScope: text(form, 'practiceScope'),
  councilCode: text(form, 'councilCode'),
  phone: text(form, 'phone'),
  cityId: text(form, 'cityId'),
  statementFa: text(form, 'statementFa'),
});

export async function submitDoctorApplicationAction(_previous: DoctorState, form: FormData): Promise<DoctorState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await submitDoctorApplication(db(), env().PRIVATE_STORAGE_DIR, actor, { ...fields(form), claimSlug: text(form, 'claimSlug'), documents: await documentsOf(form) });
    refresh();
    return { ok: true, message: 'درخواست ثبت شد و برای بررسی انجمن ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function resubmitDoctorApplicationAction(_previous: DoctorState, form: FormData): Promise<DoctorState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await resubmitDoctorApplication(db(), env().PRIVATE_STORAGE_DIR, actor, {
      caseId: text(form, 'caseId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      ...fields(form),
      documents: await documentsOf(form),
    });
    refresh();
    return { ok: true, message: 'اصلاحات ثبت شد و پرونده دوباره برای بررسی ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideDoctorCaseAction(_previous: DoctorState, form: FormData): Promise<DoctorState> {
  try {
    const actor = await actorAt('/assoc/vet-doctors');
    const row = await decideDoctorCase(db(), actor, {
      caseId: text(form, 'caseId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh();
    return { ok: true, message: row.status === 'VERIFIED_NO_LICENSE' ? 'کد نظام تأیید شد.' : row.status === 'REJECTED' ? 'درخواست رد شد.' : 'درخواست اصلاح ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}
