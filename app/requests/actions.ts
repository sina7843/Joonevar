'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { createVisitRequests, renewReferral } from '../../src/vets/visits.ts';
import { AppError } from '../../src/domain/errors.ts';
import type { VisitContextName } from '../../src/domain/referral.ts';
import { parseSelection } from './selection.ts';

export interface FormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
}

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): FormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

/**
 * Creates one request and one code per animal (§11.2).
 *
 * On success the person lands on the group they just created, where every
 * animal shows its own code and its own deadline.
 */
export async function createVisitAction(_previous: FormState, form: FormData): Promise<FormState> {
  let destination: string;
  try {
    const actor = await requireActor('/requests/new');
    const context = text(form, 'context') as VisitContextName;
    const items = parseSelection(text(form, 'sel'), context);
    if (items.length === 0) return { ok: false, message: 'انتخاب حیوان معتبر نیست.', tone: 'error' };

    const created = await createVisitRequests(db(), actor, {
      context,
      vetAccountId: text(form, 'vet'),
      locationId: text(form, 'loc'),
      items,
    });
    revalidatePath('/requests');
    destination = '/requests?batch=' + created.batchId;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** A new code after the deadline passed, with eligibility checked again (§11.4). */
export async function renewReferralAction(_previous: FormState, form: FormData): Promise<FormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/requests/' + requestId);
    await renewReferral(db(), actor, requestId);
    revalidatePath('/requests/' + requestId);
  } catch (error) {
    return failure(error);
  }
  // The form that carried this message disappears with the expired state, so
  // the confirmation is put on the case itself rather than inside the form.
  redirect('/requests/' + requestId + '?renewed=1');
}
