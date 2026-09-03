'use server';

import { redirect } from 'next/navigation';
import { currentPaymentGateway, currentPaymentProvider } from '../../src/adapters/current.ts';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { cancelAttempt, latestAttempt, startAttempt } from '../../src/billing/payments.ts';
import {
  proposeAllocation,
  respondToAllocation,
  startCardPayment,
} from '../../src/mating/allocation.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface AllocationFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): AllocationFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

/**
 * §19.3: a proposal, with one named owner per puppy.
 *
 * The owner of each puppy arrives as `owner:<puppyId>`, so the form can never
 * post a puppy that is not on the page or an owner outside the two parties —
 * the service checks both again anyway.
 */
export async function proposeAllocationAction(
  _previous: AllocationFormState,
  form: FormData,
): Promise<AllocationFormState> {
  const litterId = text(form, 'litterId');
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor('/litters/' + litterId + '/allocation');
    const assignments = [...form.entries()]
      .filter(([key]) => key.startsWith('owner:'))
      .map(([key, value]) => ({
        puppyId: key.slice('owner:'.length),
        proposedOwnerAccountId: String(value),
      }));
    const allocation = await proposeAllocation(db(), actor, permitId, {
      assignments,
      noteFa: text(form, 'note'),
    });
    revalidatePath('/litters/' + litterId + '/allocation');
    return {
      ok: true,
      tone: 'success',
      message: 'نسخه ' + allocation.version + ' ثبت شد و برای تأیید هر دو طرف در انتظار است.',
    };
  } catch (error) {
    return failure(error);
  }
}

/** §19.3: one party's answer to one exact version. */
export async function respondAllocationAction(
  _previous: AllocationFormState,
  form: FormData,
): Promise<AllocationFormState> {
  const litterId = text(form, 'litterId');
  const approve = text(form, 'decision') === 'APPROVE';
  try {
    const actor = await requireActor('/litters/' + litterId + '/allocation');
    const row = await respondToAllocation(db(), actor, {
      allocationId: text(form, 'allocationId'),
      expectedVersion: Number(text(form, 'version')),
      approve,
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/litters/' + litterId + '/allocation');
    return {
      ok: true,
      tone: row.status === 'FINAL' ? 'success' : 'info',
      message:
        row.status === 'FINAL'
          ? 'هر دو طرف این نسخه را تأیید کردند؛ تخصیص نهایی شد.'
          : row.status === 'REJECTED'
            ? 'رد شما ثبت شد؛ نسخه اصلاح‌شده باید دوباره پیشنهاد شود.'
            : 'تأیید شما ثبت شد؛ تا تأیید طرف دیگر نهایی نمی‌شود.',
    };
  } catch (error) {
    return failure(error);
  }
}

/** §19.4, §22: one batch for the chosen puppies, paid before issuance. */
export async function payCardsAction(
  _previous: AllocationFormState,
  form: FormData,
): Promise<AllocationFormState> {
  const permitId = text(form, 'permitId');
  let destination: string;
  try {
    const actor = await requireActor('/puppy-cards/checkout');
    const puppyIds = form.getAll('puppy').map(String);
    const batch = await startCardPayment(db(), actor, permitId, puppyIds);
    const started = await startAttempt(
      db(),
      actor,
      { batchId: batch.id, callbackUrl: '/puppy-cards/return?permit=' + permitId },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = started.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** Cancelling keeps the case and the frozen amount for a retry (§26). */
export async function cancelCardPaymentAction(form: FormData): Promise<void> {
  const permitId = String(form.get('permitId') ?? '');
  const batchId = String(form.get('batchId') ?? '');
  await requireActor('/puppy-cards/checkout');
  const attempt = await latestAttempt(db(), batchId);
  if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
  redirect('/puppy-cards/checkout?permit=' + permitId);
}
