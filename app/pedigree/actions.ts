'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { attachReceiptFile, createReceipt, submitReceipt } from '../../src/genetics/service.ts';
import { createIssuanceRequest, retryIssuance } from '../../src/documents/pedigree.ts';
import { submitAppeal } from '../../src/genetics/appeals.ts';
import { createPostalRequest } from '../../src/documents/postal.ts';
import { paymentGateway, paymentProviderName } from '../../src/adapters/registry.ts';
import { startAttempt } from '../../src/billing/payments.ts';
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

// ── Issuance, appeals and postal (§14.1 step 8, §14.5, §14.6) ─────────────

/** Starts the issuance checkout for animals whose result is already final. */
export async function createIssuanceAction(
  _previous: PedigreeFormState,
  form: FormData,
): Promise<PedigreeFormState> {
  let destination: string;
  try {
    const actor = await requireActor('/pedigree/issue');
    const created = await createIssuanceRequest(
      db(),
      actor,
      form.getAll('animalId').map(String).filter(Boolean),
    );
    revalidatePath('/pedigree');
    destination = '/pedigree/batch/' + created.batch.id;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function payIssuanceAction(
  _previous: PedigreeFormState,
  form: FormData,
): Promise<PedigreeFormState> {
  const batchId = text(form, 'batchId');
  let destination: string;
  try {
    const actor = await requireActor('/pedigree/batch/' + batchId);
    const started = await startAttempt(
      db(),
      actor,
      { batchId, callbackUrl: '/pedigree/batch/' + batchId + '/return' },
      paymentGateway(db(), env()),
      paymentProviderName(env()),
    );
    destination = started.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** A blocked item is retried once its result is final. No money moves. */
export async function retryPedigreeIssuanceAction(
  _previous: PedigreeFormState,
  form: FormData,
): Promise<PedigreeFormState> {
  const batchId = text(form, 'batchId');
  try {
    const actor = await requireActor('/pedigree/batch/' + batchId);
    await retryIssuance(db(), actor, batchId);
    revalidatePath('/pedigree/batch/' + batchId);
    return { ok: true, tone: 'info', message: 'صدور دوباره بررسی شد؛ وضعیت هر حیوان در همین صفحه به‌روز است.' };
  } catch (error) {
    return failure(error);
  }
}

export async function submitAppealAction(
  _previous: PedigreeFormState,
  form: FormData,
): Promise<PedigreeFormState> {
  const animalId = text(form, 'animalId');
  try {
    const actor = await requireActor('/pedigree/' + animalId);
    await submitAppeal(db(), actor, { resultId: text(form, 'resultId'), messageFa: text(form, 'message') });
    revalidatePath('/pedigree/' + animalId);
    return { ok: true, tone: 'success', message: 'اعتراض شما ثبت و به همان مرکز ژنتیک ارجاع شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Captures a postal request for a document that has really been issued. */
export async function createPostalRequestAction(
  _previous: PedigreeFormState,
  form: FormData,
): Promise<PedigreeFormState> {
  let destination: string;
  try {
    const actor = await requireActor('/documents/postal/new');
    const created = await createPostalRequest(db(), actor, {
      documentType: text(form, 'documentType') as 'REGISTRATION_SHEET' | 'PEDIGREE',
      documentId: text(form, 'documentId'),
      recipientNameFa: text(form, 'recipientName'),
      recipientPhone: text(form, 'recipientPhone'),
      provinceFa: text(form, 'province') || null,
      cityFa: text(form, 'city') || null,
      addressFa: text(form, 'address'),
      postalCode: text(form, 'postalCode') || null,
      noteFa: text(form, 'note') || null,
    });
    destination = '/documents/postal/' + created.id;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}
