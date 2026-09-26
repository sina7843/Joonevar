'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { currentPaymentGateway, currentPaymentProvider } from '../adapters/current.ts';
import { startAttempt } from '../billing/payments.ts';
import { setSpeciesEnabled } from '../marketplace/species.ts';
import { AppError } from '../domain/errors.ts';
import { publishPlan, withdrawPlan } from './plans.ts';
import { publishRule } from './rules.ts';
import { ACCOUNT_ROUTE, startFinderSubscription } from './subscriptions.ts';

export interface FinderFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const ADMIN_ROUTE = '/admin/mating-finder';

const field = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();
const optionalInt = (form: FormData, name: string): number | null => {
  const raw = field(form, name);
  return raw === '' ? null : Number(raw);
};
const optionalDate = (form: FormData, name: string): Date | null => {
  const raw = field(form, name);
  return raw === '' ? null : new Date(raw + 'T00:00:00Z');
};

function failure(error: unknown): FinderFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  revalidatePath(ACCOUNT_ROUTE, 'layout');
  revalidatePath(ADMIN_ROUTE, 'layout');
}

/**
 * Start a subscription checkout and go to the gateway. The form carries only
 * the plan version; the amount is frozen on the server from that version.
 */
export async function buyFinderPlanAction(_previous: FinderFormState, form: FormData): Promise<FinderFormState> {
  let destination: string;
  try {
    const guard = await guardRoute(ACCOUNT_ROUTE);
    if (!guard.ok) throw guard.denied;
    const started = await startFinderSubscription(db(), guard.actor, { planVersionId: field(form, 'planVersionId') });
    const attempt = await startAttempt(
      db(),
      guard.actor,
      { batchId: started.batch.id, callbackUrl: ACCOUNT_ROUTE + '/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = attempt.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function publishFinderPlanAction(_previous: FinderFormState, form: FormData): Promise<FinderFormState> {
  try {
    const guard = await guardRoute(ADMIN_ROUTE);
    if (!guard.ok) throw guard.denied;
    const row = await publishPlan(db(), guard.actor, {
      audience: field(form, 'audience'),
      durationMonths: Number(field(form, 'durationMonths')),
      titleFa: field(form, 'titleFa'),
      priceToman: field(form, 'priceToman') || null,
      activeAnimalCapacity: Number(field(form, 'activeAnimalCapacity')),
      purchasableFrom: optionalDate(form, 'purchasableFrom'),
      purchasableUntil: optionalDate(form, 'purchasableUntil'),
      suspensionPolicy: field(form, 'suspensionPolicy'),
      noteFa: field(form, 'noteFa') || null,
      reasonFa: field(form, 'reasonFa'),
      expectedCurrentVersion: Number(field(form, 'expectedCurrentVersion')),
    });
    refresh();
    return { ok: true, message: 'نسخه ' + row.version.toLocaleString('fa-IR') + ' منتشر شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function withdrawFinderPlanAction(_previous: FinderFormState, form: FormData): Promise<FinderFormState> {
  try {
    const guard = await guardRoute(ADMIN_ROUTE);
    if (!guard.ok) throw guard.denied;
    await withdrawPlan(db(), guard.actor, {
      planVersionId: field(form, 'planVersionId'),
      expectedVersion: Number(field(form, 'expectedVersion')),
      reasonFa: field(form, 'reasonFa'),
    });
    refresh();
    return { ok: true, message: 'فروش این طرح متوقف شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function publishFinderRuleAction(_previous: FinderFormState, form: FormData): Promise<FinderFormState> {
  try {
    const guard = await guardRoute(ADMIN_ROUTE);
    if (!guard.ok) throw guard.denied;
    const unit = field(form, 'cooldownUnit');
    const cooldown = optionalInt(form, 'cooldownValue');
    const row = await publishRule(db(), guard.actor, {
      speciesCode: field(form, 'speciesCode'),
      breedId: field(form, 'breedId') || null,
      sex: field(form, 'sex'),
      minAgeMonths: optionalInt(form, 'minAgeMonths'),
      maxAgeMonths: optionalInt(form, 'maxAgeMonths'),
      cooldownDays: unit === 'DAYS' ? cooldown : null,
      cooldownMonths: unit === 'MONTHS' ? cooldown : null,
      cooldownMode: field(form, 'cooldownMode'),
      kinshipMaxDegree: optionalInt(form, 'kinshipMaxDegree'),
      kinshipMode: field(form, 'kinshipMode'),
      warningFa: field(form, 'warningFa') || null,
      reasonFa: field(form, 'reasonFa'),
      expectedCurrentVersion: Number(field(form, 'expectedCurrentVersion')),
    });
    refresh();
    return { ok: true, message: 'قاعده نسخه ' + row.version.toLocaleString('fa-IR') + ' منتشر شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setFinderSpeciesAction(_previous: FinderFormState, form: FormData): Promise<FinderFormState> {
  try {
    const guard = await guardRoute(ADMIN_ROUTE);
    if (!guard.ok) throw guard.denied;
    await setSpeciesEnabled(db(), guard.actor, {
      market: 'MATING',
      speciesCode: field(form, 'speciesCode'),
      enabled: field(form, 'enabled') === 'true',
      reasonFa: field(form, 'reasonFa'),
      expectedVersion: Number(field(form, 'expectedVersion')),
    });
    refresh();
    return { ok: true, message: 'وضعیت گونه ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}
