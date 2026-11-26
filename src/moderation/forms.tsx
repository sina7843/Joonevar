'use client';

import { useActionState, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { TextAreaField, TextField } from '../ui/field.tsx';
import { DecisionForm, ReasonField } from '../ui/decision.tsx';
import {
  decideReportsAction,
  liftRestrictionAction,
  submitReportAction,
  type ModerationFormState,
} from './actions.ts';
import { DECISION_FA, REASON_FA, REPORT_DETAILS_MAX, REPORT_REASONS, type ModerationDecision } from './model.ts';

const EMPTY: ModerationFormState = {};

function Result({ state, testId }: { state: ModerationFormState; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

export function ReportForm({ contentId, backHref }: { contentId: string; backHref: string }) {
  const [state, submit, pending] = useActionState(submitReportAction, EMPTY);
  if (state.ok) {
    return (
      <div className="space-y-lg">
        <Result state={state} testId="report-result" />
        <a href={backHref} className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به مطلب
        </a>
      </div>
    );
  }
  return (
    <form action={submit} className="space-y-lg" data-testid="report-form">
      <input type="hidden" name="contentId" value={contentId} />
      <Result state={state} testId="report-result" />
      <fieldset className="space-y-xs">
        <legend className="mb-sm text-label-md">
          دلیل گزارش <span className="text-status-error-text" aria-hidden="true">*</span>
        </legend>
        {REPORT_REASONS.map((reason) => (
          <label
            key={reason}
            className="flex min-h-[var(--size-touch-min)] cursor-pointer items-center gap-sm rounded-lg border border-border-default bg-bg-surface px-md text-body-sm has-[:checked]:border-border-brand has-[:checked]:bg-bg-brand-subtle"
          >
            <input type="radio" name="reason" value={reason} required data-testid={'report-reason-' + reason} />
            {REASON_FA[reason]}
          </label>
        ))}
      </fieldset>
      <TextAreaField
        label="توضیح"
        name="details"
        rows={4}
        maxLength={REPORT_DETAILS_MAX}
        hint="اگر بخش مشخصی از مطلب منظورتان است، همان را بنویسید. برای «دلیل دیگر» لازم است."
        data-testid="report-details"
      />
      <p className="text-caption text-text-secondary">
        نام شما به نویسنده یا در صف بررسی نشان داده نمی‌شود.
      </p>
      <Button type="submit" disabled={pending} data-testid="submit-report">
        {pending ? 'در حال ثبت…' : 'ثبت گزارش'}
      </Button>
    </form>
  );
}

/** What each moderation outcome does, shown under its option (DS DecisionDesk consequence line). */
const DECISION_DESC: Record<ModerationDecision, string> = {
  DISMISS: 'گزارش‌ها بسته می‌شوند و محتوا همان‌طور می‌ماند.',
  REQUEST_CORRECTION: 'دلیل به نویسنده می‌رسد تا محتوا را اصلاح کند.',
  HIDE: 'محتوا از سایت پنهان می‌شود؛ نویسنده دلیل را می‌بیند.',
  SOFT_DELETE: 'محتوا برداشته می‌شود و با سابقه‌اش می‌ماند.',
  RESTRICT_PUBLISHER: 'نویسنده تا پایان محدودیت نمی‌تواند منتشر کند.',
};

/** The restriction end as a local date-time; the server receives it as an ISO instant. */
function RestrictUntilField() {
  const [local, setLocal] = useState('');
  return (
    <>
      <TextField
        label="پایان محدودیت"
        type="datetime-local"
        ltr
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        hint="خالی یعنی تا وقتی ادمین محتوا آن را بردارد."
        data-testid="restrict-until"
      />
      <input type="hidden" name="restrictUntilIso" value={local === '' ? '' : new Date(local).toISOString()} />
    </>
  );
}

/**
 * DS DecisionDesk decision panel (K16) over every open report of one item.
 * Only outcomes that can still apply are offered; each needs a reason, which
 * the open reports' reasons can prefill.
 */
export function ReportDecisionForm({
  contentId,
  version,
  decisions,
  drafts,
}: {
  contentId: string;
  /** The content version on screen; the server refuses a decision on a newer one (KOPS-029). */
  version: number;
  decisions: readonly ModerationDecision[];
  drafts: readonly string[];
}) {
  return (
    <DecisionForm
      action={decideReportsAction}
      hidden={{ contentId, expectedVersion: String(version) }}
      formTestId="decision-form"
      submitTestId="submit-decision"
      reasonName="reason"
      reasonTestId="decision-reason"
      reasonFor={decisions}
      drafts={drafts}
      audience="به نویسنده نمایش داده می‌شود"
      choices={decisions.map((value) => ({ value, label: DECISION_FA[value], desc: DECISION_DESC[value], testId: 'decision-' + value }))}
    >
      {(value) => (value === 'RESTRICT_PUBLISHER' ? <RestrictUntilField /> : null)}
    </DecisionForm>
  );
}

export function LiftRestrictionForm({ restrictionId }: { restrictionId: string }) {
  const [state, submit, pending] = useActionState(liftRestrictionAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-sm" data-testid={'lift-restriction-form-' + restrictionId}>
      <input type="hidden" name="restrictionId" value={restrictionId} />
      <Result state={state} testId={'lift-restriction-result-' + restrictionId} />
      <ReasonField name="reason" label="دلیل برداشتن محدودیت" required rows={2} audience={null} testId={'lift-reason-' + restrictionId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'lift-restriction-' + restrictionId}>
        {pending ? 'در حال ثبت…' : 'برداشتن محدودیت'}
      </Button>
    </form>
  );
}
