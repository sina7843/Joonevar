'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { mergeRecord } from './merge.ts';

export interface MergeFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const field = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();

/**
 * Mark one directory record a duplicate of another — §21 (PROMPT-016).
 *
 * The service decides everything; this only carries the form to it and says
 * what happened. A merge changes what the public lists show, so the public
 * sections are revalidated too.
 */
export async function mergeRecordAction(_previous: MergeFormState, form: FormData): Promise<MergeFormState> {
  try {
    const guard = await guardRoute('/admin/merge');
    if (!guard.ok) throw guard.denied;

    // The duplicate arrives as `id:version`, so the choice and the version it
    // was made against can never drift apart.
    const [duplicateId, version] = field(form, 'duplicate').split(':');
    const row = await mergeRecord(db(), guard.actor, {
      kind: field(form, 'kind'),
      duplicateId: duplicateId ?? '',
      primaryId: field(form, 'primaryId'),
      expectedVersion: Number(version ?? ''),
      reason: field(form, 'reason'),
    });

    revalidatePath('/admin/merge', 'layout');
    for (const path of ['/veterinarians', '/centers', '/associations']) revalidatePath(path, 'layout');
    return { ok: true, message: '«' + row.nameFa + '» به‌عنوان تکراری ثبت شد و نشانی‌اش به رکورد اصلی اشاره می‌کند.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
