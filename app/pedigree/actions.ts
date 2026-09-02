'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { attachReceiptFile, createReceipt, submitReceipt } from '../../src/genetics/service.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface PedigreeFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): PedigreeFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

/** Maps one direct payment to the exact sample codes of the chosen animals. */
export async function createReceiptAction(
  _previous: PedigreeFormState,
  form: FormData,
): Promise<PedigreeFormState> {
  let destination: string;
  try {
    const actor = await requireActor('/pedigree/new');
    const receipt = await createReceipt(db(), actor, form.getAll('animalId').map(String).filter(Boolean));
    revalidatePath('/pedigree');
    destination = '/pedigree/receipts/' + receipt.id;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** A new upload replaces the image and keeps the same receipt and its history. */
export async function uploadReceiptAction(
  _previous: PedigreeFormState,
  form: FormData,
): Promise<PedigreeFormState> {
  const receiptId = text(form, 'receiptId');
  try {
    const actor = await requireActor('/pedigree/receipts/' + receiptId);
    const file = form.get('receipt');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'فایلی انتخاب نشده است.', tone: 'error' };
    }
    await attachReceiptFile(db(), env().PRIVATE_STORAGE_DIR, actor, receiptId, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
    });
    revalidatePath('/pedigree/receipts/' + receiptId);
    return { ok: true, message: 'تصویر فیش بارگذاری شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}

export async function submitReceiptAction(
  _previous: PedigreeFormState,
  form: FormData,
): Promise<PedigreeFormState> {
  const receiptId = text(form, 'receiptId');
  try {
    const actor = await requireActor('/pedigree/receipts/' + receiptId);
    await submitReceipt(db(), actor, receiptId, text(form, 'note') || null);
    revalidatePath('/pedigree/receipts/' + receiptId);
    return { ok: true, message: 'فیش برای بررسی مرکز ژنتیک ارسال شد.', tone: 'success' };
  } catch (error) {
    return failure(error);
  }
}
