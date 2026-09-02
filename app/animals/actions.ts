'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import {
  applyLineage,
  attachAnimalPhoto,
  editAnimal,
  registerAnimal,
  rememberReturn,
  saveDraft,
  startDraft,
  type AnimalSex,
} from '../../src/animals/service.ts';
import {
  attachForeignSide,
  setForeignDetails,
  submitForeignCase,
} from '../../src/animals/foreign-pedigree.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface FormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): FormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');
const optional = (form: FormData, key: string): string | null => {
  const value = text(form, key).trim();
  return value === '' ? null : value;
};

/** Starts or resumes the draft and takes the owner to the form. */
export async function startAnimalDraftAction(): Promise<void> {
  let destination: string;
  try {
    const actor = await requireActor('/animals/new');
    const draft = await startDraft(db(), actor);
    destination = '/animals/' + draft.id + '/edit';
  } catch (error) {
    if (error instanceof AppError) redirect('/animals/new?error=' + encodeURIComponent(error.message));
    throw error;
  }
  redirect(destination);
}

/**
 * Save one step.
 *
 * The generation is never part of this input: it is computed by the server from
 * resolvable parents, so nothing posted here can raise or lower it (§9.3).
 */
export async function saveAnimalStepAction(_previous: FormState, form: FormData): Promise<FormState> {
  const animalId = text(form, 'animalId');
  try {
    const actor = await requireActor('/animals/' + animalId + '/edit');
    const step = Number(text(form, 'step') || '1');
    const sexValue = optional(form, 'sex');

    await saveDraft(db(), actor, animalId, {
      name: form.has('name') ? optional(form, 'name') : undefined,
      breedId: form.has('breedId') ? optional(form, 'breedId') : undefined,
      sex: form.has('sex') ? ((sexValue as AnimalSex | null) ?? null) : undefined,
      birthDate: form.has('birthDate') ? optional(form, 'birthDate') : undefined,
      birthDateApproximate: form.has('birthDate') ? form.get('birthDateApproximate') === 'on' : undefined,
      color: form.has('color') ? optional(form, 'color') : undefined,
      markings: form.has('markings') ? optional(form, 'markings') : undefined,
      declaredMicrochipNumber: form.has('hasMicrochip')
        ? form.get('hasMicrochip') === 'yes'
          ? optional(form, 'declaredMicrochipNumber')
          : null
        : undefined,
      origin: form.has('origin') ? (text(form, 'origin') as 'G0' | 'INTERNAL_G1PLUS' | 'FOREIGN_PEDIGREE') : undefined,
      ownPedigreeCode: form.has('ownPedigreeCode') ? optional(form, 'ownPedigreeCode') : undefined,
      sirePedigreeCode: form.has('sirePedigreeCode') ? optional(form, 'sirePedigreeCode') : undefined,
      damPedigreeCode: form.has('damPedigreeCode') ? optional(form, 'damPedigreeCode') : undefined,
      step: Number.isFinite(step) ? step : undefined,
    });
    revalidatePath('/animals/' + animalId + '/edit');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadAnimalPhotoAction(_previous: FormState, form: FormData): Promise<FormState> {
  const animalId = text(form, 'animalId');
  try {
    const actor = await requireActor('/animals/' + animalId + '/edit');
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'فایلی انتخاب نشده است.', tone: 'error' };
    }
    await attachAnimalPhoto(db(), env().PRIVATE_STORAGE_DIR, actor, animalId, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
    });
    revalidatePath('/animals/' + animalId + '/edit');
    return { ok: true, message: 'تصویر حیوان ذخیره شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

/** Resolve the entered parent codes and write the result, with an audit row. */
export async function resolveLineageAction(_previous: FormState, form: FormData): Promise<FormState> {
  const animalId = text(form, 'animalId');
  try {
    const actor = await requireActor('/animals/' + animalId + '/edit');
    await saveDraft(db(), actor, animalId, {
      ownPedigreeCode: optional(form, 'ownPedigreeCode'),
      sirePedigreeCode: optional(form, 'sirePedigreeCode'),
      damPedigreeCode: optional(form, 'damPedigreeCode'),
    });
    const { result } = await applyLineage(db(), actor, animalId);
    revalidatePath('/animals/' + animalId + '/edit');

    if (result.outcome.state === 'LOOKUP_ERROR') {
      return {
        ok: false,
        tone: 'error',
        message: 'بررسی نسب انجام نشد. اطلاعات شما حفظ شده است؛ دوباره تلاش کنید.',
      };
    }
    if (result.outcome.state === 'PARENT_MISSING') {
      return {
        ok: true,
        tone: 'info',
        message: 'والد قابل‌اثبات پیدا نشد؛ فعلاً این حیوان G0 ثبت می‌شود. می‌توانید والد گمشده را ثبت و دوباره بررسی کنید.',
      };
    }
    return { ok: true, tone: 'success', message: 'نسل از رکورد والدین محاسبه شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Remembers the draft and step before leaving to register a missing parent. */
export async function registerMissingParentAction(form: FormData): Promise<void> {
  const animalId = text(form, 'animalId');
  const actor = await requireActor('/animals/' + animalId + '/edit');
  await rememberReturn(db(), actor, animalId, {
    entity: { type: 'ANIMAL', id: animalId },
    step: 'LINEAGE',
    originRoute: '/animals/' + animalId + '/edit?step=6',
  });
  // A fresh record: the open draft here is the child that is waiting.
  const draft = await startDraft(db(), actor, { excludeAnimalId: animalId });
  redirect('/animals/' + draft.id + '/edit?parentOf=' + animalId);
}

export async function registerAnimalAction(_previous: FormState, form: FormData): Promise<FormState> {
  const animalId = text(form, 'animalId');
  let destination: string;
  try {
    const actor = await requireActor('/animals/' + animalId + '/edit');
    const registered = await registerAnimal(db(), actor, animalId);
    destination = '/animals/' + registered.id;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function editAnimalAction(_previous: FormState, form: FormData): Promise<FormState> {
  const animalId = text(form, 'animalId');
  try {
    const actor = await requireActor('/animals/' + animalId);
    await editAnimal(db(), actor, animalId, {
      name: optional(form, 'name'),
      color: optional(form, 'color'),
      markings: optional(form, 'markings'),
      birthDateApproximate: form.get('birthDateApproximate') === 'on',
    });
    revalidatePath('/animals/' + animalId);
    return { ok: true, message: 'اطلاعات پرونده به‌روزرسانی شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

// ── Foreign pedigree, owner side ──────────────────────────────────────────

export async function saveForeignDetailsAction(_previous: FormState, form: FormData): Promise<FormState> {
  const animalId = text(form, 'animalId');
  try {
    const actor = await requireActor('/animals/' + animalId + '/foreign-pedigree');
    await setForeignDetails(db(), actor, {
      animalId,
      issuerId: optional(form, 'issuerId'),
      documentCode: optional(form, 'documentCode'),
    });
    revalidatePath('/animals/' + animalId + '/foreign-pedigree');
    return { ok: true, message: 'اطلاعات مدرک ذخیره شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadForeignSideAction(_previous: FormState, form: FormData): Promise<FormState> {
  const animalId = text(form, 'animalId');
  const side = text(form, 'side') === 'BACK' ? 'BACK' : 'FRONT';
  try {
    const actor = await requireActor('/animals/' + animalId + '/foreign-pedigree');
    const file = form.get('document');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'فایلی انتخاب نشده است.', tone: 'error' };
    }
    await attachForeignSide(db(), env().PRIVATE_STORAGE_DIR, actor, {
      animalId,
      side,
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
    });
    revalidatePath('/animals/' + animalId + '/foreign-pedigree');
    return {
      ok: true,
      message: side === 'FRONT' ? 'تصویر روی برگه بارگذاری شد.' : 'تصویر پشت برگه بارگذاری شد.',
      tone: 'success',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function submitForeignCaseAction(_previous: FormState, form: FormData): Promise<FormState> {
  const animalId = text(form, 'animalId');
  try {
    const actor = await requireActor('/animals/' + animalId + '/foreign-pedigree');
    await submitForeignCase(db(), actor, animalId);
    revalidatePath('/animals/' + animalId + '/foreign-pedigree');
    return { ok: true, message: 'پرونده برای بررسی انجمن ارسال شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}
