'use client';

import { useActionState, useState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../../../src/ui/field.tsx';
import { REASON_FA, REPORT_REASONS } from '../../../src/moderation/model.ts';
import { DELIVERY_METHODS, DELIVERY_METHOD_FA } from '../../../src/marketplace/listing-model.ts';
import {
  canGiveReason,
  CANCELLATION_REASONS,
  CANCELLATION_REASON_FA,
  DISPUTE_SCOPES,
  DISPUTE_SCOPE_FA,
  OUT_OF_SCOPE_FA,
} from '../../../src/marketplace/cancellation-model.ts';
import {
  acceptInquiryAction,
  addDisputeEvidenceAction,
  cancelDealAction,
  confirmHandoverAction,
  endHandoverAction,
  enterHandoverCodeAction,
  issueHandoverCodeAction,
  openDisputeAction,
  scheduleHandoverAction,
  withdrawDisputeAction,
  blockThreadAction,
  closeInquiryAction,
  createInquiryAction,
  payDepositAction,
  postMessageAction,
  proposeHandoverAction,
  proposeOfferAction,
  reportMessageAction,
  respondToHandoverAction,
  respondToOfferAction,
  type InquiryFormState,
} from './actions.ts';

const EMPTY: InquiryFormState = {};

function Result({ state }: { state: InquiryFormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />;
}

/**
 * Ask to buy — the form on a public advert.
 *
 * A negotiable advert may be opened with a first offer; an exact-price one
 * takes the price from the advert, so there is nothing to type.
 */
export function AskToBuyForm({ listingId, negotiable }: { listingId: string; negotiable: boolean }) {
  const [state, submit, pending] = useActionState(createInquiryAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">درخواست خرید</h2>
      <form action={submit} className="mt-lg space-y-md" data-testid="ask-to-buy">
        <input type="hidden" name="listingId" value={listingId} />
        <Result state={state} />
        <TextAreaField
          label="پیام شما به فروشنده"
          name="message"
          rows={3}
          hint="تا پیش از پرداخت بیعانه، شماره تماس و شماره کارت در گفت‌وگو رد و بدل نمی‌شود."
          data-testid="inquiry-message"
        />
        {negotiable ? (
          <TextField
            label="پیشنهاد قیمت شما (تومان)"
            name="offerToman"
            ltr
            inputMode="numeric"
            hint="اختیاری. با رقم انگلیسی و بدون جداکننده."
            data-testid="inquiry-offer"
          />
        ) : null}
        <Button type="submit" disabled={pending} data-testid="ask-to-buy-submit">
          {pending ? 'در حال ثبت…' : 'ثبت درخواست خرید'}
        </Button>
      </form>
    </Card>
  );
}

export function OfferForm({ inquiryId }: { inquiryId: string }) {
  const [state, submit, pending] = useActionState(proposeOfferAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="offer-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <TextField label="پیشنهاد قیمت (تومان)" name="amountToman" ltr inputMode="numeric" required data-testid="offer-amount" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="offer-submit">
        {pending ? 'در حال ثبت…' : 'ثبت پیشنهاد'}
      </Button>
    </form>
  );
}

export function OfferAnswerForm({ inquiryId, offerId }: { inquiryId: string; offerId: string }) {
  const [state, submit, pending] = useActionState(respondToOfferAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="offer-answer">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="offerId" value={offerId} />
      <Result state={state} />
      <div className="flex gap-sm">
        <Button type="submit" name="answer" value="ACCEPT" disabled={pending} data-testid="offer-accept">
          پذیرش این قیمت
        </Button>
        <Button type="submit" name="answer" value="REJECT" tone="secondary" disabled={pending} data-testid="offer-reject">
          رد پیشنهاد
        </Button>
      </div>
    </form>
  );
}

export function AcceptInquiryForm({
  inquiryId,
  listingId,
  version,
}: {
  inquiryId: string;
  listingId: string;
  version: number;
}) {
  const [state, submit, pending] = useActionState(acceptInquiryAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'accept-inquiry-' + inquiryId}>
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} />
      <Button type="submit" disabled={pending} data-testid={'accept-inquiry-button-' + inquiryId}>
        {pending ? 'در حال ثبت…' : 'پذیرش این خریدار'}
      </Button>
    </form>
  );
}

export function CloseInquiryForm({
  inquiryId,
  listingId,
  version,
  to,
  label,
}: {
  inquiryId: string;
  listingId: string;
  version: number;
  to: 'DECLINED' | 'WITHDRAWN';
  label: string;
}) {
  const [state, submit, pending] = useActionState(closeInquiryAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'close-inquiry-' + to.toLowerCase()}>
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="to" value={to} />
      <Result state={state} />
      <TextField label="دلیل (اختیاری)" name="reason" data-testid={'close-reason-' + to.toLowerCase()} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'close-inquiry-button-' + to.toLowerCase()}>
        {pending ? 'در حال ثبت…' : label}
      </Button>
    </form>
  );
}

/** The deposit. The amount is read on the server; this form carries no figure. */
export function PayDepositForm({ inquiryId, amountFa }: { inquiryId: string; amountFa: string }) {
  const [state, submit, pending] = useActionState(payDepositAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="pay-deposit">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <Button type="submit" disabled={pending} data-testid="pay-deposit-button">
        {pending ? 'در حال انتقال به درگاه…' : 'پرداخت بیعانه ' + amountFa + ' تومان'}
      </Button>
    </form>
  );
}

export function MessageForm({ inquiryId }: { inquiryId: string }) {
  const [state, submit, pending] = useActionState(postMessageAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="message-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <TextAreaField label="پیام تازه" name="body" rows={3} data-testid="message-body" />
      <FileField
        label="پیوست (تصویر یا PDF)"
        name="attachment"
        accept="image/jpeg,image/png,application/pdf"
        maxBytes={10 * 1024 * 1024}
        testId="message-attachment"
      />
      <Button type="submit" disabled={pending} data-testid="message-submit">
        {pending ? 'در حال ارسال…' : 'ارسال پیام'}
      </Button>
    </form>
  );
}

export function HandoverForm({ inquiryId }: { inquiryId: string }) {
  const [state, submit, pending] = useActionState(proposeHandoverAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="handover-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <SelectField
        label="روش تحویل"
        name="method"
        required
        options={DELIVERY_METHODS.map((value) => ({ value, label: DELIVERY_METHOD_FA[value] }))}
        data-testid="handover-method"
      />
      <TextField label="زمان پیشنهادی" name="proposedAt" type="datetime-local" required ltr data-testid="handover-at" />
      <TextField label="محل تحویل" name="place" data-testid="handover-place" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="handover-submit">
        {pending ? 'در حال ثبت…' : 'پیشنهاد زمان و محل تحویل'}
      </Button>
    </form>
  );
}

export function HandoverAnswerForm({ inquiryId, proposalId }: { inquiryId: string; proposalId: string }) {
  const [state, submit, pending] = useActionState(respondToHandoverAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="handover-answer">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="proposalId" value={proposalId} />
      <Result state={state} />
      <div className="flex gap-sm">
        <Button type="submit" name="answer" value="ACCEPT" disabled={pending} data-testid="handover-accept">
          پذیرش
        </Button>
        <Button type="submit" name="answer" value="REJECT" tone="secondary" disabled={pending} data-testid="handover-reject">
          رد
        </Button>
      </div>
    </form>
  );
}

export function BlockThreadForm({ inquiryId }: { inquiryId: string }) {
  const [state, submit, pending] = useActionState(blockThreadAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="block-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <TextField label="دلیل بستن گفت‌وگو" name="reason" required data-testid="block-reason" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="block-submit">
        {pending ? 'در حال ثبت…' : 'بستن گفت‌وگو'}
      </Button>
    </form>
  );
}

export function ReportMessageForm({ inquiryId, messages }: { inquiryId: string; messages: readonly { id: string; label: string }[] }) {
  const [state, submit, pending] = useActionState(reportMessageAction, EMPTY);
  if (messages.length === 0) return null;
  return (
    <form action={submit} className="space-y-sm" data-testid="report-message-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <SelectField
        label="کدام پیام"
        name="messageId"
        required
        options={messages.map((message) => ({ value: message.id, label: message.label }))}
        data-testid="report-message-id"
      />
      <SelectField
        label="دلیل گزارش"
        name="reason"
        required
        options={REPORT_REASONS.map((value) => ({ value, label: REASON_FA[value] }))}
        data-testid="report-message-reason"
      />
      <TextAreaField label="توضیح" name="details" rows={2} data-testid="report-message-details" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="report-message-submit">
        {pending ? 'در حال ثبت…' : 'گزارش پیام به ناظر'}
      </Button>
    </form>
  );
}

// ── after the deposit (PROMPT-006) ────────────────────────────────────────

/**
 * Cancel a reserved deal.
 *
 * The form carries a reason and, for the reasons that are claims, the account
 * of what happened. It never carries an amount: what the cancellation costs is
 * decided on the server from the policy frozen on this deal.
 */
export function CancelDealForm({ inquiryId, party }: { inquiryId: string; party: 'BUYER' | 'SELLER' }) {
  const [state, submit, pending] = useActionState(cancelDealAction, EMPTY);
  const reasons = CANCELLATION_REASONS.filter((reason) => canGiveReason(reason, party));
  return (
    <form action={submit} className="space-y-sm" data-testid="cancel-deal-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <SelectField
        label="دلیل لغو"
        name="reason"
        required
        options={reasons.map((value) => ({ value, label: CANCELLATION_REASON_FA[value] }))}
        data-testid="cancel-reason"
      />
      <TextAreaField
        label="شرح ماجرا"
        name="statement"
        rows={3}
        hint="برای دلیل‌هایی که ادعا درباره حیوان، آگهی یا جلسه تحویل‌اند، این شرح لازم است و داور بر اساس آن تصمیم می‌گیرد."
        data-testid="cancel-statement"
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="cancel-deal-submit">
        {pending ? 'در حال ثبت…' : 'لغو معامله'}
      </Button>
    </form>
  );
}

export function OpenDisputeForm({ inquiryId }: { inquiryId: string }) {
  const [state, submit, pending] = useActionState(openDisputeAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="open-dispute-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <SelectField
        label="موضوع اختلاف"
        name="scope"
        required
        options={DISPUTE_SCOPES.map((value) => ({ value, label: DISPUTE_SCOPE_FA[value] }))}
        data-testid="dispute-scope"
      />
      <TextAreaField label="شرح ادعا" name="claim" rows={4} required data-testid="dispute-claim" />
      <p className="text-caption text-text-secondary" data-testid="dispute-scope-note">
        {OUT_OF_SCOPE_FA}
      </p>
      <Button type="submit" tone="secondary" disabled={pending} data-testid="open-dispute-submit">
        {pending ? 'در حال ثبت…' : 'باز کردن پرونده اختلاف'}
      </Button>
    </form>
  );
}

export function DisputeEvidenceForm({ inquiryId, disputeId }: { inquiryId: string; disputeId: string }) {
  const [state, submit, pending] = useActionState(addDisputeEvidenceAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="dispute-evidence-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="disputeId" value={disputeId} />
      <Result state={state} />
      <TextAreaField label="توضیح" name="note" rows={2} data-testid="evidence-note" />
      <FileField
        label="مدرک (تصویر یا PDF)"
        name="evidence"
        accept="image/jpeg,image/png,application/pdf"
        maxBytes={10 * 1024 * 1024}
        testId="evidence-file"
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="evidence-submit">
        {pending ? 'در حال افزودن…' : 'افزودن مدرک'}
      </Button>
    </form>
  );
}

export function WithdrawDisputeForm({ inquiryId, disputeId }: { inquiryId: string; disputeId: string }) {
  const [state, submit, pending] = useActionState(withdrawDisputeAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="withdraw-dispute-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="disputeId" value={disputeId} />
      <Result state={state} />
      <TextField label="دلیل پس‌گرفتن" name="reason" required data-testid="withdraw-reason" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="withdraw-dispute-submit">
        {pending ? 'در حال ثبت…' : 'پس‌گرفتن پرونده'}
      </Button>
    </form>
  );
}

// ── the handover (PROMPT-007) ─────────────────────────────────────────────

/**
 * Arrange the meeting.
 *
 * The method list is what this seller actually declared on the advert, so a
 * buyer cannot choose a way of handing over that was never offered.
 */
export function ScheduleHandoverForm({
  inquiryId,
  methods,
  locations,
}: {
  inquiryId: string;
  methods: readonly string[];
  locations: readonly { value: string; label: string }[];
}) {
  const [state, submit, pending] = useActionState(scheduleHandoverAction, EMPTY);
  const [method, setMethod] = useState(methods[0] ?? '');
  return (
    <form action={submit} className="space-y-sm" data-testid="schedule-handover-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <SelectField
        label="روش تحویل"
        name="method"
        required
        defaultValue={methods[0]}
        onChange={(event) => setMethod(event.target.value)}
        options={methods.map((value) => ({
          value,
          label: DELIVERY_METHOD_FA[value as keyof typeof DELIVERY_METHOD_FA] ?? value,
        }))}
        data-testid="schedule-method"
      />
      {method === 'VET_CLINIC' ? (
        <>
          <SelectField
            label="مرکز دامپزشکی محل تحویل"
            name="vetLocationId"
            required
            options={locations}
            data-testid="schedule-location"
          />
          <p className="text-caption text-text-secondary" data-testid="schedule-location-note">
            انتخاب یک مرکز فقط محل قرار را مشخص می‌کند. این انتخاب به معنی معاینه، تأیید سلامت یا تأیید
            حیوان از سوی آن مرکز نیست.
          </p>
        </>
      ) : null}
      <TextField label="زمان تحویل" name="scheduledAt" type="datetime-local" required ltr data-testid="schedule-at" />
      <TextField label="نشانی یا توضیح محل" name="place" data-testid="schedule-place" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="schedule-handover-submit">
        {pending ? 'در حال ثبت…' : 'ثبت زمان و محل تحویل'}
      </Button>
    </form>
  );
}

/** The buyer takes the code, reads it once, and says it at the handover. */
export function IssueHandoverCodeForm({ inquiryId }: { inquiryId: string }) {
  const [state, submit, pending] = useActionState(issueHandoverCodeAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="issue-code-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      {state.message ? (
        <div data-testid="issued-code">
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        </div>
      ) : null}
      <Button type="submit" disabled={pending} data-testid="issue-code-submit">
        {pending ? 'در حال صدور…' : 'گرفتن کد تحویل'}
      </Button>
      <p className="text-caption text-text-secondary">
        کد فقط همین یک بار نشان داده می‌شود و در اعلان یا تاریخچه ثبت نمی‌شود. آن را جز هنگام تحویل به
        کسی نگویید.
      </p>
    </form>
  );
}

export function EnterHandoverCodeForm({ inquiryId }: { inquiryId: string }) {
  const [state, submit, pending] = useActionState(enterHandoverCodeAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="enter-code-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Result state={state} />
      <TextField
        label="کد تحویل خریدار"
        name="code"
        required
        ltr
        inputMode="numeric"
        hint="کد شش‌رقمی را هنگام تحویل از خریدار بپرسید."
        data-testid="handover-code"
      />
      <Button type="submit" disabled={pending} data-testid="enter-code-submit">
        {pending ? 'در حال بررسی…' : 'ثبت کد تحویل'}
      </Button>
    </form>
  );
}

/** The buyer's own confirmation: the only thing that moves the ownership. */
export function ConfirmHandoverForm({
  inquiryId,
  version,
  statementFa,
}: {
  inquiryId: string;
  version: number;
  statementFa: string;
}) {
  const [state, submit, pending] = useActionState(confirmHandoverAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="confirm-handover-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} />
      <pre
        className="hz-rail whitespace-pre-wrap rounded-md border border-border-subtle p-md text-body-sm"
        data-testid="handover-statement"
      >
        {statementFa}
      </pre>
      <Button type="submit" disabled={pending} data-testid="confirm-handover-submit">
        {pending ? 'در حال ثبت…' : 'تأیید تحویل و انتقال مالکیت'}
      </Button>
    </form>
  );
}

export function EndHandoverForm({
  inquiryId,
  to,
  label,
}: {
  inquiryId: string;
  to: 'REFUSED' | 'CANCELLED';
  label: string;
}) {
  const [state, submit, pending] = useActionState(endHandoverAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'end-handover-' + to.toLowerCase()}>
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="to" value={to} />
      <Result state={state} />
      <TextField label="دلیل" name="reason" required data-testid={'end-handover-reason-' + to.toLowerCase()} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'end-handover-submit-' + to.toLowerCase()}>
        {pending ? 'در حال ثبت…' : label}
      </Button>
    </form>
  );
}
