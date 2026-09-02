'use client';

import { useActionState, useState } from 'react';
import { Alert } from '../../../src/ui/alert.tsx';
import { ActionRow, Button } from '../../../src/ui/button.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { reviewKycAction, type ReviewState } from './actions.ts';

const EMPTY: ReviewState = {};

/**
 * Review action (§21.5). A correction or a rejection always carries a reason,
 * and the exact version travels with the decision so a stale queue view cannot
 * overwrite a newer state.
 */
export function ReviewForm({ caseId, version }: { caseId: string; version: number }) {
  const [state, submit, pending] = useActionState(reviewKycAction, EMPTY);
  const [decision, setDecision] = useState<'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED'>('APPROVED');
  const needsReason = decision !== 'APPROVED';

  return (
    <form action={submit} className="space-y-lg" data-testid="review-form">
      {state.message ? <Alert tone={state.tone === 'success' ? 'success' : 'error'} title={state.message} /> : null}
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="expectedVersion" value={version} />

      <fieldset className="space-y-sm">
        <legend className="text-label-md">نتیجه بررسی</legend>
        {(
          [
            ['APPROVED', 'تأیید'],
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
              data-testid={'decision-' + value}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {needsReason ? (
        <TextField
          label="دلیل"
          name="reasonFa"
          required
          hint="دلیل برای کاربر نمایش داده می‌شود."
          data-testid="review-reason"
        />
      ) : (
        <input type="hidden" name="reasonFa" value="" />
      )}

      <ActionRow
        primary={
          <Button type="submit" disabled={pending} data-testid="submit-review">
            {pending ? 'در حال ثبت…' : 'ثبت نتیجه'}
          </Button>
        }
      />
    </form>
  );
}
