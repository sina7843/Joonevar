'use client';

import { useActionState, useState } from 'react';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../src/ui/field.tsx';
import { DecisionForm } from '../../src/ui/decision.tsx';
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
  return (
    <DecisionForm
      action={reviewReceiptAction}
      hidden={{ receiptId, version }}
      formTestId="receipt-review-form"
      submitTestId="submit-receipt-review"
      reasonName="reason"
      reasonTestId="receipt-review-reason"
      reasonFor={['NEEDS_CORRECTION', 'REJECTED']}
      reasonLabel={(value) => (value === 'REJECTED' ? 'دلیل رد' : 'دلیل اصلاح')}
      audience="به پرداخت‌کننده نمایش داده می‌شود"
      drafts={['تصویر فیش خوانا نیست', 'مبلغ فیش با هزینه مطابقت ندارد']}
      choices={[
        { value: 'APPROVED', label: 'تأیید فیش', desc: 'دستور ارسال نمونه‌های این فیش برای دامپزشک نگهدارنده صادر می‌شود.', testId: 'receipt-decision-APPROVED' },
        { value: 'NEEDS_CORRECTION', label: 'نیازمند اصلاح', desc: 'فیش با دلیل به پرداخت‌کننده برمی‌گردد.', testId: 'receipt-decision-NEEDS_CORRECTION' },
        { value: 'REJECTED', label: 'رد فیش', desc: 'فیش با دلیل بسته می‌شود.', testId: 'receipt-decision-REJECTED' },
      ]}
    />
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
      <TextField label="کد DNA (اختیاری)" name="note" data-testid="result-note" />
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
        <TextField label="کد DNA نتیجه اصلاحی" name="correctionNote" data-testid="appeal-correction-note" />
      ) : null}
      <Button type="submit" block disabled={pending} data-testid="submit-appeal-answer">
        {pending ? 'در حال ثبت…' : 'ثبت پاسخ'}
      </Button>
    </form>
  );
}
