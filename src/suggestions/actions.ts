'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { env } from '../config/env.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { CLAIM_DOCUMENT_KINDS } from './model.ts';
import { decideSuggestion, resubmitSuggestion, submitSuggestion, withdrawSuggestion } from './service.ts';
import {
  appealCentreClaim,
  decideCentreClaim,
  resubmitCentreClaim,
  submitCentreClaim,
  withdrawCentreClaim,
  type ClaimDocumentInput,
} from '../centres/claims.ts';

export interface SuggestionFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): SuggestionFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  for (const path of ['/account/suggestions', '/account/centres', '/review/suggestions', '/review/centres', '/centers', '/veterinarians']) {
    revalidatePath(path, 'layout');
  }
}

const suggestionFields = (form: FormData) => ({
  kind: text(form, 'kind'),
  displayNameFa: text(form, 'displayNameFa'),
  cityId: text(form, 'cityId'),
  contactFa: text(form, 'contactFa'),
  sourceFa: text(form, 'sourceFa'),
  noteFa: text(form, 'noteFa'),
  confirmedNotDuplicate: form.get('confirmedNotDuplicate') === 'on',
});

/** One file per document kind; the storage layer checks each file's real type and size. */
async function documentsOf(form: FormData): Promise<ClaimDocumentInput[]> {
  const documents: ClaimDocumentInput[] = [];
  for (const kind of CLAIM_DOCUMENT_KINDS) {
    const file = form.get('document_' + kind);
    if (file instanceof File && file.size > 0) {
      documents.push({ kind, bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name });
    }
  }
  return documents;
}

// ── Suggestions ──────────────────────────────────────────────────────────

export async function submitSuggestionAction(_previous: SuggestionFormState, form: FormData): Promise<SuggestionFormState> {
  try {
    await submitSuggestion(db(), await actorAt('/account/suggestions'), suggestionFields(form));
    refresh();
    return { ok: true, message: 'پیشنهاد ثبت شد و برای بررسی رفت. تا تأیید نشود در فهرست عمومی نمی‌آید.' };
  } catch (error) {
    return failure(error);
  }
}

export async function resubmitSuggestionAction(_previous: SuggestionFormState, form: FormData): Promise<SuggestionFormState> {
  try {
    await resubmitSuggestion(db(), await actorAt('/account/suggestions'), {
      suggestionId: text(form, 'suggestionId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      ...suggestionFields(form),
    });
    refresh();
    return { ok: true, message: 'اصلاحات ثبت شد و پیشنهاد دوباره برای بررسی رفت.' };
  } catch (error) {
    return failure(error);
  }
}

export async function withdrawSuggestionAction(_previous: SuggestionFormState, form: FormData): Promise<SuggestionFormState> {
  try {
    await withdrawSuggestion(db(), await actorAt('/account/suggestions'), {
      suggestionId: text(form, 'suggestionId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
    });
    refresh();
    return { ok: true, message: 'از پیشنهاد انصراف دادید؛ پیشنهاد بایگانی شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideSuggestionAction(_previous: SuggestionFormState, form: FormData): Promise<SuggestionFormState> {
  try {
    const row = await decideSuggestion(db(), await actorAt('/review/suggestions'), {
      suggestionId: text(form, 'suggestionId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reasonFa'),
      confirmedNotDuplicate: form.get('confirmedNotDuplicate') === 'on',
    });
    refresh();
    return {
      ok: true,
      message:
        row.status === 'APPROVED'
          ? 'پیشنهاد تأیید شد و رکورد بدون مالک منتشر شد.'
          : row.status === 'REJECTED'
            ? 'پیشنهاد رد شد.'
            : 'درخواست اصلاح ثبت شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

// ── Centre claims ────────────────────────────────────────────────────────

const claimFields = (form: FormData) => ({
  claimantNameFa: text(form, 'claimantNameFa'),
  roleFa: text(form, 'roleFa'),
  phone: text(form, 'phone'),
  statementFa: text(form, 'statementFa'),
});

export async function submitCentreClaimAction(_previous: SuggestionFormState, form: FormData): Promise<SuggestionFormState> {
  try {
    await submitCentreClaim(db(), env().PRIVATE_STORAGE_DIR, await actorAt('/account/centres'), {
      claimSlug: text(form, 'claimSlug'),
      ...claimFields(form),
      documents: await documentsOf(form),
    });
    refresh();
    return { ok: true, message: 'درخواست مدیریت مرکز ثبت شد و برای بررسی رفت.' };
  } catch (error) {
    return failure(error);
  }
}

export async function resubmitCentreClaimAction(_previous: SuggestionFormState, form: FormData): Promise<SuggestionFormState> {
  try {
    await resubmitCentreClaim(db(), env().PRIVATE_STORAGE_DIR, await actorAt('/account/centres'), {
      claimId: text(form, 'claimId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      ...claimFields(form),
      documents: await documentsOf(form),
    });
    refresh();
    return { ok: true, message: 'اصلاحات ثبت شد و درخواست دوباره برای بررسی رفت.' };
  } catch (error) {
    return failure(error);
  }
}

export async function withdrawCentreClaimAction(_previous: SuggestionFormState, form: FormData): Promise<SuggestionFormState> {
  try {
    await withdrawCentreClaim(db(), await actorAt('/account/centres'), {
      claimId: text(form, 'claimId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
    });
    refresh();
    return { ok: true, message: 'از درخواست انصراف دادید؛ درخواست بایگانی شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function appealCentreClaimAction(_previous: SuggestionFormState, form: FormData): Promise<SuggestionFormState> {
  try {
    await appealCentreClaim(db(), await actorAt('/account/centres'), {
      claimId: text(form, 'claimId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      appealFa: text(form, 'appealFa'),
    });
    refresh();
    return { ok: true, message: 'تجدیدنظر ثبت شد و درخواست دوباره بررسی می‌شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideCentreClaimAction(_previous: SuggestionFormState, form: FormData): Promise<SuggestionFormState> {
  try {
    const row = await decideCentreClaim(db(), await actorAt('/review/centres/claims'), {
      claimId: text(form, 'claimId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh();
    return {
      ok: true,
      message:
        row.status === 'APPROVED'
          ? 'مدیریت مرکز به درخواست‌دهنده سپرده شد.'
          : row.status === 'REJECTED'
            ? 'درخواست رد شد.'
            : 'درخواست اصلاح ثبت شد.',
    };
  } catch (error) {
    return failure(error);
  }
}
