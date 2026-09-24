'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { decideTrustedCase, reviseTrustedApplication, submitTrustedApplication } from './trusted-application.ts';

export interface TrustedState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorAt(path: string) {
  const guard = await guardRoute(path);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): TrustedState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  revalidatePath('/account/vet-profile', 'layout');
  revalidatePath('/assoc', 'layout');
  revalidatePath('/dashboard');
}

const declarationOf = (form: FormData) => ({
  acceptedTermsVersion: text(form, 'acceptedTermsVersion'),
  microchipReaderDeclared: form.get('microchipReaderDeclared') === 'YES',
  equipmentCodes: form.getAll('equipmentCodes').map(String),
  statementFa: text(form, 'statementFa'),
});

/** Applying declares; it proves nothing and pays nothing (§7). */
export async function submitTrustedApplicationAction(_previous: TrustedState, form: FormData): Promise<TrustedState> {
  try {
    await submitTrustedApplication(db(), await actorAt('/account/vet-profile'), declarationOf(form));
    refresh();
    return { ok: true, message: 'درخواست دامپزشک معتمد ثبت شد و در انتظار بررسی انجمن است.' };
  } catch (error) {
    return failure(error);
  }
}

export async function reviseTrustedApplicationAction(_previous: TrustedState, form: FormData): Promise<TrustedState> {
  try {
    await reviseTrustedApplication(db(), await actorAt('/account/vet-profile'), {
      ...declarationOf(form),
      caseId: text(form, 'caseId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
    });
    refresh();
    return { ok: true, message: 'نسخه تازه درخواست ثبت شد؛ نسخه‌های قبلی همان‌طور نگهداری می‌شوند.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideTrustedCaseAction(_previous: TrustedState, form: FormData): Promise<TrustedState> {
  const decision = text(form, 'decision');
  try {
    await decideTrustedCase(db(), await actorAt('/assoc/vet-trusted'), {
      caseId: text(form, 'caseId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      decision,
      reasonFa: text(form, 'reasonFa'),
    });
    refresh();
    return {
      ok: true,
      message: decision === 'APPROVE' ? 'درخواست تأیید شد؛ پرداخت دوره معتمد باز است.' : decision === 'REJECT' ? 'درخواست رد شد.' : 'درخواست اصلاح ثبت شد.',
    };
  } catch (error) {
    return failure(error);
  }
}
