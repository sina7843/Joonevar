'use client';

import { DecisionForm, type DecisionFormState } from '../../src/ui/decision.tsx';

/**
 * DS DecisionDesk panel over a record's existing publish / hide action (review
 * environment). The one outcome offered is the opposite of the current state;
 * the reason is required and kept in the change history. Field names and test
 * ids follow the module's own status form (`<prefix>-status-…`).
 */
export function PublicationDecision({
  action,
  hidden,
  publicStatus,
  prefix,
}: {
  action: (state: never, form: FormData) => Promise<DecisionFormState>;
  hidden: Record<string, string | number>;
  publicStatus: string;
  prefix: 'centre' | 'community';
}) {
  const to = publicStatus === 'PUBLISHED' ? 'HIDDEN' : 'PUBLISHED';
  return (
    <DecisionForm
      action={action}
      hidden={{ surface: 'review', ...hidden }}
      name="to"
      formTestId={prefix + '-status-form'}
      submitTestId={'change-' + prefix + '-status'}
      reasonName="reason"
      reasonTestId={prefix + '-status-reason'}
      reasonFor={[to]}
      reasonLabel={() => 'دلیل تغییر'}
      audience={null}
      choices={[
        to === 'HIDDEN'
          ? {
              value: to,
              label: 'پنهان کردن',
              desc: 'صفحه عمومی برداشته می‌شود و فقط از بررسی همزیست دوباره منتشر می‌شود.',
              testId: prefix + '-status-to-HIDDEN',
            }
          : { value: to, label: 'انتشار', desc: 'صفحه عمومی با همین اطلاعات در دسترس قرار می‌گیرد.', testId: prefix + '-status-to-PUBLISHED' },
      ]}
    />
  );
}
