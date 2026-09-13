'use client';

import { useActionState, useState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { FileField, TextAreaField, TextField } from '../ui/field.tsx';
import { Check, PlacePicker, Result, type CityOption, type Option } from './directory-forms.tsx';
import { LICENCE_DECISIONS, LICENCE_DECISION_FA, MAX_CERTIFICATES, type LicenceDecision } from './professional-profile-model.ts';
import { decideLicenceCaseAction, reviseLicenceApplicationAction, submitLicenceApplicationAction, type LicenceState } from './licence-actions.ts';

const EMPTY: LicenceState = {};
const ACCEPT = 'image/jpeg,image/png,application/pdf';
const TEN_MB = 10 * 1024 * 1024;

export interface LicenceDefaults {
  readonly displayNameFa?: string | null;
  readonly practiceScope?: string | null;
  readonly councilCode?: string | null;
  readonly licenceCode?: string | null;
  readonly licenceDate?: string | null;
  readonly phone?: string | null;
  readonly websiteUrl?: string | null;
  readonly instagramHandle?: string | null;
  readonly clinicNameFa?: string | null;
  readonly serviceCodes?: readonly string[];
}

/**
 * The licensed veterinarian submission, or an edit of it (`revision`). A doctor
 * whose council code is verified (`VERIFIED_DOCTOR`) keeps that code; a new doctor
 * (`NEW_DOCTOR`) gives name, council code and council card too. Licence code, date
 * and file, and general or specialist, are always required; an edit may keep the
 * licence file it already sent.
 */
export function LicenceApplicationForm({
  mode,
  defaults,
  services,
  provinces,
  cities,
  revision,
}: {
  mode: 'NEW_DOCTOR' | 'VERIFIED_DOCTOR';
  defaults: LicenceDefaults;
  services: readonly Option[];
  provinces: readonly Option[];
  cities: readonly CityOption[];
  revision?: { caseId: string; version: number };
}) {
  const [state, submit, pending] = useActionState(revision ? reviseLicenceApplicationAction : submitLicenceApplicationAction, EMPTY);
  const newDoctor = mode === 'NEW_DOCTOR';
  return (
    <Card>
      <h2 className="text-label-lg">{revision ? 'ویرایش پرونده پروانه فعالیت' : 'ثبت پروانه فعالیت دامپزشکی'}</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        {revision
          ? 'ویرایش، نسخه تازه‌ای می‌سازد و نسخه‌های قبلی و مدارکشان همان‌طور نگهداری می‌شوند. اگر فایل پروانه تازه‌ای پیوست نکنید، همان فایل قبلی در نسخه تازه می‌ماند.'
          : 'ادمین انجمن مدارک را دستی بررسی می‌کند. تأیید مدارک فقط پرداخت دوره فعالیت را باز می‌کند؛ Tag «دارای پروانه فعالیت» پس از پرداخت موفق فعال می‌شود.'}
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid={revision ? 'licence-revision-form' : 'licence-application-form'}>
        {revision ? (
          <>
            <input type="hidden" name="caseId" value={revision.caseId} />
            <input type="hidden" name="expectedVersion" value={revision.version} />
          </>
        ) : null}
        <Result state={state} testId="licence-result" />

        {newDoctor ? (
          <TextField label="نام و نام خانوادگی دامپزشک" name="displayNameFa" required maxLength={120} defaultValue={defaults.displayNameFa ?? ''} data-testid="lic-name" />
        ) : null}
        <TextField
          label="کد نظام دامپزشکی"
          name="councilCode"
          required
          ltr
          maxLength={20}
          readOnly={!newDoctor}
          defaultValue={defaults.councilCode ?? ''}
          hint={newDoctor ? 'همان کدی که روی کارت نظام آمده است.' : 'کد نظام تأییدشده شما؛ از این فرم تغییر نمی‌کند.'}
          data-testid="lic-council-code"
        />
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
                data-testid={'lic-scope-' + value}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-md md:grid-cols-2">
          <TextField
            label="کد پروانه فعالیت"
            name="licenceCode"
            required
            ltr
            maxLength={30}
            defaultValue={defaults.licenceCode ?? ''}
            hint="مستقل از کد نظام؛ همان‌طور که روی پروانه آمده است."
            data-testid="lic-code"
          />
          <TextField label="تاریخ پروانه" name="licenceDate" type="date" required ltr defaultValue={defaults.licenceDate ?? ''} data-testid="lic-date" />
        </div>
        {newDoctor ? <PlacePicker provinces={provinces} cities={cities} testIdPrefix="lic-" /> : null}

        <fieldset className="space-y-md">
          <legend className="text-label-md">مدارک</legend>
          <p className="text-caption text-text-secondary">
            JPG، PNG یا PDF تا ۱۰ مگابایت برای هر فایل. نوع واقعی فایل بررسی می‌شود. مدارک خصوصی‌اند و فقط شما و ادمین انجمن آن‌ها را می‌بینید؛
            هر مشاهده ثبت می‌شود.
          </p>
          <FileField label="فایل پروانه فعالیت" name="document_PRACTICE_LICENCE" accept={ACCEPT} maxBytes={TEN_MB} required={!revision} testId="lic-doc-PRACTICE_LICENCE" />
          {newDoctor ? (
            <FileField label="کارت نظام دامپزشکی" name="document_COUNCIL_CARD" accept={ACCEPT} maxBytes={TEN_MB} required={!revision} testId="lic-doc-COUNCIL_CARD" />
          ) : null}
          <FileField label="مدرک هویتی (اختیاری)" name="document_IDENTITY" accept={ACCEPT} maxBytes={TEN_MB} testId="lic-doc-IDENTITY" />
          {Array.from({ length: MAX_CERTIFICATES }, (_, index) => index + 1).map((slot) => (
            <div key={slot} className="grid gap-sm md:grid-cols-2">
              <FileField label={'گواهی ' + slot.toLocaleString('fa-IR') + ' (اختیاری)'} name={'certificate_' + slot + '_file'} accept={ACCEPT} maxBytes={TEN_MB} testId={'lic-cert-' + slot + '-file'} />
              <TextField label="عنوان گواهی" name={'certificate_' + slot + '_title'} maxLength={120} data-testid={'lic-cert-' + slot + '-title'} />
            </div>
          ))}
        </fieldset>

        <fieldset className="space-y-md">
          <legend className="text-label-md">اطلاعات حرفه‌ای (اختیاری)</legend>
          <div className="grid gap-md md:grid-cols-2">
            <TextField label="نام کلینیک" name="clinicNameFa" maxLength={120} defaultValue={defaults.clinicNameFa ?? ''} data-testid="lic-clinic" />
            <TextField label="تلفن حرفه‌ای" name="phone" ltr inputMode="tel" maxLength={20} defaultValue={defaults.phone ?? ''} data-testid="lic-phone" />
            <TextField label="وب‌سایت" name="websiteUrl" ltr maxLength={200} defaultValue={defaults.websiteUrl ?? ''} data-testid="lic-website" />
            <TextField label="اینستاگرام" name="instagramHandle" ltr maxLength={60} defaultValue={defaults.instagramHandle ?? ''} data-testid="lic-instagram" />
          </div>
          {services.length > 0 ? (
            <div>
              <p className="text-label-md">خدمات</p>
              <div className="mt-sm grid gap-2xs md:grid-cols-2">
                {services.map((service) => (
                  <Check
                    key={service.code}
                    name="serviceCodes"
                    value={service.code}
                    label={service.nameFa}
                    defaultChecked={defaults.serviceCodes?.includes(service.code) ?? false}
                    testId={'lic-service-' + service.code}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </fieldset>

        <Button type="submit" disabled={pending} data-testid={revision ? 'revise-licence' : 'submit-licence'}>
          {pending ? 'در حال ارسال…' : revision ? 'ثبت نسخه تازه' : 'ارسال برای بررسی'}
        </Button>
      </form>
    </Card>
  );
}

/** The association admin's decision on licence documents. Every decision carries a reason. */
export function DecideLicenceCaseForm({ caseId, version }: { caseId: string; version: number }) {
  const [state, submit, pending] = useActionState(decideLicenceCaseAction, EMPTY);
  const [decision, setDecision] = useState<LicenceDecision>('APPROVE');
  return (
    <form action={submit} className="space-y-lg" data-testid="licence-decision-form">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <fieldset className="space-y-sm">
        <legend className="text-label-md">نتیجه بررسی</legend>
        {LICENCE_DECISIONS.map((value) => (
          <label key={value} className="flex items-center gap-sm text-body-sm">
            <input
              type="radio"
              name="decision"
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
              className="size-[var(--size-selection-md)]"
              data-testid={'licence-decision-' + value}
            />
            {LICENCE_DECISION_FA[value]}
          </label>
        ))}
      </fieldset>
      <TextAreaField label="دلیل" name="reasonFa" required rows={3} maxLength={1000} hint="دلیل برای متقاضی نمایش داده می‌شود." data-testid="licence-decision-reason" />
      <Button type="submit" disabled={pending} data-testid="submit-licence-decision">
        {pending ? 'در حال ثبت…' : 'ثبت نتیجه'}
      </Button>
      <Result state={state} testId="licence-decision-result" />
    </form>
  );
}
