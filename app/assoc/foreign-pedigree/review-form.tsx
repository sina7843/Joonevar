'use client';

import { useActionState, useState } from 'react';
import { Alert } from '../../../src/ui/alert.tsx';
import { ActionRow, Button } from '../../../src/ui/button.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { reviewForeignAction, type ReviewState } from './actions.ts';

const EMPTY: ReviewState = {};

/**
 * Review action (§21.5, §9.4).
 *
 * Approving requires the generation read from the document; a correction or a
 * rejection requires a reason. The exact version travels with the decision, so
 * a stale queue view cannot overwrite a newer state.
 */
export function ForeignReviewForm({ caseId, version }: { caseId: string; version: number }) {
  const [state, submit, pending] = useActionState(reviewForeignAction, EMPTY);
  const [decision, setDecision] = useState<'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED'>('APPROVED');
  const approving = decision === 'APPROVED';

  return (
    <form action={submit} className="space-y-lg" data-testid="foreign-review-form">
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
              data-testid={'foreign-decision-' + value}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {approving ? (
        <TextField
          label="نسل استخراج‌شده از مدرک"
          name="extractedGeneration"
          required
          ltr
          inputMode="numeric"
          hint="عددی که از مدرک بررسی‌شده خوانده‌اید؛ پس از ثبت فقط‌خواندنی می‌شود."
          data-testid="extracted-generation-input"
        />
      ) : (
        <TextField
          label="دلیل"
          name="reasonFa"
          required
          hint="دلیل برای مالک نمایش داده می‌شود."
          data-testid="foreign-review-reason"
        />
      )}

      <ActionRow
        primary={
          <Button type="submit" disabled={pending} data-testid="submit-foreign-review">
            {pending ? 'در حال ثبت…' : 'ثبت نتیجه'}
          </Button>
        }
      />
    </form>
  );
}
