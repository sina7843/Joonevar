'use client';

import { useActionState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { recordShipmentAction, type VetFormState } from '../actions.ts';

const EMPTY: VetFormState = {};

/** Shipment is an event on the same tracking code, not a new identifier. */
export function ShipmentForm({ sampleId }: { sampleId: string }) {
  const [state, submit, pending] = useActionState(recordShipmentAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid={'shipment-form-' + sampleId}>
      <input type="hidden" name="sampleId" value={sampleId} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'} title={state.message} /> : null}
      <TextField label="شناسه یا توضیح ارسال" name="reference" required data-testid="shipment-reference" />
      <Button type="submit" block disabled={pending} data-testid="submit-shipment">
        {pending ? 'در حال ثبت…' : 'ثبت ارسال نمونه'}
      </Button>
    </form>
  );
}
