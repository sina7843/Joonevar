'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { decideMembershipApplication, issueMembershipNumber, setMembershipStanding } from '../../../src/billing/membership.ts';
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

function refresh(): void {
  revalidatePath('/assoc/members');
  revalidatePath('/assoc');
  revalidatePath('/membership');
}

/** §7: issuing the number is a record-keeping step, never a gate on the service. */
export async function issueNumberAction(_previous: MemberFormState, form: FormData): Promise<MemberFormState> {
  try {
    await issueMembershipNumber(db(), await operator(), {
      accountId: text(form, 'accountId'),
      membershipNo: text(form, 'membershipNo'),
    });
    refresh();
    return { ok: true, message: 'شماره عضویت ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Decide one membership application, always with a written reason the member
 * reads. An approval opens the payment of a period and nothing more.
 */
export async function decideMembershipAction(_previous: MemberFormState, form: FormData): Promise<MemberFormState> {
  const decision = text(form, 'decision');
  try {
    await decideMembershipApplication(db(), await operator(), {
      applicationId: text(form, 'applicationId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      decision,
      reasonFa: text(form, 'reasonFa'),
    });
    refresh();
    return {
      ok: true,
      message: decision === 'APPROVE' ? 'درخواست تأیید شد؛ پرداخت دوره برای متقاضی باز است.' : decision === 'REJECT' ? 'درخواست رد شد.' : 'درخواست اصلاح ثبت شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

/** Suspend, revoke or lift a suspension — never a way to grant an unpaid period. */
export async function setMembershipStandingAction(_previous: MemberFormState, form: FormData): Promise<MemberFormState> {
  const action = text(form, 'action') as 'SUSPEND' | 'REVOKE' | 'REINSTATE';
  try {
    await setMembershipStanding(db(), await operator(), {
      accountId: text(form, 'accountId'),
      action,
      reasonFa: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: action === 'SUSPEND' ? 'عضویت معلق شد.' : action === 'REVOKE' ? 'عضویت لغو شد.' : 'تعلیق برداشته شد.' };
  } catch (error) {
    return failure(error);
  }
}
