'use server';

import { redirect } from 'next/navigation';
import { currentPaymentGateway, currentPaymentProvider } from '../../src/adapters/current.ts';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { cancelAttempt, latestAttempt, startAttempt } from '../../src/billing/payments.ts';
import {
  confirmCounterparty,
  maskedName,
  resolveByPedigreeCode,
  saveAllocationRule,
  startPermit,
  startPermitPayment,
  submitPermit,
} from '../../src/mating/permits.ts';
import { profiles } from '../../src/db/schema/identity.ts';
import { eq } from 'drizzle-orm';
import type { AllocationRuleType } from '../../src/domain/allocation.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface PermitFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
  /** Filled by the resolve step so the invitation is confirmed knowingly. */
  readonly resolved?: {
    readonly animalName: string;
    readonly ownerName: string;
    readonly sexFa: string;
    readonly pedigreeCode: string;
  };
}


async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): PermitFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');
const int = (form: FormData, key: string): number | null => {
  const raw = text(form, key).trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
};

/**
 * §16 step 3 — resolve before inviting.
 *
 * The person sees which animal and which owner the code belongs to before a
 * case is opened for them; the family name stays shortened (§23.3).
 */
export async function resolvePartyAction(
  _previous: PermitFormState,
  form: FormData,
): Promise<PermitFormState> {
  try {
    await requireActor('/mating/permits/new');
    const party = await resolveByPedigreeCode(db(), text(form, 'pedigreeCode'));
    const [profile] = await db()
      .select({ firstName: profiles.firstName, lastName: profiles.lastName })
      .from(profiles)
      .where(eq(profiles.accountId, party.ownerAccountId))
      .limit(1);
    return {
      ok: true,
      tone: 'info',
      message: 'حیوان و مالک طرف مقابل شناسایی شد.',
      resolved: {
        animalName: party.animalName ?? 'بدون نام',
        ownerName: profile ? maskedName(profile.firstName, profile.lastName) : '—',
        sexFa: party.sex === 'MALE' ? 'نر' : party.sex === 'FEMALE' ? 'ماده' : '—',
        pedigreeCode: party.pedigreeCode,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

/** §16 step 4 — opens the case and sends the invitation to the resolved owner. */
export async function startPermitAction(
  _previous: PermitFormState,
  form: FormData,
): Promise<PermitFormState> {
  let destination: string;
  try {
    const actor = await requireActor('/mating/permits/new');
    const permit = await startPermit(db(), actor, {
      ownAnimalId: text(form, 'ownAnimalId'),
      counterpartyPedigreeCode: text(form, 'pedigreeCode'),
    });
    destination = '/mating/permits/' + permit.id;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** The counterparty answers for themselves, inside their own session (§16). */
export async function confirmPartyAction(
  _previous: PermitFormState,
  form: FormData,
): Promise<PermitFormState> {
  const permitId = text(form, 'permitId');
  const accept = text(form, 'decision') === 'ACCEPT';
  try {
    const actor = await requireActor('/mating/permits/' + permitId);
    await confirmCounterparty(db(), actor, permitId, accept, text(form, 'reason'));
    revalidatePath('/mating/permits/' + permitId);
    return {
      ok: true,
      tone: accept ? 'success' : 'info',
      message: accept ? 'تأیید شما ثبت شد.' : 'دعوت رد شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function saveRuleAction(
  _previous: PermitFormState,
  form: FormData,
): Promise<PermitFormState> {
  const permitId = text(form, 'permitId');
  const type = text(form, 'ruleType') as AllocationRuleType;
  try {
    const actor = await requireActor('/mating/permits/' + permitId);
    await saveAllocationRule(db(), actor, permitId, {
      type,
      shares: [
        { side: 'SIRE_SIDE', fixedCount: int(form, 'sireFixed'), percent: int(form, 'sirePercent') },
        { side: 'DAM_SIDE', fixedCount: int(form, 'damFixed'), percent: int(form, 'damPercent') },
      ],
      noteFa: text(form, 'ruleNote'),
    });
    revalidatePath('/mating/permits/' + permitId);
    return { ok: true, tone: 'success', message: 'توافق تقسیم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** §16 step 7 — the permit fee is paid in Hamzist, before the final submit. */
export async function payPermitAction(
  _previous: PermitFormState,
  form: FormData,
): Promise<PermitFormState> {
  const permitId = text(form, 'permitId');
  let destination: string;
  try {
    const actor = await requireActor('/mating/permits/' + permitId);
    const batch = await startPermitPayment(db(), actor, permitId);
    const started = await startAttempt(
      db(),
      actor,
      { batchId: batch.id, callbackUrl: '/mating/permits/' + permitId + '/return' },
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
export async function cancelPermitPaymentAction(form: FormData): Promise<void> {
  const permitId = String(form.get('permitId') ?? '');
  const batchId = String(form.get('batchId') ?? '');
  await requireActor('/mating/permits/' + permitId);
  const attempt = await latestAttempt(db(), batchId);
  if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
  redirect('/mating/permits/' + permitId);
}

export async function submitPermitAction(
  _previous: PermitFormState,
  form: FormData,
): Promise<PermitFormState> {
  const permitId = text(form, 'permitId');
  try {
    const actor = await requireActor('/mating/permits/' + permitId);
    await submitPermit(db(), actor, permitId);
    revalidatePath('/mating/permits/' + permitId);
    return { ok: true, tone: 'success', message: 'پرونده برای بررسی عملیاتی ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

