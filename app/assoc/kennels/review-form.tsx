'use client';

import { useActionState, useState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { reviewKennelAction, type KennelReviewState } from './actions.ts';

const EMPTY: KennelReviewState = {};

/**
 * The association's decision on a kennel — §15.2, §21.5.
 *
 * Anything but an approval needs a reason, because the owner has to know what
 * to fix on the same file. The exact version travels with the decision.
 */
export function KennelReviewForm({ kennelId, version }: { kennelId: string; version: number }) {
  const [state, submit, pending] = useActionState(reviewKennelAction, EMPTY);
  const [decision, setDecision] = useState<'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED'>('APPROVED');

  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="kennel-review-form">
      <input type="hidden" name="kennelId" value={kennelId} />
      <input type="hidden" name="version" value={version} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'} title={state.message} /> : null}
      <fieldset className="space-y-sm">
        <legend className="text-label-md">تصمیم</legend>
        {(
          [
            ['APPROVED', 'تأیید کنل و فعال‌سازی نقش پرورش‌دهنده'],
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
              data-testid={'kennel-decision-' + value}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {decision === 'APPROVED' ? null : (
        <TextField label="دلیل" name="reason" required data-testid="kennel-review-reason" />
      )}
      <Button type="submit" block disabled={pending} data-testid="submit-kennel-review">
        {pending ? 'در حال ثبت…' : 'ثبت تصمیم'}
      </Button>
    </form>
  );
}
