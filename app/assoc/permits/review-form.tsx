'use client';

import { useActionState, useState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { reviewPermitAction, type PermitReviewState } from './actions.ts';

const EMPTY: PermitReviewState = {};

/** The association's decision on an official permit — §16 steps 8 and 9. */
export function PermitReviewForm({ permitId, version }: { permitId: string; version: number }) {
  const [state, submit, pending] = useActionState(reviewPermitAction, EMPTY);
  const [decision, setDecision] = useState<'ISSUED' | 'NEEDS_CORRECTION' | 'REJECTED'>('ISSUED');

  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="permit-review-form">
      <input type="hidden" name="permitId" value={permitId} />
      <input type="hidden" name="version" value={version} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'} title={state.message} /> : null}
      <fieldset className="space-y-sm">
        <legend className="text-label-md">تصمیم</legend>
        {(
          [
            ['ISSUED', 'صدور مجوز رسمی جفت‌گیری'],
            ['NEEDS_CORRECTION', 'نیازمند اصلاح'],
            ['REJECTED', 'رد با دلیل'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-sm text-body-sm">
            <input
              type="radio"
              name="decision"
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
              className="size-[var(--size-selection-md)]"
              data-testid={'permit-decision-' + value}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {decision === 'ISSUED' ? null : (
        <TextField label="دلیل" name="reason" required data-testid="permit-review-reason" />
      )}
      <Button type="submit" block disabled={pending} data-testid="submit-permit-review">
        {pending ? 'در حال ثبت…' : 'ثبت تصمیم'}
      </Button>
    </form>
  );
}
