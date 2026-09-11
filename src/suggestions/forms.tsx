'use client';

import { useActionState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Check, PlacePicker, Result, submitWith, type CityOption, type Option } from '../vets/directory-forms.tsx';
import { REVIEW_DECISIONS, REVIEW_DECISION_FA } from '../vets/onboarding-model.ts';
import { CLAIM_DOCUMENT_KINDS, CLAIM_DOCUMENT_KIND_FA, SUGGESTION_KINDS, SUGGESTION_KIND_FA } from './model.ts';
import {
  appealCentreClaimAction,
  decideCentreClaimAction,
  decideSuggestionAction,
  resubmitCentreClaimAction,
  resubmitSuggestionAction,
  submitCentreClaimAction,
  submitSuggestionAction,
  withdrawCentreClaimAction,
  withdrawSuggestionAction,
  type SuggestionFormState,
} from './actions.ts';

const EMPTY: SuggestionFormState = {};
const ACCEPT = 'image/jpeg,image/png,application/pdf';
const TEN_MB = 10 * 1024 * 1024;

export interface EditableSuggestion {
  readonly id: string;
  readonly version: number;
  readonly kind: string;
  readonly displayNameFa: string;
  readonly provinceCode: string | null;
  readonly cityId: string | null;
  readonly contactFa: string | null;
  readonly sourceFa: string;
  readonly noteFa: string | null;
}

function SuggestionFields({
  suggestion,
  provinces,
  cities,
}: {
  suggestion?: EditableSuggestion;
  provinces: readonly Option[];
  cities: readonly CityOption[];
}) {
  return (
    <>
      <TextField
        label="نام دامپزشک یا مرکز"
        name="displayNameFa"
        required
        maxLength={160}
        defaultValue={suggestion?.displayNameFa ?? ''}
        data-testid="suggestion-name"
      />
      <PlacePicker
        provinces={provinces}
        cities={cities}
        required
        defaultProvince={suggestion?.provinceCode}
        defaultCity={suggestion?.cityId}
        testIdPrefix="suggestion-"
      />
      <TextField
        label="تماس یا نشانی عمومی"
        name="contactFa"
        maxLength={300}
        defaultValue={suggestion?.contactFa ?? ''}
        hint="فقط اطلاعاتی که عمومی و در دسترس است."
        data-testid="suggestion-contact"
      />
      <TextField
        label="منبع اطلاعات"
        name="sourceFa"
        required
        maxLength={300}
        defaultValue={suggestion?.sourceFa ?? ''}
        hint="مثلاً تابلوی مطب، وب‌سایت رسمی یا مراجعه خودتان."
        data-testid="suggestion-source"
      />
      <TextAreaField label="توضیح" name="noteFa" rows={3} maxLength={1000} defaultValue={suggestion?.noteFa ?? ''} data-testid="suggestion-note" />
      <Check
        name="confirmedNotDuplicate"
        label="رکوردهای مشابه را دیده‌ام و این مورد تکراری نیست"
        defaultChecked={false}
        testId="suggestion-confirm"
      />
    </>
  );
}

/** An ordinary user says a veterinarian or a centre exists (§10). */
export function SuggestionForm({ provinces, cities }: { provinces: readonly Option[]; cities: readonly CityOption[] }) {
  const [state, submit, pending] = useActionState(submitSuggestionAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">پیشنهاد ثبت دامپزشک یا مرکز</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        آنچه می‌نویسید مستقیم منتشر نمی‌شود: اپراتور بررسی آن را می‌خواند و در صورت تأیید، رکورد با برچسب «بدون مالک» منتشر می‌شود.
        پیشنهاددادن مالکیت نمی‌آورد.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="suggestion-form">
        <Result state={state} testId="suggestion-result" />
        <SelectField
          label="نوع رکورد"
          name="kind"
          required
          defaultValue="CENTRE"
          options={SUGGESTION_KINDS.map((kind) => ({ value: kind, label: SUGGESTION_KIND_FA[kind] }))}
          data-testid="suggestion-kind"
        />
        <SuggestionFields provinces={provinces} cities={cities} />
        <Button type="submit" disabled={pending} data-testid="submit-suggestion">
          ارسال برای بررسی
        </Button>
      </form>
    </Card>
  );
}

export function SuggestionCorrectionForm({
  suggestion,
  provinces,
  cities,
}: {
  suggestion: EditableSuggestion;
  provinces: readonly Option[];
  cities: readonly CityOption[];
}) {
  const [state, submit, pending] = useActionState(resubmitSuggestionAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="suggestion-correction-form">
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <input type="hidden" name="expectedVersion" value={suggestion.version} />
      <input type="hidden" name="kind" value={suggestion.kind} />
      <Result state={state} testId="suggestion-correction-result" />
      <SuggestionFields suggestion={suggestion} provinces={provinces} cities={cities} />
      <Button type="submit" disabled={pending} data-testid="resubmit-suggestion">
        ارسال اصلاحات
      </Button>
    </form>
  );
}

export function WithdrawSuggestionForm({ suggestionId, version }: { suggestionId: string; version: number }) {
  const [state, submit, pending] = useActionState(withdrawSuggestionAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-sm" data-testid={'withdraw-suggestion-form-' + suggestionId}>
      <input type="hidden" name="suggestionId" value={suggestionId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Result state={state} testId={'withdraw-suggestion-result-' + suggestionId} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'withdraw-suggestion-' + suggestionId}>
        انصراف از پیشنهاد
      </Button>
    </form>
  );
}

/** Stays mounted after the decision, so the recorded outcome is still shown (DEC-0165 pattern). */
export function SuggestionDecisionForm({ suggestionId, version, open }: { suggestionId: string; version: number; open: boolean }) {
  const [state, submit, pending] = useActionState(decideSuggestionAction, EMPTY);
  if (!open) {
    return (
      <Card>
        <h2 className="text-label-lg">تصمیم</h2>
        <div className="mt-md">
          <Result state={state} testId="suggestion-decision-result" />
        </div>
        <p className="mt-sm text-body-sm text-text-secondary">این پیشنهاد در انتظار بررسی نیست.</p>
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="text-label-lg">تصمیم</h2>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-lg" data-testid="suggestion-decision-form">
        <input type="hidden" name="suggestionId" value={suggestionId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <Result state={state} testId="suggestion-decision-result" />
        <SelectField
          label="تصمیم"
          name="decision"
          required
          options={REVIEW_DECISIONS.map((value) => ({ value, label: REVIEW_DECISION_FA[value] }))}
          data-testid="suggestion-decision"
        />
        <TextAreaField
          label="دلیل"
          name="reasonFa"
          rows={3}
          required
          maxLength={1000}
          hint="برای پیشنهاددهنده نمایش داده و در تاریخچه ثبت می‌شود."
          data-testid="suggestion-decision-reason"
        />
        <Check
          name="confirmedNotDuplicate"
          label="رکوردهای مشابه را دیدم و این مورد تکراری نیست"
          defaultChecked={false}
          testId="suggestion-decision-confirm"
        />
        <Button type="submit" disabled={pending} data-testid="submit-suggestion-decision">
          ثبت تصمیم
        </Button>
      </form>
    </Card>
  );
}

// ── Centre claims ────────────────────────────────────────────────────────

function ClaimDocumentFields({ required }: { required: boolean }) {
  return (
    <fieldset className="space-y-md">
      <legend className="text-label-md">مدارک</legend>
      <p className="text-caption text-text-secondary">
        JPG، PNG یا PDF تا ۱۰ مگابایت برای هر فایل. مدارک خصوصی‌اند و فقط شما و اپراتور بررسی آن‌ها را می‌بینند.
      </p>
      {CLAIM_DOCUMENT_KINDS.map((kind) => (
        <FileField
          key={kind}
          label={CLAIM_DOCUMENT_KIND_FA[kind]}
          name={'document_' + kind}
          accept={ACCEPT}
          maxBytes={TEN_MB}
          required={required && kind === 'CENTRE_LICENCE'}
          testId={'claim-doc-' + kind}
        />
      ))}
    </fieldset>
  );
}

export interface EditableClaim {
  readonly id: string;
  readonly version: number;
  readonly claimantNameFa: string;
  readonly roleFa: string;
  readonly phone: string | null;
  readonly statementFa: string | null;
}

function ClaimFields({ claim }: { claim?: EditableClaim }) {
  return (
    <>
      <div className="grid gap-md md:grid-cols-2">
        <TextField
          label="نام و نام خانوادگی نماینده"
          name="claimantNameFa"
          required
          maxLength={120}
          defaultValue={claim?.claimantNameFa ?? ''}
          data-testid="claim-name"
        />
        <TextField
          label="سمت شما در این مرکز"
          name="roleFa"
          required
          maxLength={120}
          defaultValue={claim?.roleFa ?? ''}
          hint="مثلاً مؤسس، مدیر فنی یا نماینده قانونی."
          data-testid="claim-role"
        />
      </div>
      <TextField label="تلفن تماس" name="phone" ltr inputMode="tel" maxLength={20} defaultValue={claim?.phone ?? ''} data-testid="claim-phone" />
      <TextAreaField
        label="توضیح برای بررسی"
        name="statementFa"
        rows={3}
        maxLength={2000}
        defaultValue={claim?.statementFa ?? ''}
        data-testid="claim-statement"
      />
    </>
  );
}

export function CentreClaimForm({ claimSlug, centreNameFa }: { claimSlug: string; centreNameFa: string }) {
  const [state, submit, pending] = useActionState(submitCentreClaimAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">{'درخواست مدیریت ' + centreNameFa}</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        با تأیید این درخواست، ویرایش و انتشار این مرکز به حساب شما سپرده می‌شود. تاریخچه ثبت‌شده مرکز همان‌طور می‌ماند.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="centre-claim-form">
        <input type="hidden" name="claimSlug" value={claimSlug} />
        <Result state={state} testId="centre-claim-result" />
        <ClaimFields />
        <ClaimDocumentFields required />
        <Button type="submit" disabled={pending} data-testid="submit-centre-claim">
          ارسال برای بررسی
        </Button>
      </form>
    </Card>
  );
}

export function CentreClaimCorrectionForm({ claim }: { claim: EditableClaim }) {
  const [state, submit, pending] = useActionState(resubmitCentreClaimAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="centre-claim-correction-form">
      <input type="hidden" name="claimId" value={claim.id} />
      <input type="hidden" name="expectedVersion" value={claim.version} />
      <Result state={state} testId="centre-claim-correction-result" />
      <ClaimFields claim={claim} />
      <ClaimDocumentFields required={false} />
      <Button type="submit" disabled={pending} data-testid="resubmit-centre-claim">
        ارسال اصلاحات
      </Button>
    </form>
  );
}

export function WithdrawCentreClaimForm({ claimId, version }: { claimId: string; version: number }) {
  const [state, submit, pending] = useActionState(withdrawCentreClaimAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-sm" data-testid={'withdraw-claim-form-' + claimId}>
      <input type="hidden" name="claimId" value={claimId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Result state={state} testId={'withdraw-claim-result-' + claimId} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'withdraw-claim-' + claimId}>
        انصراف از درخواست
      </Button>
    </form>
  );
}

export function AppealCentreClaimForm({ claimId, version }: { claimId: string; version: number }) {
  const [state, submit, pending] = useActionState(appealCentreClaimAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid={'claim-appeal-form-' + claimId}>
      <input type="hidden" name="claimId" value={claimId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Result state={state} testId={'claim-appeal-result-' + claimId} />
      <TextAreaField
        label="دلیل تجدیدنظر"
        name="appealFa"
        rows={3}
        required
        maxLength={2000}
        hint="برای هر درخواست فقط یک‌بار تجدیدنظر ممکن است."
        data-testid={'claim-appeal-text-' + claimId}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'submit-claim-appeal-' + claimId}>
        ثبت تجدیدنظر
      </Button>
    </form>
  );
}

export function CentreClaimDecisionForm({ claimId, version, open }: { claimId: string; version: number; open: boolean }) {
  const [state, submit, pending] = useActionState(decideCentreClaimAction, EMPTY);
  if (!open) {
    return (
      <Card>
        <h2 className="text-label-lg">تصمیم</h2>
        <div className="mt-md">
          <Result state={state} testId="claim-decision-result" />
        </div>
        <p className="mt-sm text-body-sm text-text-secondary">این درخواست در انتظار بررسی نیست.</p>
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="text-label-lg">تصمیم</h2>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-lg" data-testid="claim-decision-form">
        <input type="hidden" name="claimId" value={claimId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <Result state={state} testId="claim-decision-result" />
        <SelectField
          label="تصمیم"
          name="decision"
          required
          options={REVIEW_DECISIONS.map((value) => ({ value, label: REVIEW_DECISION_FA[value] }))}
          data-testid="claim-decision"
        />
        <TextAreaField
          label="دلیل"
          name="reasonFa"
          rows={3}
          required
          maxLength={1000}
          hint="برای درخواست‌دهنده نمایش داده و در تاریخچه ثبت می‌شود."
          data-testid="claim-decision-reason"
        />
        <Button type="submit" disabled={pending} data-testid="submit-claim-decision">
          ثبت تصمیم
        </Button>
      </form>
    </Card>
  );
}
