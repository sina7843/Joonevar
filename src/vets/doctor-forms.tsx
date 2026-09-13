'use client';

import { useActionState, useState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { FileField, TextAreaField, TextField } from '../ui/field.tsx';
import { PlacePicker, Result, type CityOption, type Option } from './directory-forms.tsx';
import { DOCTOR_DECISIONS, DOCTOR_DECISION_FA, type DoctorDecision } from './professional-profile-model.ts';
import { DOCUMENT_KIND_FA } from './onboarding-model.ts';
import { decideDoctorCaseAction, resubmitDoctorApplicationAction, submitDoctorApplicationAction, type DoctorState } from './doctor-actions.ts';

const EMPTY: DoctorState = {};
const ACCEPT = 'image/jpeg,image/png,application/pdf';
const TEN_MB = 10 * 1024 * 1024;

export interface DoctorDefaults {
  readonly displayNameFa?: string | null;
  readonly practiceScope?: string | null;
  readonly councilCode?: string | null;
  readonly phone?: string | null;
  readonly provinceCode?: string | null;
  readonly cityId?: string | null;
  readonly statementFa?: string | null;
}

/**
 * The doctor application without a practice licence: a profile of one's own, a
 * claim of an unowned page (`claimSlug`), or the answer to a correction
 * (`correction`). General or specialist and the council code are required.
 */
export function DoctorApplicationForm({
  defaults,
  provinces,
  cities,
  claimSlug,
  correction,
}: {
  defaults: DoctorDefaults;
  provinces: readonly Option[];
  cities: readonly CityOption[];
  claimSlug?: string;
  correction?: { caseId: string; version: number };
}) {
  const [state, submit, pending] = useActionState(correction ? resubmitDoctorApplicationAction : submitDoctorApplicationAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">{correction ? 'اصلاح درخواست دامپزشک' : claimSlug ? 'درخواست Claim پروفایل' : 'درخواست دکتر دامپزشک (بدون پروانه فعالیت)'}</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        ادمین انجمن کد نظام را دستی بررسی می‌کند. پس از تأیید، Tag «دکتر دامپزشک - عمومی/متخصص - بدون پروانه فعالیت» و معرفی در دایرکتوری
        برای شما فعال می‌شود. پروانه فعالیت و دامپزشک معتمد مسیرهای جدا هستند و از این تأیید نتیجه نمی‌شوند.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid={correction ? 'doctor-correction-form' : 'doctor-application-form'}>
        {correction ? (
          <>
            <input type="hidden" name="caseId" value={correction.caseId} />
            <input type="hidden" name="expectedVersion" value={correction.version} />
          </>
        ) : null}
        {claimSlug ? <input type="hidden" name="claimSlug" value={claimSlug} /> : null}
        <Result state={state} testId="doctor-result" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="نام و نام خانوادگی دامپزشک" name="displayNameFa" required maxLength={120} defaultValue={defaults.displayNameFa ?? ''} data-testid="app-name" />
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
        <fieldset className="space-y-sm">
          <legend className="text-label-md">عمومی یا متخصص</legend>
          {(
            [
              ['GENERAL', 'دکتر دامپزشک عمومی'],
              ['SPECIALIST', 'دکتر دامپزشک متخصص'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-sm text-body-sm">
              <input
                type="radio"
                name="practiceScope"
                value={value}
                required
                defaultChecked={defaults.practiceScope === value}
                className="size-[var(--size-selection-md)]"
                data-testid={'app-scope-' + value}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <TextField label="تلفن تماس حرفه‌ای" name="phone" ltr inputMode="tel" maxLength={20} defaultValue={defaults.phone ?? ''} data-testid="app-phone" />
        <PlacePicker provinces={provinces} cities={cities} defaultProvince={defaults.provinceCode} defaultCity={defaults.cityId} testIdPrefix="app-" />
        <TextAreaField label="توضیح برای بررسی" name="statementFa" rows={3} maxLength={2000} defaultValue={defaults.statementFa ?? ''} data-testid="app-statement" />
        <fieldset className="space-y-md">
          <legend className="text-label-md">مدارک</legend>
          <p className="text-caption text-text-secondary">
            JPG، PNG یا PDF تا ۱۰ مگابایت. مدارک خصوصی‌اند و فقط شما و ادمین انجمن آن‌ها را می‌بینید؛ هر مشاهده ثبت می‌شود.
          </p>
          {(['COUNCIL_CARD', 'IDENTITY', 'OTHER'] as const).map((kind) => (
            <FileField
              key={kind}
              label={DOCUMENT_KIND_FA[kind]}
              name={'document_' + kind}
              accept={ACCEPT}
              maxBytes={TEN_MB}
              required={!correction && kind === 'COUNCIL_CARD'}
              testId={'app-doc-' + kind}
            />
          ))}
        </fieldset>
        <Button type="submit" disabled={pending} data-testid={correction ? 'resubmit-doctor-application' : 'submit-doctor-application'}>
          {pending ? 'در حال ارسال…' : correction ? 'ارسال اصلاحات' : 'ارسال برای بررسی'}
        </Button>
      </form>
    </Card>
  );
}

/** The association admin's decision on a council code. Every decision carries a reason. */
export function DecideDoctorCaseForm({ caseId, version }: { caseId: string; version: number }) {
  const [state, submit, pending] = useActionState(decideDoctorCaseAction, EMPTY);
  const [decision, setDecision] = useState<DoctorDecision>('VERIFY');
  return (
    <form action={submit} className="space-y-lg" data-testid="doctor-decision-form">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <fieldset className="space-y-sm">
        <legend className="text-label-md">نتیجه بررسی</legend>
        {DOCTOR_DECISIONS.map((value) => (
          <label key={value} className="flex items-center gap-sm text-body-sm">
            <input
              type="radio"
              name="decision"
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
              className="size-[var(--size-selection-md)]"
              data-testid={'doctor-decision-' + value}
            />
            {DOCTOR_DECISION_FA[value]}
          </label>
        ))}
      </fieldset>
      <TextAreaField label="دلیل" name="reasonFa" required rows={3} maxLength={1000} hint="دلیل برای متقاضی نمایش داده می‌شود." data-testid="doctor-decision-reason" />
      <Button type="submit" disabled={pending} data-testid="submit-doctor-decision">
        {pending ? 'در حال ثبت…' : 'ثبت نتیجه'}
      </Button>
      <Result state={state} testId="doctor-decision-result" />
    </form>
  );
}
