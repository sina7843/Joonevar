'use client';

import { useActionState, useState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { issueNumberAction, setActiveAction, type MemberFormState } from './actions.ts';

const EMPTY: MemberFormState = {};

function Result({ state }: { state: MemberFormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />;
}

/** §7: the membership number, recorded after the fact and never a gate. */
export function IssueNumberForm({ accountId, suffix }: { accountId: string; suffix: string }) {
  const [state, submit, pending] = useActionState(issueNumberAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'issue-number-form-' + suffix}>
      <input type="hidden" name="accountId" value={accountId} />
      <Result state={state} />
      <TextField label="شماره عضویت" name="membershipNo" ltr required data-testid={'membership-no-' + suffix} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'issue-number-' + suffix}>
        {pending ? 'در حال ثبت…' : 'ثبت شماره عضویت'}
      </Button>
    </form>
  );
}

/** §7.1: deactivating or reactivating one membership, with its reason. */
export function MembershipStateForm({
  accountId,
  active,
  suffix,
}: {
  accountId: string;
  active: boolean;
  suffix: string;
}) {
  const [state, submit, pending] = useActionState(setActiveAction, EMPTY);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        tone="ghost"
        onClick={() => setOpen(true)}
        data-testid={'toggle-membership-' + suffix}
      >
        {active ? 'غیرفعال‌کردن عضویت' : 'فعال‌سازی دوباره عضویت'}
      </Button>
    );
  }
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'membership-state-form-' + suffix}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="active" value={active ? 'NO' : 'YES'} />
      <Result state={state} />
      <TextField label="دلیل" name="reason" required data-testid={'membership-reason-' + suffix} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'submit-membership-' + suffix}>
        {pending ? 'در حال ثبت…' : active ? 'ثبت غیرفعال‌سازی' : 'ثبت فعال‌سازی'}
      </Button>
    </form>
  );
}
