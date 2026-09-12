'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { currentPaymentGateway, currentPaymentProvider } from '../adapters/current.ts';
import { startAttempt } from '../billing/payments.ts';
import { AppError } from '../domain/errors.ts';
import { cancelPackage, startPackagePurchase, updatePlan } from './service.ts';

export interface AdFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const ACCOUNT_ROUTE = '/account/packages';
const ADMIN_ROUTE = '/admin/packages';

const field = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();

function failure(error: unknown): AdFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  revalidatePath(ACCOUNT_ROUTE, 'layout');
  revalidatePath(ADMIN_ROUTE, 'layout');
}

/**
 * Start a purchase and go to the gateway.
 *
 * The amount is never read from this form: the service freezes it from the
 * managed price, so nothing the browser sends can change what is charged (§22).
 */
export async function buyPackageAction(_previous: AdFormState, form: FormData): Promise<AdFormState> {
  let destination: string;
  try {
    const guard = await guardRoute(ACCOUNT_ROUTE);
    if (!guard.ok) throw guard.denied;

    const intent = await startPackagePurchase(db(), guard.actor, {
      targetType: field(form, 'targetType'),
      targetId: field(form, 'targetId'),
      planId: field(form, 'planId'),
    });
    const started = await startAttempt(
      db(),
      guard.actor,
      { batchId: intent.batch.id, callbackUrl: ACCOUNT_ROUTE + '/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = started.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function cancelPackageAction(_previous: AdFormState, form: FormData): Promise<AdFormState> {
  try {
    const surface = field(form, 'surface') === 'admin' ? ADMIN_ROUTE : ACCOUNT_ROUTE;
    const guard = await guardRoute(surface);
    if (!guard.ok) throw guard.denied;

    await cancelPackage(db(), guard.actor, {
      subscriptionId: field(form, 'subscriptionId'),
      expectedVersion: Number(field(form, 'expectedVersion')),
      reason: field(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'بسته لغو شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Features, capacity and whether the plan is on sale. The price stays in settings. */
export async function updatePlanAction(_previous: AdFormState, form: FormData): Promise<AdFormState> {
  try {
    const guard = await guardRoute(ADMIN_ROUTE);
    if (!guard.ok) throw guard.denied;

    const capacity = field(form, 'slotCapacity');
    const row = await updatePlan(db(), guard.actor, {
      planId: field(form, 'planId'),
      expectedVersion: Number(field(form, 'expectedVersion')),
      featuresFa: field(form, 'featuresFa'),
      slotCapacity: capacity === '' ? null : Number(capacity),
      isActive: form.get('isActive') !== null,
      reason: field(form, 'reason'),
    });
    refresh();
    return { ok: true, message: row.isActive === 1 ? 'بسته ذخیره شد و ارائه می‌شود.' : 'بسته ذخیره شد و ارائه نمی‌شود.' };
  } catch (error) {
    return failure(error);
  }
}
