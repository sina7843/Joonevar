'use client';

import { startTransition, useActionState, useState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { SelectField, TextAreaField, TextField } from '../ui/field.tsx';
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
            className="flex min-h-[var(--size-touch-min)] cursor-pointer items-center gap-sm rounded-md border border-border-subtle bg-bg-surface px-md text-body-sm has-[:checked]:border-border-brand has-[:checked]:bg-bg-brand-subtle"
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

export function DecisionForm({
  contentId,
  decisions,
  hasOpenReports,
}: {
  contentId: string;
  decisions: readonly ModerationDecision[];
  hasOpenReports: boolean;
}) {
  const [state, submit, pending] = useActionState(decideReportsAction, EMPTY);
  const [picked, setPicked] = useState<string>('');
  const decision = decisions.find((value) => value === picked) ?? '';

  // A decision closes every open report, so the form has nothing left to decide —
  // but it stays mounted to show the moderator what was recorded.
  if (!hasOpenReports) return state.message ? <Result state={state} testId="decision-result" /> : null;

  return (
    <Card>
      <h2 className="text-label-lg">تصمیم درباره گزارش‌های باز</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        تصمیم برای همه گزارش‌های باز این محتوا ثبت می‌شود و دلیل آن در تاریخچه می‌ماند.
      </p>
      <form
        onSubmit={(event) => {
          // No automatic reset: a reset select would fall back to its empty option (DEC-0157).
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const local = String(data.get('restrictUntilLocal') ?? '');
          data.set('restrictUntilIso', local === '' ? '' : new Date(local).toISOString());
          startTransition(() => submit(data));
        }}
        className="mt-lg space-y-lg"
        data-testid="decision-form"
      >
        <input type="hidden" name="contentId" value={contentId} />
        <Result state={state} testId="decision-result" />
        <SelectField
          label="تصمیم"
          name="decision"
          required
          value={decision}
          onChange={(event) => setPicked(event.target.value)}
          options={decisions.map((value) => ({ value, label: DECISION_FA[value] }))}
          data-testid="decision"
        />
        {decision === 'RESTRICT_PUBLISHER' ? (
          <TextField
            label="پایان محدودیت"
            name="restrictUntilLocal"
            type="datetime-local"
            ltr
            hint="خالی یعنی تا وقتی ادمین محتوا آن را بردارد."
            data-testid="restrict-until"
          />
        ) : null}
        <TextAreaField label="دلیل" name="reason" rows={3} required data-testid="decision-reason" />
        <Button type="submit" disabled={pending || decision === ''} data-testid="submit-decision">
          {pending ? 'در حال ثبت…' : 'ثبت تصمیم'}
        </Button>
      </form>
    </Card>
  );
}

export function LiftRestrictionForm({ restrictionId }: { restrictionId: string }) {
  const [state, submit, pending] = useActionState(liftRestrictionAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-sm" data-testid={'lift-restriction-form-' + restrictionId}>
      <input type="hidden" name="restrictionId" value={restrictionId} />
      <Result state={state} testId={'lift-restriction-result-' + restrictionId} />
      <TextField label="دلیل برداشتن محدودیت" name="reason" required data-testid={'lift-reason-' + restrictionId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'lift-restriction-' + restrictionId}>
        {pending ? 'در حال ثبت…' : 'برداشتن محدودیت'}
      </Button>
    </form>
  );
}
