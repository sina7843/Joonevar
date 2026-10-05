'use client';

import { DecisionForm } from '../../../src/ui/decision.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { reviewForeignAction } from './actions.ts';

/**
 * Review action (§21.5, §9.4) — DS P10 panel.
 *
 * Approving requires the generation read from the document; a correction or a
 * rejection requires a reason. The exact version travels with the decision, so
 * a stale queue view cannot overwrite a newer state.
 */
export function ForeignReviewForm({ caseId, version }: { caseId: string; version: number }) {
  return (
    <DecisionForm
      action={reviewForeignAction}
      hidden={{ caseId, expectedVersion: version }}
      formTestId="foreign-review-form"
      submitTestId="submit-foreign-review"
      reasonName="reasonFa"
      reasonTestId="foreign-review-reason"
      reasonFor={['NEEDS_CORRECTION', 'REJECTED']}
      reasonLabel={(value) => (value === 'REJECTED' ? 'دلیل رد' : 'دلیل اصلاح')}
      audience="به مالک نمایش داده می‌شود"
      choices={[
        { value: 'APPROVED', label: 'تأیید', desc: 'نسل خوانده‌شده از مدرک ثبت و فقط‌خواندنی می‌شود.', testId: 'foreign-decision-APPROVED' },
        { value: 'NEEDS_CORRECTION', label: 'نیازمند اصلاح', desc: 'پرونده با دلیل به مالک برمی‌گردد.', testId: 'foreign-decision-NEEDS_CORRECTION' },
        { value: 'REJECTED', label: 'رد', desc: 'پرونده با دلیل بسته می‌شود.', testId: 'foreign-decision-REJECTED' },
      ]}
    >
      {(value) =>
        value === 'APPROVED' ? (
          <TextField
            label="نسل استخراج‌شده از مدرک"
            name="extractedGeneration"
            required
            ltr
            inputMode="numeric"
            hint="عددی که از مدرک بررسی‌شده خوانده‌اید؛ پس از ثبت فقط‌خواندنی می‌شود."
            data-testid="extracted-generation-input"
          />
        ) : null
      }
    </DecisionForm>
  );
}
