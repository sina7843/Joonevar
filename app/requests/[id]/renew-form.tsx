'use client';

import { useActionState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { renewReferralAction, type FormState } from '../actions.ts';

const EMPTY: FormState = {};

export function RenewReferralForm({ requestId }: { requestId: string }) {
  const [state, submit, pending] = useActionState(renewReferralAction, EMPTY);
  return (
    <form action={submit} className="space-y-lg" data-testid="renew-form">
      <input type="hidden" name="requestId" value={requestId} />
      {state.message ? (
        <Alert tone={state.tone === 'success' ? 'success' : 'error'} title={state.message} />
      ) : null}
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="renew-referral">
        {pending ? 'در حال صدور…' : 'درخواست کد مراجعه جدید'}
      </Button>
    </form>
  );
}
