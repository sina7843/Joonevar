'use server';

import { redirect } from 'next/navigation';
import { currentPaymentGateway, currentPaymentProvider } from '../../src/adapters/current.ts';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { cancelAttempt, latestAttempt, startAttempt } from '../../src/billing/payments.ts';
import { createSheetRequest, retryIssuance } from '../../src/documents/registration-sheet.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface SheetFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): SheetFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

/** Builds the batch. Prices are read inside the service, never sent by the form. */
export async function createSheetRequestAction(
  _previous: SheetFormState,
  form: FormData,
): Promise<SheetFormState> {
  let destination: string;
  try {
    const actor = await requireActor('/registration/new');
    const animalIds = form.getAll('animalId').map(String).filter(Boolean);
    const created = await createSheetRequest(db(), actor, animalIds);
    revalidatePath('/registration');
    destination = '/registration/' + created.batch.id;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** Sends the payer to the gateway; the amount comes from the frozen items. */
export async function paySheetBatchAction(
  _previous: SheetFormState,
  form: FormData,
): Promise<SheetFormState> {
  const batchId = String(form.get('batchId') ?? '');
  let destination: string;
  try {
    const actor = await requireActor('/registration/' + batchId);
    const started = await startAttempt(
      db(),
      actor,
      { batchId, callbackUrl: '/registration/' + batchId + '/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = started.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** Cancelling keeps the batch, its items and their frozen amounts (§26). */
export async function cancelSheetPaymentAction(form: FormData): Promise<void> {
  const batchId = String(form.get('batchId') ?? '');
  await requireActor('/registration/' + batchId);
  const attempt = await latestAttempt(db(), batchId);
  if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
  redirect('/registration/' + batchId);
}

/**
 * Tries a blocked item again after its prerequisite exists. No money moves:
 * the paid snapshot is untouched and no refund or extra charge is invented.
 */
export async function retryIssuanceAction(
  _previous: SheetFormState,
  form: FormData,
): Promise<SheetFormState> {
  const batchId = String(form.get('batchId') ?? '');
  try {
    const actor = await requireActor('/registration/' + batchId);
    await retryIssuance(db(), actor, batchId);
    revalidatePath('/registration/' + batchId);
    return { ok: true, tone: 'info', message: 'صدور دوباره بررسی شد؛ وضعیت هر حیوان در همین صفحه به‌روز است.' };
  } catch (error) {
    return failure(error);
  }
}
