'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { smsSender } from '../../src/adapters/registry.ts';
import {
  addPersonalNote,
  cancelDeclaration,
  respondToDeclaration,
  startDeclaration,
} from '../../src/mating/declaration.ts';
import { AppError } from '../../src/domain/errors.ts';

export interface DeclarationFormState {
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

function failure(error: unknown): DeclarationFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

/**
 * §20: the invitation. The number must belong to the owner of the named animal,
 * and the message goes through the product's own SMS adapter, which writes to
 * the development outbox while no provider is configured.
 */
export async function startDeclarationAction(
  _previous: DeclarationFormState,
  form: FormData,
): Promise<DeclarationFormState> {
  let destination: string;
  try {
    const actor = await requireActor('/declaration/new');
    const declaration = await startDeclaration(
      db(),
      actor,
      {
        ownAnimalId: text(form, 'ownAnimalId'),
        counterpartyIdentifier: text(form, 'identifier'),
        counterpartyMobile: text(form, 'mobile'),
      },
      smsSender(db(), env()),
    );
    destination = '/declaration/' + declaration.id;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** The invited person answers for themselves; there is no signing OTP (§20). */
export async function respondDeclarationAction(
  _previous: DeclarationFormState,
  form: FormData,
): Promise<DeclarationFormState> {
  const declarationId = text(form, 'declarationId');
  const confirm = text(form, 'decision') === 'CONFIRM';
  try {
    const actor = await requireActor('/declaration/' + declarationId);
    await respondToDeclaration(db(), actor, declarationId, { confirm, reasonFa: text(form, 'reason') });
    revalidatePath('/declaration/' + declarationId);
    return {
      ok: true,
      tone: confirm ? 'success' : 'info',
      message: confirm ? 'وجود توافق تأیید شد.' : 'وجود توافق رد شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelDeclarationAction(
  _previous: DeclarationFormState,
  form: FormData,
): Promise<DeclarationFormState> {
  const declarationId = text(form, 'declarationId');
  try {
    const actor = await requireActor('/declaration/' + declarationId);
    await cancelDeclaration(db(), actor, declarationId);
    revalidatePath('/declaration/' + declarationId);
    return { ok: true, tone: 'info', message: 'دعوت لغو شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** §17.3: a personal note, which stays UNVERIFIED and outside the official flow. */
export async function addNoteAction(
  _previous: DeclarationFormState,
  form: FormData,
): Promise<DeclarationFormState> {
  const declarationId = text(form, 'declarationId');
  try {
    const actor = await requireActor('/declaration/' + declarationId);
    await addPersonalNote(db(), actor, declarationId, {
      kind: text(form, 'kind') as 'MATING_DATE' | 'PREGNANCY' | 'BIRTH',
      noteDate: text(form, 'noteDate'),
      noteFa: text(form, 'note'),
    });
    revalidatePath('/declaration/' + declarationId);
    return { ok: true, tone: 'success', message: 'یادداشت شخصی (UNVERIFIED) ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}
