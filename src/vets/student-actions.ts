'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { env } from '../config/env.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { decideStudentCase, resubmitStudentApplication, submitStudentApplication, type StudentDocumentInput } from './student-application.ts';

export interface StudentState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): StudentState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  revalidatePath('/account/vet-profile', 'layout');
  revalidatePath('/dashboard');
  revalidatePath('/assoc', 'layout');
}

async function documentOf(form: FormData): Promise<StudentDocumentInput | null> {
  const file = form.get('studentCard');
  return file instanceof File && file.size > 0 ? { bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name } : null;
}

const fields = (form: FormData) => ({
  displayNameFa: text(form, 'displayNameFa'),
  studentNumber: text(form, 'studentNumber'),
  universityFa: text(form, 'universityFa'),
});

export async function submitStudentApplicationAction(_previous: StudentState, form: FormData): Promise<StudentState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await submitStudentApplication(db(), env().PRIVATE_STORAGE_DIR, actor, { ...fields(form), document: await documentOf(form) });
    refresh();
    return { ok: true, message: 'درخواست دانشجویی ثبت شد و برای بررسی انجمن ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function resubmitStudentApplicationAction(_previous: StudentState, form: FormData): Promise<StudentState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await resubmitStudentApplication(db(), env().PRIVATE_STORAGE_DIR, actor, {
      caseId: text(form, 'caseId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      ...fields(form),
      document: await documentOf(form),
    });
    refresh();
    return { ok: true, message: 'اصلاحات ثبت شد و پرونده دوباره برای بررسی ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideStudentCaseAction(_previous: StudentState, form: FormData): Promise<StudentState> {
  try {
    const actor = await actorAt('/assoc/vet-students');
    const row = await decideStudentCase(db(), actor, {
      caseId: text(form, 'caseId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh();
    return {
      ok: true,
      message: row.status === 'VERIFIED_STUDENT' ? 'دانشجویی تأیید شد.' : row.status === 'REJECTED' ? 'پرونده رد شد.' : 'درخواست اصلاح ثبت شد.',
    };
  } catch (error) {
    return failure(error);
  }
}
