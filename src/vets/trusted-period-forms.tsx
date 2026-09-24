'use client';

import { useActionState, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { TextField } from '../ui/field.tsx';
import { Result } from './directory-forms.tsx';
import { cancelTrustedPeriodPaymentAction, payTrustedPeriodAction, suspendTrustedAction, type TrustedPeriodState } from './trusted-period-actions.ts';

const EMPTY: TrustedPeriodState = {};

/**
 * Pay for, or renew, a trusted period (Phase 2.5 PROMPT-011).
 *
 * The button carries no amount and no eligibility: the server reads the managed
 * tariff and re-checks every prerequisite at the moment it opens the payment.
 */
export function PayTrustedPeriodForm({ kind, pendingBatchId }: { kind: 'ACTIVATION' | 'RENEWAL'; pendingBatchId: string | null }) {
  const [payState, pay, paying] = useActionState(payTrustedPeriodAction, EMPTY);
  const [cancelState, cancel, cancelling] = useActionState(cancelTrustedPeriodPaymentAction, EMPTY);
  return (
    <div className="space-y-md">
      <form action={pay}>
        <Button type="submit" disabled={paying} data-testid={kind === 'RENEWAL' ? 'renew-trusted-period' : 'pay-trusted-period'}>
          {paying ? 'در حال رفتن به درگاه…' : kind === 'RENEWAL' ? 'تمدید دوره معتمد' : 'پرداخت و فعال‌سازی دوره معتمد'}
        </Button>
        <Result state={payState} testId="trusted-period-pay-result" />
      </form>
      {pendingBatchId ? (
        <form action={cancel}>
          <input type="hidden" name="batchId" value={pendingBatchId} />
          <Button type="submit" tone="ghost" disabled={cancelling} data-testid="cancel-trusted-period-payment">
            {cancelling ? 'در حال لغو…' : 'لغو پرداخت شروع‌شده'}
          </Button>
          <Result state={cancelState} testId="trusted-period-cancel-result" />
        </form>
      ) : null}
    </div>
  );
}

/** The association suspends a trusted standing it granted, with its reason. */
export function SuspendTrustedForm({ accountId }: { accountId: string }) {
  const [state, submit, pending] = useActionState(suspendTrustedAction, EMPTY);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" tone="ghost" onClick={() => setOpen(true)} data-testid="open-suspend-trusted">
        تعلیق دسترسی معتمد
      </Button>
    );
  }
  return (
    <form action={submit} className="space-y-md" data-testid="suspend-trusted-form">
      <input type="hidden" name="accountId" value={accountId} />
      <TextField label="دلیل تعلیق" name="reasonFa" required maxLength={1000} data-testid="suspend-trusted-reason" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="submit-suspend-trusted">
        {pending ? 'در حال ثبت…' : 'ثبت تعلیق'}
      </Button>
      <Result state={state} testId="suspend-trusted-result" />
    </form>
  );
}
