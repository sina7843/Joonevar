'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { addIssuer, setIssuerActive } from '../../../src/animals/foreign-pedigree.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface IssuerState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'success' | 'error';
}

async function operator() {
  const guard = await guardRoute('/assoc/issuers');
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

/** Adds one real issuer. Nothing is pre-filled; the association enters the names. */
export async function addIssuerAction(_previous: IssuerState, form: FormData): Promise<IssuerState> {
  try {
    await addIssuer(db(), await operator(), {
      name: String(form.get('name') ?? ''),
      country: String(form.get('country') ?? ''),
      noteFa: String(form.get('noteFa') ?? ''),
    });
    revalidatePath('/assoc/issuers');
    return { ok: true, message: 'صادرکننده به فهرست موردتأیید اضافه شد.', tone: 'success' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
    throw error;
  }
}

export async function setIssuerActiveAction(_previous: IssuerState, form: FormData): Promise<IssuerState> {
  try {
    await setIssuerActive(db(), await operator(), {
      issuerId: String(form.get('issuerId') ?? ''),
      isActive: String(form.get('isActive') ?? '') === 'true',
      reasonFa: String(form.get('reasonFa') ?? ''),
    });
    revalidatePath('/assoc/issuers');
    return { ok: true, message: 'وضعیت صادرکننده به‌روزرسانی شد.', tone: 'success' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
    throw error;
  }
}
