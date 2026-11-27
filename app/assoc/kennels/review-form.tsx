'use client';

import { DecisionForm } from '../../../src/ui/decision.tsx';
import { reviewKennelAction } from './actions.ts';

/**
 * The association's decision on a kennel — §15.2, §21.5 (DS P10 panel).
 *
 * Anything but an approval needs a reason, because the owner has to know what
 * to fix on the same file. The exact version travels with the decision.
 */
export function KennelReviewForm({ kennelId, version }: { kennelId: string; version: number }) {
  return (
    <DecisionForm
      action={reviewKennelAction}
      hidden={{ kennelId, version }}
      formTestId="kennel-review-form"
      submitTestId="submit-kennel-review"
      reasonName="reason"
      reasonTestId="kennel-review-reason"
      reasonFor={['NEEDS_CORRECTION', 'REJECTED']}
      reasonLabel={(value) => (value === 'REJECTED' ? 'دلیل رد' : 'دلیل اصلاح')}
      choices={[
        { value: 'APPROVED', label: 'تأیید', desc: 'کنل ثبت و نقش پرورش‌دهنده همین حساب فعال می‌شود؛ پرداخت جداگانه‌ای ندارد.', testId: 'kennel-decision-APPROVED' },
        { value: 'NEEDS_CORRECTION', label: 'نیازمند اصلاح', desc: 'پرونده با دلیل به مالک کنل برمی‌گردد.', testId: 'kennel-decision-NEEDS_CORRECTION' },
        { value: 'REJECTED', label: 'رد', desc: 'پرونده با دلیل بسته می‌شود.', testId: 'kennel-decision-REJECTED' },
      ]}
    />
  );
}
