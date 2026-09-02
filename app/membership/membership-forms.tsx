'use client';

import { useActionState } from 'react';
import { Alert } from '../../src/ui/alert.tsx';
import { Button } from '../../src/ui/button.tsx';
import { cancelMembershipPaymentAction, payMembershipAction, type CheckoutState } from './actions.ts';

const EMPTY: CheckoutState = {};

export function PayMembershipForm({ label }: { label: string }) {
  const [state, submit, pending] = useActionState(payMembershipAction, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="pay-membership-form">
      {state.message ? <Alert tone="error" title={state.message} /> : null}
      <Button type="submit" block disabled={pending} data-testid="pay-membership">
        {pending ? 'در حال انتقال به درگاه…' : label}
      </Button>
    </form>
  );
}

export function CancelMembershipPaymentForm() {
  return (
    <form action={cancelMembershipPaymentAction}>
      <Button tone="secondary" type="submit" block data-testid="cancel-membership-payment">
        لغو پرداخت در جریان
      </Button>
    </form>
  );
}
