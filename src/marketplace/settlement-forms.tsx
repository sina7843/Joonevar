'use client';

/**
 * The operational forms of PROMPT-006 — refunds, arbitration, commission rules.
 *
 * Client components, so they import the vocabulary from the pure model rather
 * than from the services that reach the database and the file system.
 */
import { useActionState, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import {
  DISPUTE_DECISIONS,
  DISPUTE_DECISION_FA,
} from './cancellation-model.ts';
import {
  decideDisputeAction,
  executeRefundAction,
  publishCommissionRuleAction,
  recordHandoverAction,
  recordManualRefundAction,
  releaseHoldAction,
  reviewerEvidenceAction,
  type SettlementState,
} from '../../app/market/settlement-actions.ts';

const EMPTY: SettlementState = {};

function Result({ state, testId }: { state: SettlementState; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

/** Try the gateway again. Disabled once a refund needs a person, not a loop. */
export function RetryRefundForm({ refundId, retryable }: { refundId: string; retryable: boolean }) {
  const [state, submit, pending] = useActionState(executeRefundAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'retry-refund-' + refundId}>
      <input type="hidden" name="refundId" value={refundId} />
      <Result state={state} testId={'retry-refund-result-' + refundId} />
      <Button
        type="submit"
        tone="secondary"
        disabled={pending || !retryable}
        data-testid={'retry-refund-button-' + refundId}
      >
        {pending ? 'در حال اجرا…' : 'اجرای استرداد از درگاه'}
      </Button>
    </form>
  );
}

export function ManualRefundForm({ refundId }: { refundId: string }) {
  const [state, submit, pending] = useActionState(recordManualRefundAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-sm" data-testid={'manual-refund-' + refundId}>
      <input type="hidden" name="refundId" value={refundId} />
      <Result state={state} testId={'manual-refund-result-' + refundId} />
      <TextField
        label="شماره پیگیری بانکی"
        name="bankReference"
        required
        ltr
        hint="بدون شماره پیگیری، استرداد پرداخت‌شده ثبت نمی‌شود."
        data-testid={'manual-refund-ref-' + refundId}
      />
      <TextAreaField label="توضیح" name="note" rows={2} required data-testid={'manual-refund-note-' + refundId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'manual-refund-submit-' + refundId}>
        {pending ? 'در حال ثبت…' : 'ثبت استرداد دستی'}
      </Button>
    </form>
  );
}

/**
 * Decide one case.
 *
 * The amount field appears only for a decision that returns part of the
 * deposit; every other decision has nothing to enter, because what it returns
 * follows from the decision itself.
 */
export function DisputeDecisionForm({
  disputeId,
  version,
  depositFa,
}: {
  disputeId: string;
  version: number;
  depositFa: string;
}) {
  const [state, submit, pending] = useActionState(decideDisputeAction, EMPTY);
  const [decision, setDecision] = useState('BUYER_FAVOURED');
  return (
    <form action={submit} className="mt-md space-y-sm" data-testid={'dispute-decision-' + disputeId}>
      <input type="hidden" name="disputeId" value={disputeId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} testId={'dispute-decision-result-' + disputeId} />
      <SelectField
        label="رأی"
        name="decision"
        required
        defaultValue="BUYER_FAVOURED"
        onChange={(event) => setDecision(event.target.value)}
        options={DISPUTE_DECISIONS.map((value) => ({ value, label: DISPUTE_DECISION_FA[value] }))}
        data-testid={'dispute-decision-select-' + disputeId}
      />
      {decision === 'BUYER_FAVOURED' ? (
        <TextField
          label={'مبلغ استرداد (تومان) — بیعانه این معامله ' + depositFa + ' تومان بود'}
          name="refundToman"
          ltr
          inputMode="numeric"
          hint="خالی بگذارید تا کل بیعانه مسترد شود. بیشتر از بیعانه پذیرفته نمی‌شود."
          data-testid={'dispute-refund-amount-' + disputeId}
        />
      ) : null}
      <TextAreaField label="دلیل رأی" name="reason" rows={3} required data-testid={'dispute-reason-' + disputeId} />
      <Button type="submit" disabled={pending} data-testid={'dispute-decide-' + disputeId}>
        {pending ? 'در حال ثبت…' : 'ثبت رأی'}
      </Button>
    </form>
  );
}

export function ReviewerNoteForm({ disputeId }: { disputeId: string }) {
  const [state, submit, pending] = useActionState(reviewerEvidenceAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-sm" data-testid={'reviewer-note-' + disputeId}>
      <input type="hidden" name="disputeId" value={disputeId} />
      <Result state={state} testId={'reviewer-note-result-' + disputeId} />
      <TextAreaField label="یادداشت بررسی" name="note" rows={2} data-testid={'reviewer-note-text-' + disputeId} />
      <FileField
        label="مدرک"
        name="evidence"
        accept="image/jpeg,image/png,application/pdf"
        maxBytes={10 * 1024 * 1024}
        data-testid={'reviewer-note-file-' + disputeId}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'reviewer-note-submit-' + disputeId}>
        {pending ? 'در حال ثبت…' : 'ثبت یادداشت'}
      </Button>
    </form>
  );
}

/** Publish a formula. Nothing here has a default value. */
export function CommissionRuleForm({ speciesOptions }: { speciesOptions: readonly { value: string; label: string }[] }) {
  const [state, submit, pending] = useActionState(publishCommissionRuleAction, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="commission-rule-form">
      <Result state={state} testId="commission-rule-result" />
      <SelectField label="گونه" name="speciesCode" required options={speciesOptions} data-testid="rule-species" />
      <SelectField
        label="نوع فروشنده"
        name="sellerKind"
        placeholder="همه فروشندگان این گونه"
        options={[
          { value: 'OWNER', label: 'مالک' },
          { value: 'KENNEL', label: 'کنل' },
        ]}
        data-testid="rule-seller-kind"
      />
      <TextField label="بخش ثابت کارمزد (تومان)" name="fixedToman" required ltr inputMode="numeric" data-testid="rule-fixed" />
      <TextField
        label="بخش درصدی (basis point)"
        name="percentBp"
        required
        ltr
        inputMode="numeric"
        hint="۱۰۰ یعنی یک درصد و ۱۰۰۰۰ یعنی صد درصد."
        data-testid="rule-percent"
      />
      <TextField label="کف کارمزد (تومان)" name="minToman" ltr inputMode="numeric" data-testid="rule-min" />
      <TextField label="سقف کارمزد (تومان)" name="maxToman" ltr inputMode="numeric" data-testid="rule-max" />
      <TextAreaField label="توضیح این نسخه" name="note" rows={2} required data-testid="rule-note" />
      <Button type="submit" disabled={pending} data-testid="rule-publish">
        {pending ? 'در حال انتشار…' : 'انتشار نسخه تازه'}
      </Button>
    </form>
  );
}

/**
 * Administrative recovery of one handover — PROMPT-007.
 *
 * Two separate actions, because they mean different things: releasing a hold
 * lets the two people meet again, while recording a handover asserts that the
 * meeting already happened. The second needs a reason and is written onto the
 * ownership transfer itself.
 */
export function HandoverRecoveryForm({
  inquiryId,
  version,
  canRelease,
  canRecord,
}: {
  inquiryId: string;
  version: number;
  canRelease: boolean;
  canRecord: boolean;
}) {
  const [recordState, recordSubmit, recording] = useActionState(recordHandoverAction, EMPTY);
  const [releaseState, releaseSubmit, releasing] = useActionState(releaseHoldAction, EMPTY);
  return (
    <div className="mt-md space-y-lg">
      {canRelease ? (
        <form action={releaseSubmit} className="space-y-sm" data-testid={'release-hold-' + inquiryId}>
          <input type="hidden" name="inquiryId" value={inquiryId} />
          <Result state={releaseState} testId={'release-hold-result-' + inquiryId} />
          <TextField label="دلیل رفع توقف" name="reason" required data-testid={'release-reason-' + inquiryId} />
          <Button type="submit" tone="secondary" disabled={releasing} data-testid={'release-hold-submit-' + inquiryId}>
            {releasing ? 'در حال ثبت…' : 'رفع توقف تحویل'}
          </Button>
        </form>
      ) : null}
      {canRecord ? (
        <form action={recordSubmit} className="space-y-sm" data-testid={'record-handover-' + inquiryId}>
          <input type="hidden" name="inquiryId" value={inquiryId} />
          <input type="hidden" name="version" value={version} />
          <Result state={recordState} testId={'record-handover-result-' + inquiryId} />
          <TextAreaField
            label="دلیل ثبت دستی تحویل"
            name="reason"
            rows={2}
            required
            data-testid={'record-reason-' + inquiryId}
          />
          <p className="text-caption text-text-secondary">
            ثبت دستی فقط کد یک‌بارمصرف را کنار می‌گذارد؛ همه شرط‌های انتقال دوباره بررسی می‌شوند و نام
            ثبت‌کننده روی انتقال مالکیت می‌ماند.
          </p>
          <Button type="submit" disabled={recording} data-testid={'record-handover-submit-' + inquiryId}>
            {recording ? 'در حال ثبت…' : 'ثبت تحویل و انتقال مالکیت'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
