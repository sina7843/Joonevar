'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentPaymentGateway, currentPaymentProvider } from '../../src/adapters/current.ts';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { applyForMembership, reviseMembershipApplication, startMembershipPeriodPayment } from '../../src/billing/membership.ts';
import { cancelAttempt, latestAttempt, startAttempt } from '../../src/billing/payments.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface CheckoutState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'error';
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function member() {
  const guard = await guardRoute('/membership');
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): CheckoutState {
  if (error instanceof AppError) return { message: error.message, tone: 'error' };
  throw error;
}

/** Applying is free and decides nothing: the association reviews it (Phase 2.5 §6). */
export async function applyForMembershipAction(_previous: CheckoutState, form: FormData): Promise<CheckoutState> {
  try {
    await applyForMembership(db(), await member(), { statementFa: text(form, 'statementFa') });
    revalidatePath('/membership');
    revalidatePath('/dashboard');
    return { ok: true, message: 'درخواست عضویت ثبت شد و در انتظار بررسی انجمن است.' };
  } catch (error) {
    return failure(error);
  }
}

/** Answer a correction the association asked for. */
export async function reviseMembershipApplicationAction(_previous: CheckoutState, form: FormData): Promise<CheckoutState> {
  try {
    await reviseMembershipApplication(db(), await member(), {
      applicationId: text(form, 'applicationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      statementFa: text(form, 'statementFa'),
    });
    revalidatePath('/membership');
    return { ok: true, message: 'پاسخ اصلاح ثبت شد و دوباره در صف بررسی است.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Start the payment of one membership period.
 *
 * The amount comes from settings inside the service and is frozen on the period,
 * so nothing the browser sends can change what is charged.
 */
export async function payMembershipAction(_previous: CheckoutState): Promise<CheckoutState> {
  let destination: string;
  try {
    const actor = await member();
    const started = await startMembershipPeriodPayment(db(), actor);
    const attempt = await startAttempt(
      db(),
      actor,
      { batchId: started.batch.id, callbackUrl: '/membership/return' },
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
export async function cancelMembershipPaymentAction(): Promise<void> {
  const actor = await member();
  const { findMembership } = await import('../../src/billing/membership.ts');
  const membership = await findMembership(db(), actor.accountId);
  if (membership?.paymentBatchId) {
    const attempt = await latestAttempt(db(), membership.paymentBatchId);
    if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
  }
  redirect('/membership');
}
