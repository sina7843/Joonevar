'use client';

import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { LOCATION_KIND_FA, VET_PUBLIC_STATUS_FA, type VetPublicStatus } from './directory-model.ts';
import {
  addCityAction,
  addOwnLocationAction,
  changeVetPublicStatusAction,
  updateLocationPublicAction,
  updateVetPublicProfileAction,
  type DirectoryEditState,
  type DirectorySurface,
} from './directory-actions.ts';

const EMPTY: DirectoryEditState = {};

export type Option = { code: string; nameFa: string };
export type CityOption = { id: string; provinceCode: string; nameFa: string };

export function Result({ state, testId }: { state: { ok?: boolean; message?: string }; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

/*
 * Every form here submits from onSubmit rather than the `action` prop: React
 * resets a form after its action, and reset checkboxes and selects would show
 * values that were never saved (DEC-0157).
 */
export function submitWith(dispatch: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The submitter is passed explicitly: FormData(form) alone drops the name
    // and value of the button that was pressed, so a form with two answers
    // would send neither.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter instanceof HTMLButtonElement ? submitter : null);
    startTransition(() => dispatch(data));
  };
}

export function Check({
  name,
  value,
  label,
  defaultChecked,
  testId,
}: {
  name: string;
  value?: string;
  label: string;
  defaultChecked: boolean;
  testId: string;
}) {
  return (
    <label className="flex min-h-[var(--size-control-sm)] items-center gap-sm text-body-sm">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="size-[18px]" data-testid={testId} />
      {label}
    </label>
  );
}

/** Province, then the cities of that province. */
export function PlacePicker({
  provinces,
  cities,
  defaultProvince,
  defaultCity,
  required,
  testIdPrefix,
  testIdSuffix = '',
}: {
  provinces: readonly Option[];
  cities: readonly CityOption[];
  defaultProvince?: string | null;
  defaultCity?: string | null;
  required?: boolean;
  testIdPrefix: string;
  testIdSuffix?: string;
}) {
  const [province, setProvince] = useState(defaultProvince ?? '');
  return (
    <div className="grid gap-md md:grid-cols-2">
      <SelectField
        label="استان"
        name="provinceCode"
        required={required}
        value={province}
        onChange={(event) => setProvince(event.target.value)}
        options={provinces.map((row) => ({ value: row.code, label: row.nameFa }))}
        data-testid={testIdPrefix + 'province' + testIdSuffix}
      />
      <SelectField
        key={province}
        label="شهر"
        name="cityId"
        required={required}
        defaultValue={cities.some((c) => c.id === defaultCity && c.provinceCode === province) ? (defaultCity ?? '') : ''}
        options={cities.filter((c) => c.provinceCode === province).map((c) => ({ value: c.id, label: c.nameFa }))}
        data-testid={testIdPrefix + 'city' + testIdSuffix}
      />
    </div>
  );
}

function ReasonField({ surface, testId }: { surface: DirectorySurface; testId: string }) {
  return surface === 'owner' ? (
    <TextField label="یادداشت تغییر" name="reason" maxLength={500} data-testid={testId} />
  ) : (
    <TextField label="دلیل تغییر" name="reason" required maxLength={500} hint="در تاریخچه تغییرات ثبت می‌شود." data-testid={testId} />
  );
}

const Hidden = ({ surface }: { surface: DirectorySurface }) => <input type="hidden" name="surface" value={surface} />;

export interface EditableVetProfile {
  readonly profileId: string;
  readonly version: number;
  readonly headlineFa: string | null;
  readonly bioFa: string | null;
  readonly experienceFa: string | null;
  readonly phone: string | null;
  readonly showPhone: boolean;
  readonly showCouncilCode: boolean;
  readonly specialtyCodes: readonly string[];
  readonly speciesCodes: readonly string[];
  readonly publicStatus: VetPublicStatus;
  readonly hiddenByReview: boolean;
}

export function VetPublicProfileForm({
  surface,
  profile,
  specialties,
  species,
}: {
  surface: DirectorySurface;
  profile: EditableVetProfile;
  specialties: readonly Option[];
  species: readonly Option[];
}) {
  const [state, submit, pending] = useActionState(updateVetPublicProfileAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">اطلاعات پروفایل عمومی</h2>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-lg" data-testid="directory-profile-form">
        <Hidden surface={surface} />
        <input type="hidden" name="profileId" value={profile.profileId} />
        <input type="hidden" name="expectedVersion" value={profile.version} />
        <Result state={state} testId="directory-profile-result" />

        <TextField label="عنوان حرفه‌ای" name="headlineFa" maxLength={120} defaultValue={profile.headlineFa ?? ''} data-testid="directory-headline" />
        <TextAreaField label="معرفی" name="bioFa" maxLength={4000} defaultValue={profile.bioFa ?? ''} data-testid="directory-bio" />
        <TextAreaField
          label="سوابق"
          name="experienceFa"
          maxLength={4000}
          defaultValue={profile.experienceFa ?? ''}
          hint="فقط سابقه‌ای که واقعی و قابل ارائه است."
          data-testid="directory-experience"
        />

        <fieldset>
          <legend className="text-label-md">تخصص‌ها</legend>
          <div className="mt-sm grid gap-xs sm:grid-cols-2 lg:grid-cols-3">
            {specialties.map((row) => (
              <Check
                key={row.code}
                name="specialty"
                value={row.code}
                label={row.nameFa}
                defaultChecked={profile.specialtyCodes.includes(row.code)}
                testId={'directory-specialty-' + row.code}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-label-md">گونه‌هایی که پذیرفته می‌شوند</legend>
          <div className="mt-sm flex flex-wrap gap-lg">
            {species.map((row) => (
              <Check
                key={row.code}
                name="species"
                value={row.code}
                label={row.nameFa}
                defaultChecked={profile.speciesCodes.includes(row.code)}
                testId={'directory-species-' + row.code}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-label-md">رضایت نمایش</legend>
          <div className="mt-sm space-y-xs">
            <Check
              name="showPhone"
              label={profile.phone ? 'نمایش تلفن ' + profile.phone + ' در صفحه عمومی' : 'نمایش تلفن (تلفنی در پرونده ثبت نشده است)'}
              defaultChecked={profile.showPhone}
              testId="directory-show-phone"
            />
            <Check
              name="showCouncilCode"
              label="نمایش کد نظام دامپزشکی در صفحه عمومی"
              defaultChecked={profile.showCouncilCode}
              testId="directory-show-council"
            />
          </div>
        </fieldset>

        <ReasonField surface={surface} testId="directory-profile-reason" />
        <Button type="submit" disabled={pending} data-testid="save-directory-profile">
          ذخیره پروفایل عمومی
        </Button>
      </form>
    </Card>
  );
}

export function VetPublicStatusForm({
  surface,
  profile,
  blockers,
}: {
  surface: DirectorySurface;
  profile: EditableVetProfile;
  blockers: readonly string[];
}) {
  const [state, submit, pending] = useActionState(changeVetPublicStatusAction, EMPTY);
  const targets: VetPublicStatus[] = profile.publicStatus === 'PUBLISHED' ? ['HIDDEN'] : ['PUBLISHED'];
  const lockedForOwner = surface === 'owner' && profile.hiddenByReview && profile.publicStatus === 'HIDDEN';
  return (
    <Card>
      <h2 className="text-label-lg">انتشار</h2>
      <p className="mt-xs text-body-sm text-text-secondary">{'وضعیت فعلی: ' + VET_PUBLIC_STATUS_FA[profile.publicStatus]}</p>
      <Result state={state} testId="directory-status-result" />
      {lockedForOwner ? (
        <div className="mt-md" data-testid="directory-review-hidden">
          <Alert tone="warning" title="این پروفایل در بررسی همزیست پنهان شده است">
            انتشار دوباره فقط از بررسی همزیست ممکن است. دلیل در اعلان‌های شما آمده است.
          </Alert>
        </div>
      ) : (
        <>
          {blockers.length > 0 && profile.publicStatus !== 'PUBLISHED' ? (
            <div className="mt-md" data-testid="directory-blockers">
              <Alert tone="warning" title="پیش از انتشار">
                <ul className="list-disc space-y-2xs pr-lg">
                  {blockers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : null}
          {/* Remounted when the status changes: its only choice changes with it. */}
          <form key={profile.publicStatus} onSubmit={submitWith(submit)} className="mt-lg space-y-lg" data-testid="directory-status-form">
            <Hidden surface={surface} />
            <input type="hidden" name="profileId" value={profile.profileId} />
            <input type="hidden" name="expectedVersion" value={profile.version} />
            <SelectField
              label="وضعیت تازه"
              name="to"
              required
              defaultValue={targets[0]}
              options={targets.map((value) => ({ value, label: VET_PUBLIC_STATUS_FA[value] }))}
              data-testid="directory-status-to"
            />
            <ReasonField surface={surface} testId="directory-status-reason" />
            <Button type="submit" disabled={pending} data-testid="change-directory-status">
              ثبت وضعیت
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

export interface EditableLocation {
  readonly id: string;
  readonly version: number;
  readonly isPublic: boolean;
  readonly isActive: boolean;
  readonly provinceCode: string | null;
  readonly cityId: string | null;
  readonly hoursNoteFa: string | null;
}

export function LocationPublicForm({
  surface,
  location,
  provinces,
  cities,
}: {
  surface: DirectorySurface;
  location: EditableLocation;
  provinces: readonly Option[];
  cities: readonly CityOption[];
}) {
  const [state, submit, pending] = useActionState(updateLocationPublicAction, EMPTY);
  const id = location.id;
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-md" data-testid={'location-public-form-' + id}>
      <Hidden surface={surface} />
      <input type="hidden" name="locationId" value={id} />
      <input type="hidden" name="expectedVersion" value={location.version} />
      <Result state={state} testId={'location-public-result-' + id} />
      <PlacePicker
        provinces={provinces}
        cities={cities}
        defaultProvince={location.provinceCode}
        defaultCity={location.cityId}
        testIdPrefix="location-"
        testIdSuffix={'-' + id}
      />
      <TextField
        label="ساعات اطلاع‌رسانی"
        name="hoursNoteFa"
        maxLength={300}
        defaultValue={location.hoursNoteFa ?? ''}
        hint="همان‌طور که محل کار اعلام کرده؛ نوبت یا زمان قطعی نیست."
        data-testid={'location-hours-' + id}
      />
      <Check
        name="isPublic"
        label={location.isActive ? 'نمایش این محل کار در صفحه عمومی' : 'این محل کار غیرفعال است'}
        defaultChecked={location.isPublic}
        testId={'location-public-' + id}
      />
      <ReasonField surface={surface} testId={'location-reason-' + id} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'save-location-public-' + id}>
        ذخیره محل کار
      </Button>
    </form>
  );
}

/** The owner's own new location: no licence and no capability, so never in the Finder. */
export function AddOwnLocationForm({ provinces, cities }: { provinces: readonly Option[]; cities: readonly CityOption[] }) {
  const [state, submit, pending] = useActionState(addOwnLocationAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">افزودن محل کار</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        پروانه و امکانات خدمات همزیست (میکروچیپ، نمونه خون، بارداری) از اینجا ثبت نمی‌شوند. اگر شهرتان در فهرست نیست به پشتیبانی
        همزیست اطلاع دهید.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="add-own-location-form">
        <Hidden surface="owner" />
        <Result state={state} testId="add-own-location-result" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="نام محل کار" name="nameFa" required maxLength={120} data-testid="own-location-name" />
          <SelectField
            label="نوع"
            name="kind"
            required
            defaultValue="CLINIC"
            options={(['CLINIC', 'HOSPITAL', 'CENTRE'] as const).map((kind) => ({ value: kind, label: LOCATION_KIND_FA[kind] }))}
            data-testid="own-location-kind"
          />
        </div>
        <PlacePicker provinces={provinces} cities={cities} required testIdPrefix="own-location-" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="محله" name="neighborhoodFa" maxLength={120} data-testid="own-location-neighborhood" />
          <TextField label="تلفن محل کار" name="phone" ltr inputMode="tel" maxLength={20} data-testid="own-location-phone" />
        </div>
        <TextField label="نشانی" name="addressFa" maxLength={300} data-testid="own-location-address" />
        <TextField label="ساعات اطلاع‌رسانی" name="hoursNoteFa" maxLength={300} data-testid="own-location-hours" />
        <Check name="isPublic" label="نمایش این محل کار در صفحه عمومی" defaultChecked testId="own-location-public" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="add-own-location">
          افزودن محل کار
        </Button>
      </form>
    </Card>
  );
}

export function AddCityForm({ surface, provinces }: { surface: DirectorySurface; provinces: readonly Option[] }) {
  const [state, submit, pending] = useActionState(addCityAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">افزودن شهر</h2>
      <p className="mt-xs text-body-sm text-text-secondary">مرکز استان‌ها از قبل ثبت شده‌اند. شهر دیگر را فقط وقتی دامپزشکی در آن هست اضافه کنید.</p>
      <form onSubmit={submitWith(submit)} className="mt-lg grid gap-md md:grid-cols-[1fr_1fr_auto] md:items-end" data-testid="add-city-form">
        <Hidden surface={surface} />
        <div className="md:col-span-3">
          <Result state={state} testId="add-city-result" />
        </div>
        <SelectField
          label="استان"
          name="provinceCode"
          required
          options={provinces.map((row) => ({ value: row.code, label: row.nameFa }))}
          data-testid="city-province"
        />
        <TextField label="نام شهر" name="nameFa" required maxLength={80} data-testid="city-name" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="add-city">
          افزودن
        </Button>
      </form>
    </Card>
  );
}
