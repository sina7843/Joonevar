'use client';

import { useActionState, useState } from 'react';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../src/ui/field.tsx';
import {
  answerAppealAction,
  takeAppealAction,
  receiveSampleAction,
  recordResultAction,
  refreshResultAction,
  rejectSampleAction,
  reviewReceiptAction,
  startProcessingAction,
  type CentreFormState,
} from './actions.ts';

const EMPTY: CentreFormState = {};

function Result({ state }: { state: CentreFormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />;
}

/**
 * The centre's decision on a receipt — §14.1 step 4.
 *
 * Anything but an approval needs a reason, because the payer has to know what
 * to fix on the same receipt.
 */
export function ReceiptReviewForm({ receiptId, version }: { receiptId: string; version: number }) {
  const [state, submit, pending] = useActionState(reviewReceiptAction, EMPTY);
  const [decision, setDecision] = useState<'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED'>('APPROVED');

  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="receipt-review-form">
      <input type="hidden" name="receiptId" value={receiptId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} />
      <fieldset className="space-y-sm">
        <legend className="text-label-md">تصمیم</legend>
        {(
          [
            ['APPROVED', 'تأیید فیش'],
            ['NEEDS_CORRECTION', 'نیازمند اصلاح'],
            ['REJECTED', 'رد فیش'],
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
              data-testid={'receipt-decision-' + value}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {decision === 'APPROVED' ? null : (
        <TextField label="دلیل" name="reason" required data-testid="receipt-review-reason" />
      )}
      <Button type="submit" block disabled={pending} data-testid="submit-receipt-review">
        {pending ? 'در حال ثبت…' : 'ثبت تصمیم'}
      </Button>
    </form>
  );
}

function OneButton({
  action,
  sampleId,
  label,
  testId,
  tone = 'primary',
}: {
  action: typeof receiveSampleAction;
  sampleId: string;
  label: string;
  testId: string;
  tone?: 'primary' | 'secondary';
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={testId + '-form'}>
      <input type="hidden" name="sampleId" value={sampleId} />
      <Result state={state} />
      <Button tone={tone} type="submit" block disabled={pending} data-testid={testId}>
        {pending ? 'در حال ثبت…' : label}
      </Button>
    </form>
  );
}

export function ReceiveSampleForm({ sampleId }: { sampleId: string }) {
  return <OneButton action={receiveSampleAction} sampleId={sampleId} label="ثبت دریافت نمونه" testId="receive-sample" />;
}

export function StartProcessingForm({ sampleId }: { sampleId: string }) {
  return (
    <OneButton
      action={startProcessingAction}
      sampleId={sampleId}
      label="شروع پردازش"
      testId="start-processing"
    />
  );
}

/** An unusable sample returns to the existing resampling path (§14.4). */
export function RejectSampleForm({ sampleId }: { sampleId: string }) {
  const [state, submit, pending] = useActionState(rejectSampleAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="reject-sample-form">
      <input type="hidden" name="sampleId" value={sampleId} />
      <Result state={state} />
      <SelectField
        label="وضعیت نمونه"
        name="status"
        required
        options={[
          { value: 'INVALID', label: 'نامعتبر' },
          { value: 'INSUFFICIENT', label: 'ناکافی' },
          { value: 'DAMAGED', label: 'خراب' },
        ]}
        data-testid="reject-status"
      />
      <TextField label="دلیل" name="reason" required data-testid="reject-reason" />
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="submit-reject-sample">
        {pending ? 'در حال ثبت…' : 'ثبت نمونه غیرقابل‌استفاده'}
      </Button>
    </form>
  );
}

export function RecordResultForm({ sampleId }: { sampleId: string }) {
  const [state, submit, pending] = useActionState(recordResultAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="record-result-form">
      <input type="hidden" name="sampleId" value={sampleId} />
      <Result state={state} />
      <TextField label="یادداشت فنی (اختیاری)" name="note" data-testid="result-note" />
      <Button type="submit" block disabled={pending} data-testid="submit-result">
        {pending ? 'در حال ثبت…' : 'ثبت Parentage Result'}
      </Button>
    </form>
  );
}

export function RefreshResultForm({ resultId }: { resultId: string }) {
  const [state, submit, pending] = useActionState(refreshResultAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="refresh-result-form">
      <input type="hidden" name="resultId" value={resultId} />
      <Result state={state} />
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="refresh-result">
        {pending ? 'در حال بررسی…' : 'بررسی دوباره نتایج والدین'}
      </Button>
    </form>
  );
}

export function TakeAppealForm({ appealId }: { appealId: string }) {
  const [state, submit, pending] = useActionState(takeAppealAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="take-appeal-form">
      <input type="hidden" name="appealId" value={appealId} />
      <Result state={state} />
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="take-appeal">
        {pending ? 'در حال ثبت…' : 'شروع بررسی اعتراض'}
      </Button>
    </form>
  );
}

/**
 * The centre's answer to an appeal — §14.5.
 *
 * Ticking the correction records a new result version. The disputed version and
 * any document already issued from it are untouched.
 */
export function AnswerAppealForm({ appealId, version }: { appealId: string; version: number }) {
  const [state, submit, pending] = useActionState(answerAppealAction, EMPTY);
  const [correct, setCorrect] = useState(false);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="answer-appeal-form">
      <input type="hidden" name="appealId" value={appealId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} />
      <TextField label="پاسخ مرکز" name="response" required data-testid="appeal-response-text" />
      <label className="flex items-center gap-sm text-body-sm">
        <input
          type="checkbox"
          name="correct"
          checked={correct}
          onChange={() => setCorrect((value) => !value)}
          className="size-[var(--size-selection-md)]"
          data-testid="appeal-correct-toggle"
        />
        نتیجه اصلاحی به‌صورت نسخه جدید ثبت شود
      </label>
      {correct ? (
        <TextField label="یادداشت فنی نتیجه اصلاحی" name="correctionNote" data-testid="appeal-correction-note" />
      ) : null}
      <Button type="submit" block disabled={pending} data-testid="submit-appeal-answer">
        {pending ? 'در حال ثبت…' : 'ثبت پاسخ'}
      </Button>
    </form>
  );
}
