'use server';

import { redirect } from 'next/navigation';
import { currentPaymentGateway, currentPaymentProvider } from '../../src/adapters/current.ts';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { startMembershipPayment } from '../../src/billing/membership.ts';
import { cancelAttempt, latestAttempt, startAttempt } from '../../src/billing/payments.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface CheckoutState {
  readonly message?: string;
  readonly tone?: 'error';
}

/**
 * Start the membership payment.
 *
 * The amount comes from settings inside the service, never from this form, so
 * nothing the browser sends can change what is charged.
 */
export async function payMembershipAction(_previous: CheckoutState): Promise<CheckoutState> {
  let destination: string;
  try {
    const guard = await guardRoute('/membership');
    if (!guard.ok) throw guard.denied;

    const batch = await startMembershipPayment(db(), guard.actor);
    const started = await startAttempt(
      db(),
      guard.actor,
      { batchId: batch.id, callbackUrl: '/membership/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = started.redirectUrl;
  } catch (error) {
    if (error instanceof AppError) return { message: error.message, tone: 'error' };
    throw error;
  }
  redirect(destination);
}

/** Cancelling keeps the batch and its frozen amount so the payer can retry (§26). */
export async function cancelMembershipPaymentAction(): Promise<void> {
  const guard = await guardRoute('/membership');
  if (!guard.ok) throw guard.denied;

  const { findMembership } = await import('../../src/billing/membership.ts');
  const membership = await findMembership(db(), guard.actor.accountId);
  if (membership?.paymentBatchId) {
    const attempt = await latestAttempt(db(), membership.paymentBatchId);
    if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
  }
  redirect('/membership');
}
