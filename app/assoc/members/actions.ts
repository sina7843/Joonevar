'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { issueMembershipNumber, setMembershipActive } from '../../../src/billing/membership.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface MemberFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function operator() {
  const guard = await guardRoute('/assoc/members');
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): MemberFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

/** §7: issuing the number is a record-keeping step, never a gate on the service. */
export async function issueNumberAction(
  _previous: MemberFormState,
  form: FormData,
): Promise<MemberFormState> {
  try {
    const actor = await operator();
    await issueMembershipNumber(db(), actor, {
      accountId: text(form, 'accountId'),
      membershipNo: text(form, 'membershipNo'),
    });
    revalidatePath('/assoc/members');
    return { ok: true, message: 'شماره عضویت ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** §7.1: deactivation and reactivation, each with its recorded reason. */
export async function setActiveAction(
  _previous: MemberFormState,
  form: FormData,
): Promise<MemberFormState> {
  const active = text(form, 'active') === 'YES';
  try {
    const actor = await operator();
    await setMembershipActive(db(), actor, {
      accountId: text(form, 'accountId'),
      active,
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/assoc/members');
    return { ok: true, message: active ? 'عضویت دوباره فعال شد.' : 'عضویت غیرفعال شد.' };
  } catch (error) {
    return failure(error);
  }
}
