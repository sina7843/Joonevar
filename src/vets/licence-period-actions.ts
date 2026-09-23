'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { currentPaymentGateway, currentPaymentProvider } from '../adapters/current.ts';
import { cancelAttempt, latestAttempt, startAttempt } from '../billing/payments.ts';
import { AppError } from '../domain/errors.ts';
import { startLicencePayment } from './licence-period.ts';

const ROUTE = '/account/vet-profile';

export interface LicencePeriodState {
  readonly ok?: boolean;
  readonly message?: string;
}

/**
 * Start the payment for a licence period and go to the gateway.
 *
 * The amount is never read from the form: the service re-checks the approval and
 * the verified licence facts, then freezes the managed tariff on the period, so
 * nothing the browser sends can change what is charged (§22, PROMPT-008).
 */
export async function payLicencePeriodAction(_previous: LicencePeriodState): Promise<LicencePeriodState> {
  let destination: string;
  try {
    const guard = await guardRoute(ROUTE);
    if (!guard.ok) throw guard.denied;

    const started = await startLicencePayment(db(), guard.actor);
    const attempt = await startAttempt(
      db(),
      guard.actor,
      { batchId: started.batch.id, callbackUrl: ROUTE + '/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = attempt.redirectUrl;
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
  redirect(destination);
}

/** Cancelling keeps the period and its frozen amount so the payer can start again (§26). */
export async function cancelLicencePeriodPaymentAction(_previous: LicencePeriodState, form: FormData): Promise<LicencePeriodState> {
  try {
    const guard = await guardRoute(ROUTE);
    if (!guard.ok) throw guard.denied;
    const batchId = String(form.get('batchId') ?? '');
    const attempt = batchId ? await latestAttempt(db(), batchId) : null;
    if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
    revalidatePath(ROUTE, 'layout');
    return { ok: true, message: 'پرداخت لغو شد؛ مبلغ ثبت‌شده همان است و می‌توانید دوباره تلاش کنید.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
