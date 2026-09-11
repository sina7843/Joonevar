'use client';

import { useActionState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Check, PlacePicker, Result, submitWith, type CityOption, type Option } from './directory-forms.tsx';
import { changeVetPublicStatusAction, type DirectoryEditState } from './directory-actions.ts';
import { DOCUMENT_KIND_FA, REVIEW_DECISIONS, REVIEW_DECISION_FA, VET_DOCUMENT_KINDS } from './onboarding-model.ts';
import { VET_PUBLIC_STATUS_FA, type VetPublicStatus } from './directory-model.ts';
import {
  appealVetApplicationAction,
  createUnownedVetProfileAction,
  decideVetApplicationAction,
  resubmitVetApplicationAction,
  submitVetApplicationAction,
  withdrawVetApplicationAction,
  type OnboardingState,
} from './onboarding-actions.ts';

const EMPTY: OnboardingState = {};
const ACCEPT = 'image/jpeg,image/png,application/pdf';
const TEN_MB = 10 * 1024 * 1024;

function DocumentFields({ requireCouncilCard }: { requireCouncilCard: boolean }) {
  return (
    <fieldset className="space-y-md">
      <legend className="text-label-md">مدارک</legend>
      <p className="text-caption text-text-secondary">
        JPG، PNG یا PDF تا ۱۰ مگابایت برای هر فایل و روی هم حداکثر ۱۲ مگابایت. مدارک خصوصی‌اند و فقط شما و اپراتور بررسی آن‌ها را
        می‌بینید.
      </p>
      {VET_DOCUMENT_KINDS.map((kind) => (
        <FileField
          key={kind}
          label={DOCUMENT_KIND_FA[kind]}
          name={'document_' + kind}
          accept={ACCEPT}
          maxBytes={TEN_MB}
          required={requireCouncilCard && kind === 'COUNCIL_CARD'}
          testId={'app-doc-' + kind}
        />
      ))}
    </fieldset>
  );
}

interface ApplicationDefaults {
  readonly displayNameFa?: string | null;
  readonly councilCode?: string | null;
  readonly phone?: string | null;
  readonly provinceCode?: string | null;
  readonly cityId?: string | null;
  readonly statementFa?: string | null;
}

function ApplicationFields({
  defaults,
  provinces,
  cities,
}: {
  defaults: ApplicationDefaults;
  provinces: readonly Option[];
  cities: readonly CityOption[];
}) {
  return (
    <>
      <div className="grid gap-md md:grid-cols-2">
        <TextField
          label="نام و نام خانوادگی دامپزشک"
          name="displayNameFa"
          required
          maxLength={120}
          defaultValue={defaults.displayNameFa ?? ''}
          data-testid="app-name"
        />
        <TextField
          label="کد نظام دامپزشکی"
          name="councilCode"
          required
          ltr
          maxLength={20}
          defaultValue={defaults.councilCode ?? ''}
          hint="همان کدی که روی کارت نظام دامپزشکی آمده است."
          data-testid="app-council-code"
        />
      </div>
      <TextField label="تلفن تماس حرفه‌ای" name="phone" ltr inputMode="tel" maxLength={20} defaultValue={defaults.phone ?? ''} data-testid="app-phone" />
      <PlacePicker provinces={provinces} cities={cities} defaultProvince={defaults.provinceCode} defaultCity={defaults.cityId} testIdPrefix="app-" />
      <TextAreaField
        label="توضیح برای بررسی"
        name="statementFa"
        rows={3}
        maxLength={2000}
        defaultValue={defaults.statementFa ?? ''}
        data-testid="app-statement"
      />
    </>
  );
}

/** A new request: a directory profile of one's own, or a claim of an unowned profile. */
export function VetApplicationForm({
  kind,
  claimSlug,
  defaults,
  provinces,
  cities,
}: {
  kind: 'PROFILE' | 'CLAIM';
  claimSlug?: string;
  defaults: ApplicationDefaults;
  provinces: readonly Option[];
  cities: readonly CityOption[];
}) {
  const [state, submit, pending] = useActionState(submitVetApplicationAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">{kind === 'CLAIM' ? 'درخواست Claim پروفایل' : 'درخواست ساخت پروفایل دامپزشک'}</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        پس از تأیید، پروفایل دایرکتوری و تأیید کد نظام به حساب شما وصل می‌شود. نقش «دامپزشک معتمد» خدمات همزیست جداست و از این مسیر داده
        نمی‌شود.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-lg" data-testid="vet-application-form">
        <input type="hidden" name="kind" value={kind} />
        {claimSlug ? <input type="hidden" name="claimSlug" value={claimSlug} /> : null}
        <Result state={state} testId="vet-application-result" />
        <ApplicationFields defaults={defaults} provinces={provinces} cities={cities} />
        <DocumentFields requireCouncilCard />
        <Button type="submit" disabled={pending} data-testid="submit-vet-application">
          ارسال برای بررسی
        </Button>
      </form>
    </Card>
  );
}

export function ResubmitApplicationForm({
  application,
  provinces,
  cities,
}: {
  application: ApplicationDefaults & { id: string; version: number };
  provinces: readonly Option[];
  cities: readonly CityOption[];
}) {
  const [state, submit, pending] = useActionState(resubmitVetApplicationAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-lg" data-testid="vet-resubmit-form">
      <input type="hidden" name="applicationId" value={application.id} />
      <input type="hidden" name="expectedVersion" value={application.version} />
      <Result state={state} testId="vet-resubmit-result" />
      <ApplicationFields defaults={application} provinces={provinces} cities={cities} />
      <DocumentFields requireCouncilCard={false} />
      <Button type="submit" disabled={pending} data-testid="resubmit-vet-application">
        ارسال اصلاحات
      </Button>
    </form>
  );
}

export function WithdrawApplicationForm({ applicationId, version }: { applicationId: string; version: number }) {
  const [state, submit, pending] = useActionState(withdrawVetApplicationAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-sm" data-testid="vet-withdraw-form">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Result state={state} testId="vet-withdraw-result" />
      <Button type="submit" tone="ghost" disabled={pending} data-testid="withdraw-vet-application">
        انصراف از درخواست
      </Button>
    </form>
  );
}

export function AppealApplicationForm({ applicationId, version }: { applicationId: string; version: number }) {
  const [state, submit, pending] = useActionState(appealVetApplicationAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="vet-appeal-form">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Result state={state} testId="vet-appeal-result" />
      <TextAreaField
        label="دلیل تجدیدنظر"
        name="appealFa"
        rows={3}
        required
        maxLength={2000}
        hint="برای هر درخواست فقط یک‌بار تجدیدنظر ممکن است."
        data-testid="vet-appeal-text"
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="submit-vet-appeal">
        ثبت تجدیدنظر
      </Button>
    </form>
  );
}

/**
 * Stays mounted after the decision (`open` turns false), so the recorded
 * outcome is still shown once the application leaves the queue.
 */
export function ReviewDecisionForm({ applicationId, version, open }: { applicationId: string; version: number; open: boolean }) {
  const [state, submit, pending] = useActionState(decideVetApplicationAction, EMPTY);
  if (!open) {
    return (
      <Card>
        <h2 className="text-label-lg">تصمیم</h2>
        <div className="mt-md">
          <Result state={state} testId="review-decision-result" />
        </div>
        <p className="mt-sm text-body-sm text-text-secondary">این درخواست در انتظار بررسی نیست.</p>
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="text-label-lg">تصمیم</h2>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-lg" data-testid="review-decision-form">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <Result state={state} testId="review-decision-result" />
        <SelectField
          label="تصمیم"
          name="decision"
          required
          options={REVIEW_DECISIONS.map((value) => ({ value, label: REVIEW_DECISION_FA[value] }))}
          data-testid="review-decision"
        />
        <TextAreaField
          label="دلیل"
          name="reasonFa"
          rows={3}
          required
          maxLength={1000}
          hint="برای درخواست‌دهنده نمایش داده و در تاریخچه ثبت می‌شود."
          data-testid="review-reason"
        />
        <Button type="submit" disabled={pending} data-testid="submit-review-decision">
          ثبت تصمیم
        </Button>
      </form>
    </Card>
  );
}

/** A reviewed suggestion, published with the «بدون مالک» label (§10). */
export function UnownedVetForm({ provinces, cities }: { provinces: readonly Option[]; cities: readonly CityOption[] }) {
  const [state, submit, pending] = useActionState(createUnownedVetProfileAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">انتشار پروفایل بدون مالک</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        فقط اطلاعات عمومی و قابل استناد. پروفایل بدون مالک تأیید کد نظام ندارد و تا Claim و تأیید دامپزشک، ویرایش محتوایی نمی‌پذیرد.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="unowned-vet-form">
        <Result state={state} testId="unowned-vet-result" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="نام دامپزشک" name="displayNameFa" required maxLength={120} data-testid="unowned-name" />
          <TextField label="کد نظام دامپزشکی" name="councilCode" ltr maxLength={20} hint="فقط اگر از منبع عمومی معلوم است." data-testid="unowned-council-code" />
        </div>
        <PlacePicker provinces={provinces} cities={cities} required testIdPrefix="unowned-" />
        <TextField label="تماس یا نشانی عمومی" name="contactFa" maxLength={300} data-testid="unowned-contact" />
        <TextField label="منبع اطلاعات" name="sourceFa" required maxLength={300} hint="فقط برای بررسی؛ در صفحه عمومی نمایش داده نمی‌شود." data-testid="unowned-source" />
        <TextField label="دلیل انتشار" name="reason" required maxLength={500} data-testid="unowned-reason" />
        <Check name="confirmedNotDuplicate" label="پروفایل‌های مشابه را دیده‌ام و این دامپزشک تکراری نیست" defaultChecked={false} testId="unowned-confirm" />
        <Button type="submit" disabled={pending} data-testid="publish-unowned">
          انتشار با برچسب «بدون مالک»
        </Button>
      </form>
    </Card>
  );
}

const EMPTY_DIRECTORY: DirectoryEditState = {};

/** Hide or republish one unowned profile from the review list. */
export function ReviewStatusForm({ profileId, version, publicStatus }: { profileId: string; version: number; publicStatus: VetPublicStatus }) {
  const [state, submit, pending] = useActionState(changeVetPublicStatusAction, EMPTY_DIRECTORY);
  const to: VetPublicStatus = publicStatus === 'PUBLISHED' ? 'HIDDEN' : 'PUBLISHED';
  return (
    <form key={publicStatus} onSubmit={submitWith(submit)} className="mt-md flex flex-wrap items-end gap-sm" data-testid={'review-status-form-' + profileId}>
      <input type="hidden" name="surface" value="review" />
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="to" value={to} />
      <div className="min-w-[12rem] flex-1">
        <TextField label="دلیل" name="reason" required maxLength={500} data-testid={'review-status-reason-' + profileId} />
      </div>
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'review-status-submit-' + profileId}>
        {VET_PUBLIC_STATUS_FA[to] === 'پنهان' ? 'پنهان‌کردن' : 'انتشار دوباره'}
      </Button>
      <div className="w-full">
        <Result state={state} testId={'review-status-result-' + profileId} />
      </div>
    </form>
  );
}
