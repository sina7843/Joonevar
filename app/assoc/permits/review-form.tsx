'use client';

import { DecisionForm } from '../../../src/ui/decision.tsx';
import { reviewPermitAction } from './actions.ts';

/** The association's decision on an official permit — §16 steps 8 and 9 (DS P10 panel). */
export function PermitReviewForm({ permitId, version }: { permitId: string; version: number }) {
  return (
    <DecisionForm
      action={reviewPermitAction}
      hidden={{ permitId, version }}
      formTestId="permit-review-form"
      submitTestId="submit-permit-review"
      reasonName="reason"
      reasonTestId="permit-review-reason"
      reasonFor={['NEEDS_CORRECTION', 'REJECTED']}
      reasonLabel={(value) => (value === 'REJECTED' ? 'دلیل رد' : 'دلیل اصلاح')}
      choices={[
        { value: 'ISSUED', label: 'صدور مجوز رسمی جفت‌گیری', desc: 'شماره مجوز یک‌بار ساخته می‌شود و برای هر دو طرف ثبت می‌شود.', testId: 'permit-decision-ISSUED' },
        { value: 'NEEDS_CORRECTION', label: 'نیازمند اصلاح', desc: 'پرونده با دلیل به درخواست‌کننده برمی‌گردد.', testId: 'permit-decision-NEEDS_CORRECTION' },
        { value: 'REJECTED', label: 'رد', desc: 'پرونده با دلیل بسته می‌شود.', testId: 'permit-decision-REJECTED' },
      ]}
    />
  );
}
