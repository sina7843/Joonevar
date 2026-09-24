'use client';

import { useActionState, useState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { TextAreaField, TextField } from '../../../src/ui/field.tsx';
import { MEMBERSHIP_DECISIONS, MEMBERSHIP_DECISION_FA, type MembershipDecision } from '../../../src/billing/membership-model.ts';
import { decideMembershipAction, issueNumberAction, setMembershipStandingAction, type MemberFormState } from './actions.ts';

const EMPTY: MemberFormState = {};

function Result({ state, testId }: { state: MemberFormState; testId?: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
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

/** One membership application: approve, ask for a correction, or reject — with a reason. */
export function DecideMembershipForm({ applicationId, version }: { applicationId: string; version: number }) {
  const [state, submit, pending] = useActionState(decideMembershipAction, EMPTY);
  const [decision, setDecision] = useState<MembershipDecision>('APPROVE');
  return (
    <form action={submit} className="mt-md space-y-md" data-testid="membership-decision-form">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <fieldset className="space-y-sm">
        <legend className="text-label-md">نتیجه بررسی</legend>
        {MEMBERSHIP_DECISIONS.map((value) => (
          <label key={value} className="flex items-center gap-sm text-body-sm">
            <input
              type="radio"
              name="decision"
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
              className="size-[var(--size-selection-md)]"
              data-testid={'membership-decision-' + value}
            />
            {MEMBERSHIP_DECISION_FA[value]}
          </label>
        ))}
      </fieldset>
      <TextAreaField label="دلیل" name="reasonFa" required rows={3} maxLength={1000} hint="برای متقاضی نمایش داده می‌شود." data-testid="membership-decision-reason" />
      <Result state={state} testId="membership-decision-result" />
      <Button type="submit" disabled={pending} data-testid="submit-membership-decision">
        {pending ? 'در حال ثبت…' : 'ثبت نتیجه'}
      </Button>
    </form>
  );
}

/**
 * Suspending, revoking or reinstating one membership, each with its reason.
 * None of these grants a period: only a verified payment does that.
 */
export function MembershipStateForm({ accountId, suspended, suffix }: { accountId: string; suspended: boolean; suffix: string }) {
  const [state, submit, pending] = useActionState(setMembershipStandingAction, EMPTY);
  const [open, setOpen] = useState<null | 'SUSPEND' | 'REVOKE' | 'REINSTATE'>(null);
  if (open === null) {
    return (
      <div className="mt-md flex flex-wrap gap-sm">
        {suspended ? (
          <Button type="button" tone="ghost" onClick={() => setOpen('REINSTATE')} data-testid={'toggle-membership-' + suffix}>
            برداشتن تعلیق
          </Button>
        ) : (
          <Button type="button" tone="ghost" onClick={() => setOpen('SUSPEND')} data-testid={'toggle-membership-' + suffix}>
            تعلیق عضویت
          </Button>
        )}
        <Button type="button" tone="ghost" onClick={() => setOpen('REVOKE')} data-testid={'revoke-membership-' + suffix}>
          لغو عضویت
        </Button>
      </div>
    );
  }
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'membership-state-form-' + suffix}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="action" value={open} />
      <Result state={state} />
      <TextField label="دلیل" name="reason" required data-testid={'membership-reason-' + suffix} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'submit-membership-' + suffix}>
        {pending ? 'در حال ثبت…' : open === 'SUSPEND' ? 'ثبت تعلیق' : open === 'REVOKE' ? 'ثبت لغو' : 'ثبت رفع تعلیق'}
      </Button>
    </form>
  );
}
