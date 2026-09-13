'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { env } from '../config/env.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { MAX_CERTIFICATES } from './professional-profile-model.ts';
import {
  decideLicenceCase,
  reviseLicenceApplication,
  submitLicenceApplication,
  type LicenceApplicationInput,
  type LicenceDocumentInput,
} from './licence-application.ts';

export interface LicenceState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): LicenceState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  revalidatePath('/account/vet-profile', 'layout');
  revalidatePath('/dashboard');
  revalidatePath('/assoc', 'layout');
}

async function fileOf(form: FormData, key: string): Promise<{ bytes: Uint8Array; originalName: string } | null> {
  const file = form.get(key);
  return file instanceof File && file.size > 0 ? { bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name } : null;
}

async function documentsOf(form: FormData): Promise<LicenceDocumentInput[]> {
  const documents: LicenceDocumentInput[] = [];
  for (const kind of ['PRACTICE_LICENCE', 'COUNCIL_CARD', 'IDENTITY', 'OTHER'] as const) {
    const file = await fileOf(form, 'document_' + kind);
    if (file) documents.push({ kind, ...file });
  }
  for (let slot = 1; slot <= MAX_CERTIFICATES; slot += 1) {
    const file = await fileOf(form, 'certificate_' + slot + '_file');
    if (file) documents.push({ kind: 'CERTIFICATE', ...file, titleFa: text(form, 'certificate_' + slot + '_title') });
  }
  return documents;
}

async function inputOf(form: FormData): Promise<LicenceApplicationInput> {
  return {
    displayNameFa: text(form, 'displayNameFa'),
    practiceScope: text(form, 'practiceScope'),
    councilCode: text(form, 'councilCode'),
    licenceCode: text(form, 'licenceCode'),
    licenceDate: text(form, 'licenceDate'),
    phone: text(form, 'phone'),
    cityId: text(form, 'cityId'),
    websiteUrl: text(form, 'websiteUrl'),
    instagramHandle: text(form, 'instagramHandle'),
    clinicNameFa: text(form, 'clinicNameFa'),
    serviceCodes: form.getAll('serviceCodes').map(String),
    documents: await documentsOf(form),
  };
}

export async function submitLicenceApplicationAction(_previous: LicenceState, form: FormData): Promise<LicenceState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await submitLicenceApplication(db(), env().PRIVATE_STORAGE_DIR, actor, await inputOf(form));
    refresh();
    return { ok: true, message: 'پروانه فعالیت برای بررسی انجمن ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function reviseLicenceApplicationAction(_previous: LicenceState, form: FormData): Promise<LicenceState> {
  try {
    const actor = await actorAt('/account/vet-profile');
    await reviseLicenceApplication(db(), env().PRIVATE_STORAGE_DIR, actor, {
      ...(await inputOf(form)),
      caseId: text(form, 'caseId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
    });
    refresh();
    return { ok: true, message: 'نسخه تازه ثبت شد؛ نسخه‌های قبلی همان‌طور نگهداری می‌شوند.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideLicenceCaseAction(_previous: LicenceState, form: FormData): Promise<LicenceState> {
  try {
    const actor = await actorAt('/assoc/vet-licences');
    const row = await decideLicenceCase(db(), actor, {
      caseId: text(form, 'caseId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh();
    return {
      ok: true,
      message: row.status === 'LICENSE_APPROVED_AWAITING_PAYMENT' ? 'مدارک پروانه تأیید شد؛ در انتظار پرداخت.' : row.status === 'REJECTED' ? 'پرونده رد شد.' : 'درخواست اصلاح ثبت شد.',
    };
  } catch (error) {
    return failure(error);
  }
}
