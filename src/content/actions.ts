'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { env } from '../config/env.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import {
  attachContentImage,
  changeContentStatus,
  createCategory,
  createContent,
  restoreRevision,
  setCategoryActive,
  updateContent,
} from './service.ts';
import { PANEL_BASE, editorPathFor, type ContentPanel } from './model.ts';

export interface ContentFormState {
  readonly ok?: boolean;
  readonly message?: string;
  /** The title matched existing content; the form offers to confirm. */
  readonly duplicate?: boolean;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');
const optional = (form: FormData, key: string): string | null => {
  const value = form.get(key);
  return value === null ? null : String(value);
};
const panelOf = (form: FormData): ContentPanel => (text(form, 'panel') === 'content' ? 'content' : 'author');

/** The route guard of the page the form lives on; the service checks the context again. */
async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): ContentFormState {
  if (error instanceof AppError) {
    const detail = (error as { detail?: { duplicates?: unknown } }).detail;
    return { ok: false, message: error.message, duplicate: Boolean(detail?.duplicates) };
  }
  throw error;
}

export async function createContentAction(_previous: ContentFormState, form: FormData): Promise<ContentFormState> {
  const panel = panelOf(form);
  let contentId: string;
  try {
    const actor = await actorAt(PANEL_BASE[panel] + '/new');
    const row = await createContent(db(), actor, {
      kind: text(form, 'kind'),
      titleFa: text(form, 'titleFa'),
      confirmDuplicate: text(form, 'confirmDuplicate') === 'YES',
    });
    contentId = row.id;
  } catch (error) {
    return failure(error);
  }
  redirect(editorPathFor(panel, contentId));
}

export async function updateContentAction(_previous: ContentFormState, form: FormData): Promise<ContentFormState> {
  const panel = panelOf(form);
  const contentId = text(form, 'contentId');
  const path = editorPathFor(panel, contentId);
  try {
    const row = await updateContent(db(), await actorAt(path), {
      contentId,
      expectedVersion: Number(text(form, 'expectedVersion')),
      slug: text(form, 'slug'),
      titleFa: text(form, 'titleFa'),
      summaryFa: text(form, 'summaryFa'),
      bodyFa: text(form, 'bodyFa'),
      sourcesText: text(form, 'sources'),
      tagsText: text(form, 'tags'),
      categoryId: optional(form, 'categoryId'),
      speciesCode: optional(form, 'speciesCode'),
      breedId: optional(form, 'breedId'),
      imageAltFa: optional(form, 'imageAltFa'),
      seoTitle: optional(form, 'seoTitle'),
      seoDescription: optional(form, 'seoDescription'),
      reviewedOn: optional(form, 'reviewedOn'),
    });
    revalidatePath(path);
    return { ok: true, message: 'ذخیره شد؛ نسخه ' + row.revisionNumber.toLocaleString('fa-IR') + '.' };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadContentImageAction(_previous: ContentFormState, form: FormData): Promise<ContentFormState> {
  const panel = panelOf(form);
  const contentId = text(form, 'contentId');
  const path = editorPathFor(panel, contentId);
  try {
    const actor = await actorAt(path);
    const file = form.get('image');
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'فایلی انتخاب نشده است.' };
    await attachContentImage(db(), env().PRIVATE_STORAGE_DIR, actor, {
      contentId,
      expectedVersion: Number(text(form, 'expectedVersion')),
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
      altFa: text(form, 'altFa'),
    });
    revalidatePath(path);
    return { ok: true, message: 'تصویر ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function changeContentStatusAction(_previous: ContentFormState, form: FormData): Promise<ContentFormState> {
  const panel = panelOf(form);
  const contentId = text(form, 'contentId');
  const path = editorPathFor(panel, contentId);
  try {
    const iso = text(form, 'publishAtIso');
    const publishAt = iso === '' ? null : new Date(iso);
    const row = await changeContentStatus(db(), await actorAt(path), {
      contentId,
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to'),
      reason: optional(form, 'reason'),
      publishAt: publishAt !== null && !Number.isNaN(publishAt.getTime()) ? publishAt : null,
    });
    revalidatePath(path);
    const scheduled = row.status === 'PUBLISHED' && row.publishAt !== null && row.publishAt.getTime() > Date.now();
    return { ok: true, message: scheduled ? 'انتشار زمان‌بندی شد.' : 'وضعیت ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function restoreRevisionAction(_previous: ContentFormState, form: FormData): Promise<ContentFormState> {
  const panel = panelOf(form);
  const contentId = text(form, 'contentId');
  const path = editorPathFor(panel, contentId);
  try {
    const row = await restoreRevision(db(), await actorAt(path), {
      contentId,
      expectedVersion: Number(text(form, 'expectedVersion')),
      revisionNumber: Number(text(form, 'revisionNumber')),
    });
    revalidatePath(path);
    return { ok: true, message: 'نسخه بازگردانده شد؛ نسخه تازه ' + row.revisionNumber.toLocaleString('fa-IR') + '.' };
  } catch (error) {
    return failure(error);
  }
}

export async function createCategoryAction(_previous: ContentFormState, form: FormData): Promise<ContentFormState> {
  try {
    await createCategory(db(), await actorAt('/content/categories'), {
      kind: text(form, 'kind'),
      nameFa: text(form, 'nameFa'),
      slug: text(form, 'slug'),
    });
    revalidatePath('/content/categories');
    return { ok: true, message: 'دسته ساخته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setCategoryActiveAction(_previous: ContentFormState, form: FormData): Promise<ContentFormState> {
  try {
    const active = text(form, 'active') === 'YES';
    await setCategoryActive(db(), await actorAt('/content/categories'), { categoryId: text(form, 'categoryId'), active });
    revalidatePath('/content/categories');
    return { ok: true, message: active ? 'دسته دوباره فعال شد.' : 'دسته از انتخاب‌های تازه کنار رفت.' };
  } catch (error) {
    return failure(error);
  }
}
