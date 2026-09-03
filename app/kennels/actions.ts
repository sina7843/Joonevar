'use server';

import { redirect } from 'next/navigation';
import { currentPaymentGateway, currentPaymentProvider } from '../../src/adapters/current.ts';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { cancelAttempt, latestAttempt, startAttempt } from '../../src/billing/payments.ts';
import {
  addBreed,
  removeBreed,
  saveKennel,
  startKennel,
  startKennelPayment,
  submitKennel,
} from '../../src/kennels/service.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface KennelFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): KennelFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');
const optional = (form: FormData, key: string): string | null => text(form, key).trim() || null;
const number = (form: FormData, key: string): number | null => {
  const raw = text(form, key).trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/** The «شروع ثبت کنل» entry: opens the file or resumes the one already open. */
export async function startKennelAction(): Promise<void> {
  let destination: string;
  try {
    const actor = await requireActor('/kennels');
    const kennel = await startKennel(db(), actor);
    destination = '/kennels/' + kennel.id;
  } catch (error) {
    if (error instanceof AppError) redirect('/kennels?error=' + encodeURIComponent(error.message));
    throw error;
  }
  redirect(destination);
}

export async function saveKennelAction(
  _previous: KennelFormState,
  form: FormData,
): Promise<KennelFormState> {
  const kennelId = text(form, 'kennelId');
  try {
    const actor = await requireActor('/kennels/' + kennelId);
    await saveKennel(db(), actor, kennelId, {
      nameFa: optional(form, 'nameFa'),
      nameEn: optional(form, 'nameEn'),
      phone: optional(form, 'phone'),
      provinceFa: optional(form, 'province'),
      cityFa: optional(form, 'city'),
      addressFa: optional(form, 'address'),
      latitude: number(form, 'latitude'),
      longitude: number(form, 'longitude'),
      noteFa: optional(form, 'note'),
    });
    revalidatePath('/kennels/' + kennelId);
    return { ok: true, tone: 'success', message: 'اطلاعات کنل ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addBreedAction(
  _previous: KennelFormState,
  form: FormData,
): Promise<KennelFormState> {
  const kennelId = text(form, 'kennelId');
  try {
    const actor = await requireActor('/kennels/' + kennelId);
    await addBreed(db(), actor, kennelId, text(form, 'breedId'));
    revalidatePath('/kennels/' + kennelId);
    return { ok: true, tone: 'success', message: 'نژاد به فهرست کنل اضافه شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Removing a breed is an ordinary edit: no payment and no second review. */
export async function removeBreedAction(
  _previous: KennelFormState,
  form: FormData,
): Promise<KennelFormState> {
  const kennelId = text(form, 'kennelId');
  try {
    const actor = await requireActor('/kennels/' + kennelId);
    await removeBreed(db(), actor, kennelId, text(form, 'breedId'));
    revalidatePath('/kennels/' + kennelId);
    return { ok: true, tone: 'info', message: 'نژاد از فهرست کنل حذف شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function payKennelAction(
  _previous: KennelFormState,
  form: FormData,
): Promise<KennelFormState> {
  const kennelId = text(form, 'kennelId');
  let destination: string;
  try {
    const actor = await requireActor('/kennels/' + kennelId);
    const batch = await startKennelPayment(db(), actor, kennelId);
    const started = await startAttempt(
      db(),
      actor,
      { batchId: batch.id, callbackUrl: '/kennels/' + kennelId + '/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = started.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** Cancelling keeps the kennel draft and the frozen amount for a retry (§26). */
export async function cancelKennelPaymentAction(form: FormData): Promise<void> {
  const kennelId = String(form.get('kennelId') ?? '');
  const batchId = String(form.get('batchId') ?? '');
  await requireActor('/kennels/' + kennelId);
  const attempt = await latestAttempt(db(), batchId);
  if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
  redirect('/kennels/' + kennelId);
}

export async function submitKennelAction(
  _previous: KennelFormState,
  form: FormData,
): Promise<KennelFormState> {
  const kennelId = text(form, 'kennelId');
  try {
    const actor = await requireActor('/kennels/' + kennelId);
    await submitKennel(db(), actor, kennelId);
    revalidatePath('/kennels/' + kennelId);
    return { ok: true, tone: 'success', message: 'پرونده کنل برای بررسی انجمن ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}
