'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { Result } from './directory-forms.tsx';
import { cancelLicencePeriodPaymentAction, payLicencePeriodAction, type LicencePeriodState } from './licence-period-actions.ts';

const EMPTY: LicencePeriodState = {};

/**
 * Start, or start again, the payment for a licence period (Phase 2.5 PROMPT-008).
 *
 * The button carries no amount: the server reads the managed tariff at the
 * moment it opens the payment. A started payment can be abandoned here, which
 * keeps the frozen amount so the doctor can return to it.
 */
export function PayLicencePeriodForm({ kind, pendingBatchId }: { kind: 'ACTIVATION' | 'RENEWAL'; pendingBatchId: string | null }) {
  const [payState, pay, paying] = useActionState(payLicencePeriodAction, EMPTY);
  const [cancelState, cancel, cancelling] = useActionState(cancelLicencePeriodPaymentAction, EMPTY);
  return (
    <div className="space-y-md">
      <form action={pay}>
        <Button type="submit" disabled={paying} data-testid={kind === 'RENEWAL' ? 'renew-licence-period' : 'pay-licence-period'}>
          {paying ? 'در حال رفتن به درگاه…' : kind === 'RENEWAL' ? 'تمدید دوره فعالیت' : 'پرداخت و فعال‌سازی پروانه'}
        </Button>
        <Result state={payState} testId="licence-period-pay-result" />
      </form>
      {pendingBatchId ? (
        <form action={cancel}>
          <input type="hidden" name="batchId" value={pendingBatchId} />
          <Button type="submit" tone="ghost" disabled={cancelling} data-testid="cancel-licence-period-payment">
            {cancelling ? 'در حال لغو…' : 'لغو پرداخت شروع‌شده'}
          </Button>
          <Result state={cancelState} testId="licence-period-cancel-result" />
        </form>
      ) : null}
    </div>
  );
}
