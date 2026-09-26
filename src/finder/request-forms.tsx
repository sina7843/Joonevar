'use client';

import { useActionState, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Check, Result, submitWith } from '../vets/directory-forms.tsx';
import {
  acceptTermsAction,
  blockAction,
  cancelContractAction,
  cancelRequestAction,
  confirmContractAction,
  consentAction,
  createRequestAction,
  editContractAction,
  handoffAction,
  markNotCompletedAction,
  postMessageAction,
  proposeTermsAction,
  publishTemplateAction,
  reportMessageAction,
  requestCodeAction,
  respondAction,
  startContractAction,
  type RequestFormState,
} from './request-actions.ts';

const EMPTY: RequestFormState = {};
type Opt = ReadonlyArray<{ value: string; label: string }>;

const ROUTES: Opt = [
  { value: 'PERSONAL', label: 'مسیر شخصی' },
  { value: 'OFFICIAL', label: 'مسیر رسمی (مجوز انجمن، هر دو حیوان شجره‌نامه لازم دارند)' },
];
const PLACES: Opt = [
  { value: 'SIRE_OWNER', label: 'نزد مالک نر' },
  { value: 'DAM_OWNER', label: 'نزد مالک ماده' },
  { value: 'NEUTRAL', label: 'محل بی‌طرف' },
];
const FINANCIAL: Opt = [
  { value: 'FIXED_AMOUNT', label: 'مبلغ ثابت' },
  { value: 'OFFSPRING_SHARE', label: 'سهم توله' },
  { value: 'MIXED', label: 'ترکیب مبلغ و سهم توله' },
  { value: 'NO_PAYMENT', label: 'بدون وجه' },
  { value: 'PRIVATE_DETAILS', label: 'جزئیات مالی خصوصی' },
];

export interface TermsDefaults {
  readonly route: string;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly cityFa: string;
  readonly placeCategory: string;
  readonly financialCategory: string;
  readonly specialConditionsFa: string;
}

function TermsFields({ d }: { d: TermsDefaults }) {
  return (
    <>
      <SelectField label="مسیر" name="route" required options={ROUTES} defaultValue={d.route} data-testid="req-route" />
      <SelectField label="نوع توافق مالی" name="financialCategory" required options={FINANCIAL} defaultValue={d.financialCategory} data-testid="req-financial" />
      <TextField label="از تاریخ" name="windowFrom" type="date" required ltr defaultValue={d.windowFrom} data-testid="req-from" />
      <TextField label="تا تاریخ" name="windowTo" type="date" required ltr defaultValue={d.windowTo} data-testid="req-to" />
      <TextField label="شهر" name="cityFa" required maxLength={60} defaultValue={d.cityFa} data-testid="req-city" />
      <SelectField label="محل" name="placeCategory" required options={PLACES} defaultValue={d.placeCategory} data-testid="req-place" />
      <div className="sm:col-span-2">
        <TextAreaField label="شرایط ویژه (اختیاری)" name="specialConditionsFa" rows={2} maxLength={1000} defaultValue={d.specialConditionsFa} />
      </div>
    </>
  );
}

export function CreateRequestForm({ profileId, myAnimals, maxDays, defaults }: { profileId: string; myAnimals: Opt; maxDays: number; defaults: TermsDefaults }) {
  const [state, submit, pending] = useActionState(createRequestAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-md sm:grid-cols-2" data-testid="finder-request-form">
      <input type="hidden" name="receiverProfileId" value={profileId} />
      <SelectField label="از طرف حیوان من" name="senderAnimalId" required options={myAnimals} data-testid="req-sender" />
      <SelectField
        label="اعتبار درخواست"
        name="expiresInDays"
        options={Array.from({ length: maxDays }, (_, i) => ({ value: String(i + 1), label: (i + 1).toLocaleString('fa-IR') + ' روز' }))}
        placeholder={'پیش‌فرض (' + maxDays.toLocaleString('fa-IR') + ' روز)'}
      />
      <TermsFields d={defaults} />
      <div className="sm:col-span-2">
        <TextAreaField label="پیام (اختیاری)" name="messageFa" rows={3} maxLength={1000} data-testid="req-message" />
      </div>
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" disabled={pending} data-testid="req-submit">
          ارسال درخواست
        </Button>
        <Result state={state} testId="req-result" />
      </div>
    </form>
  );
}

/** One small form for a command that needs only the request, its version and maybe a reason. */
export function CommandForm({
  action,
  requestId,
  version,
  label,
  reason,
  hidden,
  tone = 'secondary',
  testId,
}: {
  action: 'respond-accept' | 'respond-reject' | 'accept-terms' | 'cancel' | 'start-contract' | 'not-completed' | 'block' | 'consent-yes' | 'consent-no';
  requestId: string;
  version: number;
  label: string;
  reason?: boolean;
  hidden?: Record<string, string>;
  tone?: 'primary' | 'secondary' | 'ghost';
  testId: string;
}) {
  const fn =
    action === 'respond-accept' || action === 'respond-reject'
      ? respondAction
      : action === 'accept-terms'
        ? acceptTermsAction
        : action === 'cancel'
          ? cancelRequestAction
          : action === 'start-contract'
            ? startContractAction
            : action === 'not-completed'
              ? markNotCompletedAction
              : action === 'block'
                ? blockAction
                : consentAction;
  const [state, submit, pending] = useActionState(fn, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="flex flex-wrap items-end gap-sm" data-testid={'form-' + testId}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedVersion" value={version} />
      {action === 'respond-accept' ? <input type="hidden" name="decision" value="ACCEPT" /> : null}
      {action === 'respond-reject' ? <input type="hidden" name="decision" value="REJECT" /> : null}
      {action === 'consent-yes' ? <input type="hidden" name="consent" value="true" /> : null}
      {action === 'consent-no' ? <input type="hidden" name="consent" value="false" /> : null}
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {reason ? (
        <div className="min-w-[12rem] flex-1">
          <TextField label="دلیل" name="reasonFa" required maxLength={500} data-testid={testId + '-reason'} />
        </div>
      ) : null}
      <Button type="submit" tone={tone} disabled={pending} data-testid={testId}>
        {label}
      </Button>
      <div className="w-full">
        <Result state={state} testId={testId + '-result'} />
      </div>
    </form>
  );
}

export function ProposeTermsForm({ requestId, version, defaults }: { requestId: string; version: number; defaults: TermsDefaults }) {
  const [state, submit, pending] = useActionState(proposeTermsAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-md sm:grid-cols-2" data-testid="finder-propose-form">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <TermsFields d={defaults} />
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" tone="secondary" disabled={pending} data-testid="finder-propose-submit">
          پیشنهاد شرایط تازه
        </Button>
        <Result state={state} testId="finder-propose-result" />
      </div>
    </form>
  );
}

export function MessageForm({ requestId }: { requestId: string }) {
  const [state, submit, pending] = useActionState(postMessageAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-sm" data-testid="finder-message-form">
      <input type="hidden" name="requestId" value={requestId} />
      <TextAreaField label="پیام" name="bodyFa" rows={2} maxLength={2000} data-testid="finder-message-body" />
      <FileField label="پیوست (تصویر یا PDF، اختیاری)" name="file" accept="image/jpeg,image/png,application/pdf" maxBytes={10 * 1024 * 1024} testId="finder-message-file" />
      <div className="flex flex-wrap items-center gap-md">
        <Button type="submit" disabled={pending} data-testid="finder-message-send">
          ارسال
        </Button>
        <Result state={state} testId="finder-message-result" />
      </div>
    </form>
  );
}

export function ReportMessageForm({ messageId }: { messageId: string }) {
  const [state, submit, pending] = useActionState(reportMessageAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="flex flex-wrap items-center gap-xs">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="reason" value="OFFENSIVE" />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'finder-report-message-' + messageId}>
        گزارش
      </Button>
      <Result state={state} testId={'finder-report-message-result-' + messageId} />
    </form>
  );
}

export function EditContractForm({
  requestId,
  contractId,
  number,
  financialDetailsFa,
  optional,
}: {
  requestId: string;
  contractId: string;
  number: number;
  financialDetailsFa: string | null;
  optional: ReadonlyArray<{ key: string; titleFa: string; bodyFa: string; chosen: boolean; fillFa: string | null }>;
}) {
  const [state, submit, pending] = useActionState(editContractAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm space-y-sm" data-testid="finder-contract-edit">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="expectedNumber" value={number} />
      <TextAreaField label="جزئیات مالی (فقط برای دو طرف)" name="financialDetailsFa" rows={2} maxLength={2000} defaultValue={financialDetailsFa ?? ''} data-testid="finder-contract-financial" />
      {optional.map((clause) => (
        <div key={clause.key} className="rounded-md border border-border-subtle p-sm">
          <Check name="clause" value={clause.key} label={clause.titleFa + ' (اختیاری)'} defaultChecked={clause.chosen} testId={'finder-clause-' + clause.key} />
          <p className="text-caption text-text-secondary">{clause.bodyFa}</p>
          <TextField label="تکمیل این بند" name={'fill-' + clause.key} maxLength={500} defaultValue={clause.fillFa ?? ''} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-md">
        <Button type="submit" tone="secondary" disabled={pending} data-testid="finder-contract-save">
          ثبت نسخه تازه
        </Button>
        <Result state={state} testId="finder-contract-edit-result" />
      </div>
    </form>
  );
}

/** Ask for a code, then confirm the exact version and hash shown on the page with it. */
export function ConfirmContractForm({ requestId, contractId, number, contentHash }: { requestId: string; contractId: string; number: number; contentHash: string }) {
  const [codeState, ask, asking] = useActionState(requestCodeAction, EMPTY);
  const [state, submit, pending] = useActionState(confirmContractAction, EMPTY);
  const [otpId, setOtpId] = useState<string>('');
  const current = state.otpId ?? codeState.otpId ?? otpId;
  return (
    <div className="mt-sm space-y-sm" data-testid="finder-contract-confirm">
      <form
        onSubmit={submitWith((data) => {
          ask(data);
        })}
      >
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="contractId" value={contractId} />
        <input type="hidden" name="number" value={number} />
        <Button type="submit" tone="secondary" disabled={asking} data-testid="finder-contract-code">
          دریافت کد تأیید برای نسخه {number.toLocaleString('fa-IR')}
        </Button>
        <Result state={codeState} testId="finder-contract-code-result" />
      </form>
      {current ? (
        <form
          onSubmit={submitWith((data) => {
            setOtpId(current);
            submit(data);
          })}
          className="flex flex-wrap items-end gap-sm"
        >
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="contractId" value={contractId} />
          <input type="hidden" name="number" value={number} />
          <input type="hidden" name="contentHash" value={contentHash} />
          <input type="hidden" name="otpId" value={current} />
          <div className="min-w-[10rem]">
            <TextField label="کد شش‌رقمی" name="code" required inputMode="numeric" ltr maxLength={6} autoComplete="one-time-code" data-testid="finder-contract-otp" />
          </div>
          <Button type="submit" disabled={pending} data-testid="finder-contract-approve">
            تأیید همین نسخه
          </Button>
          <div className="w-full">
            <Result state={state} testId="finder-contract-approve-result" />
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function CancelContractForm({ requestId, contractId, confirmed }: { requestId: string; contractId: string; confirmed: boolean }) {
  const [state, submit, pending] = useActionState(cancelContractAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm flex flex-wrap items-end gap-sm" data-testid="finder-contract-cancel">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="contractId" value={contractId} />
      <div className="min-w-[12rem] flex-1">
        <TextField label="دلیل لغو" name="reasonFa" required maxLength={500} data-testid="finder-contract-cancel-reason" />
      </div>
      {confirmed ? <Check name="unilateral" label="لغو یک‌طرفه (در سابقه می‌ماند و قابل گزارش است)" defaultChecked={false} testId="finder-contract-unilateral" /> : null}
      <Button type="submit" tone="ghost" disabled={pending} data-testid="finder-contract-cancel-submit">
        {confirmed ? 'درخواست لغو قرارداد' : 'لغو پیش‌نویس و درخواست'}
      </Button>
      <div className="w-full">
        <Result state={state} testId="finder-contract-cancel-result" />
      </div>
    </form>
  );
}

export function PublishTemplateForm({ expectedCurrentVersion, required }: { expectedCurrentVersion: number; required: Opt }) {
  const [state, submit, pending] = useActionState(publishTemplateAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-md" data-testid="finder-template-form">
      <input type="hidden" name="expectedCurrentVersion" value={expectedCurrentVersion} />
      <TextField label="عنوان قالب" name="titleFa" required maxLength={120} data-testid="finder-template-title" />
      {required.map((clause) => (
        <TextAreaField key={clause.value} label={'بند اجباری: ' + clause.label} name={'body-' + clause.value} rows={2} required maxLength={3000} data-testid={'finder-template-body-' + clause.value} />
      ))}
      {[1, 2, 3].map((i) => (
        <div key={i} className="grid gap-sm rounded-md border border-border-subtle p-sm sm:grid-cols-3">
          <TextField label={'بند اختیاری ' + i.toLocaleString('fa-IR') + ' — کلید لاتین'} name={'optKey-' + i} ltr maxLength={40} />
          <TextField label="عنوان" name={'optTitle-' + i} maxLength={120} />
          <TextField label="متن" name={'optBody-' + i} maxLength={3000} />
        </div>
      ))}
      <TextField label="دلیل انتشار" name="reasonFa" required maxLength={500} data-testid="finder-template-reason" />
      <div className="flex flex-wrap items-center gap-md">
        <Button type="submit" disabled={pending} data-testid="finder-template-publish">
          انتشار قالب
        </Button>
        <Result state={state} testId="finder-template-result" />
      </div>
    </form>
  );
}

/** PROMPT-006: the consequence screen's one action; the route comes from the confirmed contract, not from this form. */
export function HandoffForm({ requestId, contractId, label }: { requestId: string; contractId: string; label: string }) {
  const [state, submit, pending] = useActionState(handoffAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="finder-handoff-form">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="contractId" value={contractId} />
      <Check name="acknowledged" value="yes" label="پیامدهای این مسیر را خواندم و می‌پذیرم." defaultChecked={false} testId="finder-handoff-ack" />
      <Button type="submit" disabled={pending} data-testid="finder-handoff">
        {label}
      </Button>
      <Result state={state} testId="finder-handoff-result" />
    </form>
  );
}
