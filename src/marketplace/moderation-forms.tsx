'use client';

import { useActionState, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { SelectField, TextAreaField } from '../ui/field.tsx';
import { REASON_FA, REPORT_REASONS } from '../moderation/model.ts';
import { MARKET_REPORT_TARGETS, MARKET_TARGET_FA, LISTING_DECISION_FA } from './moderation-model.ts';
import {
  decideAppealAction,
  decideListingReportsAction,
  decideMessageReportAction,
  submitAppealAction,
  submitMarketReportAction,
  type MarketModerationState,
} from '../../app/market/moderation-actions.ts';

const EMPTY: MarketModerationState = {};

/**
 * Reporting an advert, one of its pictures, or its seller.
 *
 * The three subjects are separate because the answer is: a misleading photo is
 * not a dishonest seller, and a moderator should be able to act on the smallest
 * thing that is actually wrong.
 */
export function MarketReportForm({
  listingId,
  media,
}: {
  listingId: string;
  media: readonly { id: string; altFa: string; kind: string }[];
}) {
  const [state, submit, pending] = useActionState(submitMarketReportAction, EMPTY);
  const [target, setTarget] = useState<string>('ANIMAL_LISTING');

  return (
    <form action={submit} className="space-y-lg" data-testid="market-report-form">
      <input type="hidden" name="listingId" value={listingId} />
      {state.message ? (
        <div data-testid="market-report-result">
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        </div>
      ) : null}

      <SelectField
        label="موضوع گزارش"
        name="target"
        required
        defaultValue="ANIMAL_LISTING"
        onChange={(event) => setTarget(event.target.value)}
        options={MARKET_REPORT_TARGETS.map((value) => ({ value, label: MARKET_TARGET_FA[value] }))}
        data-testid="report-target"
      />

      {target === 'LISTING_MEDIA' ? (
        <SelectField
          label="کدام رسانه"
          name="mediaId"
          required
          options={media.map((item) => ({
            value: item.id,
            label: (item.kind === 'VIDEO' ? 'ویدئو — ' : 'تصویر — ') + item.altFa,
          }))}
          data-testid="report-media"
        />
      ) : null}

      <SelectField
        label="دلیل"
        name="reason"
        required
        options={REPORT_REASONS.map((value) => ({ value, label: REASON_FA[value] }))}
        data-testid="report-reason"
      />
      <TextAreaField
        label="توضیح"
        name="details"
        rows={4}
        hint="برای «دلیل دیگر» نوشتن توضیح لازم است."
        data-testid="report-details"
      />
      <Button type="submit" disabled={pending} data-testid="submit-market-report">
        {pending ? 'در حال ثبت…' : 'ثبت گزارش'}
      </Button>
    </form>
  );
}

/** One decision, closing every open report about the same advert. */
export function ListingDecisionForm({
  listingId,
  listingVersion,
}: {
  listingId: string;
  listingVersion: number;
}) {
  const [state, submit, pending] = useActionState(decideListingReportsAction, EMPTY);
  const [decision, setDecision] = useState('DISMISS');

  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'decision-form-' + listingId}>
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="listingVersion" value={listingVersion} />
      {state.message ? (
        <div data-testid={'decision-result-' + listingId}>
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        </div>
      ) : null}
      <SelectField
        label="تصمیم"
        name="decision"
        required
        defaultValue="DISMISS"
        onChange={(event) => setDecision(event.target.value)}
        options={(Object.keys(LISTING_DECISION_FA) as Array<keyof typeof LISTING_DECISION_FA>).map((value) => ({
          value,
          label: LISTING_DECISION_FA[value],
        }))}
        data-testid={'decision-' + listingId}
      />
      {decision === 'RESTRICT_PUBLISHER' ? (
        <p className="text-caption text-text-secondary">
          محدودیت فروشنده همه آگهی‌های او را از دید عمومی خارج می‌کند؛ هیچ رکوردی حذف نمی‌شود.
        </p>
      ) : null}
      <TextAreaField
        label="دلیل"
        name="reason"
        rows={2}
        required
        data-testid={'decision-reason-' + listingId}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'save-decision-' + listingId}>
        {pending ? 'در حال ثبت…' : 'ثبت تصمیم'}
      </Button>
    </form>
  );
}

/** The seller's objection to a decision. */
export function AppealForm({ reportId }: { reportId: string }) {
  const [state, submit, pending] = useActionState(submitAppealAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'appeal-form-' + reportId}>
      <input type="hidden" name="reportId" value={reportId} />
      {state.message ? (
        <div data-testid={'appeal-result-' + reportId}>
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        </div>
      ) : null}
      <TextAreaField label="توضیح اعتراض" name="statement" rows={3} required data-testid={'appeal-statement-' + reportId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'submit-appeal-' + reportId}>
        {pending ? 'در حال ثبت…' : 'ثبت اعتراض'}
      </Button>
    </form>
  );
}

/** Answering an appeal: uphold the decision, or reverse it and restore the advert. */
export function AppealDecisionForm({ appealId }: { appealId: string }) {
  const [state, submit, pending] = useActionState(decideAppealAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'appeal-decision-form-' + appealId}>
      <input type="hidden" name="appealId" value={appealId} />
      {state.message ? (
        <div data-testid={'appeal-decision-result-' + appealId}>
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        </div>
      ) : null}
      <SelectField
        label="پاسخ"
        name="outcome"
        required
        options={[
          { value: 'UPHOLD', label: 'تصمیم قبلی پابرجاست' },
          { value: 'OVERTURN', label: 'اعتراض پذیرفته می‌شود' },
        ]}
        data-testid={'appeal-outcome-' + appealId}
      />
      <TextAreaField label="دلیل" name="reason" rows={2} required data-testid={'appeal-decision-reason-' + appealId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'save-appeal-' + appealId}>
        {pending ? 'در حال ثبت…' : 'ثبت پاسخ'}
      </Button>
    </form>
  );
}

/**
 * Decide one reported chat message — PROMPT-005.
 *
 * Two outcomes only. There is no listing to suspend here and no publisher to
 * restrict from one message: a seller whose behaviour is the problem is
 * reported as a seller, which is a different subject with a different answer.
 */
export function MessageDecisionForm({ reportId }: { reportId: string }) {
  const [state, submit, pending] = useActionState(decideMessageReportAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'message-decision-' + reportId}>
      <input type="hidden" name="reportId" value={reportId} />
      {state.message ? (
        <div data-testid={'message-decision-result-' + reportId}>
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        </div>
      ) : null}
      <SelectField
        label="تصمیم"
        name="decision"
        required
        defaultValue="DISMISS"
        options={[
          { value: 'DISMISS', label: 'رد گزارش' },
          { value: 'HIDE', label: 'پنهان‌کردن پیام برای طرفین' },
        ]}
        data-testid={'message-decision-select-' + reportId}
      />
      <p className="text-caption text-text-secondary">
        پنهان‌کردن پیام آن را حذف نمی‌کند؛ متن برای بررسی اختلاف و در تاریخچه باقی می‌ماند.
      </p>
      <TextAreaField label="دلیل" name="reason" rows={2} required data-testid={'message-decision-reason-' + reportId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'save-message-decision-' + reportId}>
        {pending ? 'در حال ثبت…' : 'ثبت تصمیم'}
      </Button>
    </form>
  );
}
