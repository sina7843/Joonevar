'use client';

import { useActionState, useState } from 'react';
import { Alert } from '../../../src/ui/alert.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { DecisionOptions, ReasonField } from '../../../src/ui/decision.tsx';
import { reviewKycAction, type ReviewState } from './actions.ts';

const EMPTY: ReviewState = {};

type Decision = 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED';

const CHOICES = [
  { value: 'APPROVED', label: 'تأیید', desc: 'هویت تأیید می‌شود و خدمات وابسته برای کاربر باز می‌شود.', testId: 'decision-APPROVED' },
  { value: 'NEEDS_CORRECTION', label: 'نیازمند اصلاح', desc: 'پرونده با دلیل به کاربر برمی‌گردد.', testId: 'decision-NEEDS_CORRECTION' },
  { value: 'REJECTED', label: 'رد', desc: 'درخواست بسته می‌شود؛ کاربر می‌تواند درخواست تازه بدهد.', testId: 'decision-REJECTED' },
] as const;

const LABEL: Record<Decision, string> = { APPROVED: 'تأیید', NEEDS_CORRECTION: 'نیازمند اصلاح', REJECTED: 'رد' };

/**
 * Review action (§21.5) — DS *DecisionDesk* panel. A correction or a rejection
 * always carries a reason, and the exact version travels with the decision so a
 * stale queue view cannot overwrite a newer state.
 */
export function ReviewForm({ caseId, version }: { caseId: string; version: number }) {
  const [state, submit, pending] = useActionState(reviewKycAction, EMPTY);
  const [decision, setDecision] = useState<Decision | null>(null);
  const needsReason = decision !== null && decision !== 'APPROVED';

  return (
    <form action={submit} className="flex flex-col gap-lg" data-testid="review-form">
      {state.message ? <Alert tone={state.tone === 'success' ? 'success' : 'error'} title={state.message} /> : null}
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="expectedVersion" value={version} />

      <DecisionOptions choices={CHOICES} value={decision} onChange={setDecision} disabled={pending} />

      {needsReason ? (
        <ReasonField
          name="reasonFa"
          label={decision === 'REJECTED' ? 'دلیل رد' : 'دلیل اصلاح'}
          required
          testId="review-reason"
          drafts={['تصویر خوانا نیست', 'تاریخ تولد مطابقت ندارد', 'مدرک ناقص است']}
        />
      ) : (
        <input type="hidden" name="reasonFa" value="" />
      )}

      <Button type="submit" size="lg" block disabled={pending || decision === null} loading={pending} loadingLabel="در حال ثبت…" data-testid="submit-review">
        {decision === null ? 'یک تصمیم انتخاب کنید' : 'ثبت تصمیم: ' + LABEL[decision]}
      </Button>
    </form>
  );
}
