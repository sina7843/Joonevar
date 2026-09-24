'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { currentPaymentGateway, currentPaymentProvider } from '../adapters/current.ts';
import { cancelAttempt, latestAttempt, startAttempt } from '../billing/payments.ts';
import { AppError } from '../domain/errors.ts';
import { startTrustedPayment, suspendTrustedStanding } from './trusted-period.ts';

const ROUTE = '/account/vet-profile';

export interface TrustedPeriodState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): TrustedPeriodState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

/**
 * Start the payment of a trusted period and go to the gateway.
 *
 * The service re-checks the licence, the membership, the approval and the
 * declaration before it freezes the managed tariff, so nothing the browser sends
 * decides what is charged or who qualifies.
 */
export async function payTrustedPeriodAction(_previous: TrustedPeriodState): Promise<TrustedPeriodState> {
  let destination: string;
  try {
    const actor = await actorAt(ROUTE);
    const started = await startTrustedPayment(db(), actor);
    const attempt = await startAttempt(
      db(),
      actor,
      { batchId: started.batch.id, callbackUrl: ROUTE + '/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = attempt.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** Cancelling keeps the period and its frozen amount so the payer can retry (§26). */
export async function cancelTrustedPeriodPaymentAction(_previous: TrustedPeriodState, form: FormData): Promise<TrustedPeriodState> {
  try {
    await actorAt(ROUTE);
    const batchId = text(form, 'batchId');
    const attempt = batchId ? await latestAttempt(db(), batchId) : null;
    if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
    revalidatePath(ROUTE, 'layout');
    return { ok: true, message: 'پرداخت لغو شد؛ مبلغ ثبت‌شده همان است و می‌توانید دوباره تلاش کنید.' };
  } catch (error) {
    return failure(error);
  }
}

/** The association takes the trusted capability away, with a reason the doctor reads. */
export async function suspendTrustedAction(_previous: TrustedPeriodState, form: FormData): Promise<TrustedPeriodState> {
  try {
    const actor = await actorAt('/assoc/vet-trusted');
    await suspendTrustedStanding(db(), actor, { accountId: text(form, 'accountId'), reasonFa: text(form, 'reasonFa') });
    revalidatePath('/assoc', 'layout');
    revalidatePath(ROUTE, 'layout');
    return { ok: true, message: 'دسترسی معتمد معلق شد؛ Tag به وضعیت پروانه برگشت.' };
  } catch (error) {
    return failure(error);
  }
}
