'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { checkIn, correctService } from '../../src/vets/visits.ts';
import { AppError } from '../../src/domain/errors.ts';
import type { VisitServiceTypeName } from '../../src/domain/referral.ts';

export interface VetFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
  /** Where to continue after a successful check-in or correction. */
  readonly requestId?: string;
}

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): VetFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

/**
 * Check-in from a scan or from typed characters — the same code either way.
 *
 * A refusal returns the neutral reason and nothing else: no animal, no owner
 * and no hint about which desk the code does belong to (§11.3).
 */
export async function checkInAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  try {
    const actor = await requireActor('/vet/check-in');
    const outcome = await checkIn(db(), actor, {
      code: text(form, 'code'),
      locationId: text(form, 'locationId'),
    });
    revalidatePath('/vet');
    if (!outcome.ok) return { ok: false, message: outcome.messageFa, tone: 'error' };
    return {
      ok: true,
      tone: 'success',
      message: 'کد پذیرفته شد. نمونه‌گیری خون برای این خدمت اجباری است.',
      requestId: outcome.request.id,
    };
  } catch (error) {
    return failure(error);
  }
}

/** In-place service correction for one animal only (§11.4). */
export async function correctServiceAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    const result = await correctService(
      db(),
      actor,
      requestId,
      text(form, 'serviceType') as VisitServiceTypeName,
      text(form, 'reason'),
    );
    revalidatePath('/vet');
    revalidatePath('/vet/requests/' + requestId);
    return {
      ok: true,
      tone: 'success',
      message: 'درخواست قبلی جایگزین شد و کد مراجعه جدید صادر شد؛ برای ادامه باید دوباره پذیرش شود.',
      requestId: result.request.id,
    };
  } catch (error) {
    return failure(error);
  }
}
