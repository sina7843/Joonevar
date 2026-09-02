'use client';

import { useActionState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import {
  cancelSheetPaymentAction,
  paySheetBatchAction,
  retryIssuanceAction,
  type SheetFormState,
} from '../actions.ts';

const EMPTY: SheetFormState = {};

export function PaySheetBatchForm({ batchId }: { batchId: string }) {
  const [state, submit, pending] = useActionState(paySheetBatchAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="pay-sheet-form">
      <input type="hidden" name="batchId" value={batchId} />
      {state.message ? <Alert tone="error" title={state.message} /> : null}
      <Button type="submit" block disabled={pending} data-testid="pay-sheet-batch">
        {pending ? 'در حال انتقال به درگاه…' : 'پرداخت گروهی'}
      </Button>
    </form>
  );
}

/** Cancelling keeps the batch and every frozen amount for a second attempt. */
export function CancelSheetPaymentForm({ batchId }: { batchId: string }) {
  return (
    <form action={cancelSheetPaymentAction} className="mt-md" data-testid="cancel-sheet-form">
      <input type="hidden" name="batchId" value={batchId} />
      <Button tone="ghost" type="submit" block data-testid="cancel-sheet-payment">
        لغو پرداخت جاری
      </Button>
    </form>
  );
}

/** Retrying a blocked issuance moves no money (§13). */
export function RetryIssuanceForm({ batchId }: { batchId: string }) {
  const [state, submit, pending] = useActionState(retryIssuanceAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="retry-issuance-form">
      <input type="hidden" name="batchId" value={batchId} />
      {state.message ? <Alert tone={state.ok ? 'info' : 'error'} title={state.message} /> : null}
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="retry-issuance">
        {pending ? 'در حال بررسی…' : 'بررسی دوباره صدور'}
      </Button>
    </form>
  );
}
