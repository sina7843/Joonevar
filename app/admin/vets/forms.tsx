'use client';

import { useActionState } from 'react';
import { Card } from '../../../src/ui/card.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../../src/ui/field.tsx';
import {
  addLocationAction,
  saveVetAction,
  updateLocationAction,
  type AdminFormState,
} from './actions.ts';

const EMPTY: AdminFormState = {};

const LICENCE_OPTIONS = [
  { value: 'NONE', label: 'پروانه ثبت نشده' },
  { value: 'VALID', label: 'پروانه معتبر' },
  { value: 'EXPIRED', label: 'پروانه منقضی' },
  { value: 'REVOKED', label: 'پروانه باطل' },
];

function Result({ state }: { state: AdminFormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />;
}

function Capabilities({
  implant,
  blood,
  pregnancy,
  suffix = '',
}: {
  implant?: boolean;
  blood?: boolean;
  pregnancy?: boolean;
  /** The add form and every edit form live on one page, so ids stay distinct. */
  suffix?: string;
}) {
  return (
    <fieldset className="space-y-sm">
      <legend className="text-label-md">امکانات اجباری موجود در این مرکز</legend>
      <label className="flex items-center gap-sm text-body-sm">
        <input
          type="checkbox"
          name="canImplantMicrochip"
          defaultChecked={implant}
          className="size-[var(--size-selection-md)]"
          data-testid={'cap-implant' + suffix}
        />
        کاشت میکروچیپ
      </label>
      <label className="flex items-center gap-sm text-body-sm">
        <input
          type="checkbox"
          name="canDrawBloodSample"
          defaultChecked={blood}
          className="size-[var(--size-selection-md)]"
          data-testid={'cap-blood' + suffix}
        />
        نمونه‌گیری خون
      </label>
      <label className="flex items-center gap-sm text-body-sm">
        <input
          type="checkbox"
          name="canPregnancyCheck"
          defaultChecked={pregnancy}
          className="size-[var(--size-selection-md)]"
          data-testid={'cap-pregnancy' + suffix}
        />
        بررسی بارداری
      </label>
    </fieldset>
  );
}

export function VetProfileForm() {
  const [state, submit, pending] = useActionState(saveVetAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">ثبت دامپزشک معتمد موجود</h2>
      <p className="mt-md text-caption text-text-secondary">
        این فرم درخواست معتمدشدن نیست. فقط داده دامپزشکی که قبلاً تأیید شده و نقشش ثبت است، وارد می‌شود.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="vet-profile-form">
        <Result state={state} />
        <TextField label="شماره موبایل حساب" name="mobile" required ltr data-testid="vet-mobile" />
        <TextField label="نام نمایشی" name="displayNameFa" required data-testid="vet-name" />
        <TextField
          label="کد نظام دامپزشکی"
          name="councilCode"
          required
          ltr
          hint="تأیید حرفه‌ای مستقل از پروانه مرکز است."
          data-testid="vet-council-code"
        />
        <TextField label="تلفن تماس" name="phone" ltr data-testid="vet-phone" />
        <Button type="submit" block disabled={pending} data-testid="save-vet">
          ثبت دامپزشک
        </Button>
      </form>
    </Card>
  );
}

export function AddLocationForm({ vets }: { vets: ReadonlyArray<{ accountId: string; nameFa: string }> }) {
  const [state, submit, pending] = useActionState(addLocationAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">افزودن مرکز</h2>
      <form action={submit} className="mt-lg space-y-lg" data-testid="add-location-form">
        <Result state={state} />
        <SelectField
          label="دامپزشک"
          name="vetAccountId"
          required
          options={vets.map((v) => ({ value: v.accountId, label: v.nameFa }))}
          data-testid="location-vet"
        />
        <TextField label="نام مرکز" name="nameFa" required data-testid="location-name" />
        <SelectField
          label="نوع مرکز"
          name="kind"
          defaultValue="CLINIC"
          options={[
            { value: 'CLINIC', label: 'کلینیک' },
            { value: 'HOSPITAL', label: 'بیمارستان' },
            { value: 'CENTRE', label: 'مرکز' },
          ]}
          data-testid="location-kind"
        />
        <TextField label="استان" name="provinceFa" data-testid="location-province" />
        <TextField label="شهر" name="cityFa" required data-testid="location-city" />
        <TextField label="محله" name="neighborhoodFa" data-testid="location-neighborhood" />
        <TextField label="نشانی" name="addressFa" required data-testid="location-address" />
        <TextField label="تلفن مرکز" name="phone" required ltr data-testid="location-phone" />
        <TextField label="عرض جغرافیایی" name="latitude" ltr data-testid="location-lat" />
        <TextField label="طول جغرافیایی" name="longitude" ltr data-testid="location-lng" />
        <TextField label="شماره پروانه" name="licenceNumber" ltr data-testid="location-licence-number" />
        <SelectField
          label="وضعیت پروانه"
          name="licenceStatus"
          defaultValue="NONE"
          options={LICENCE_OPTIONS}
          placeholder="انتخاب کنید"
          data-testid="location-licence-status"
        />
        <Capabilities />
        <Button type="submit" block disabled={pending} data-testid="add-location">
          افزودن مرکز
        </Button>
      </form>
    </Card>
  );
}

export function EditLocationForm({
  location,
}: {
  location: {
    id: string;
    nameFa: string;
    version: number;
    licenceStatus: string;
    canImplantMicrochip: boolean;
    canDrawBloodSample: boolean;
    canPregnancyCheck: boolean;
    isActive: boolean;
  };
}) {
  const [state, submit, pending] = useActionState(updateLocationAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid={'edit-location-' + location.id}>
      <input type="hidden" name="locationId" value={location.id} />
      <input type="hidden" name="version" value={location.version} />
      <input type="hidden" name="nameFa" value={location.nameFa} />
      <Result state={state} />
      <SelectField
        label="وضعیت پروانه"
        name="licenceStatus"
        defaultValue={location.licenceStatus}
        options={LICENCE_OPTIONS}
        placeholder="انتخاب کنید"
        data-testid={'licence-' + location.id}
      />
      <Capabilities
        implant={location.canImplantMicrochip}
        blood={location.canDrawBloodSample}
        pregnancy={location.canPregnancyCheck}
        suffix={'-' + location.id}
      />
      <label className="flex items-center gap-sm text-body-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={location.isActive}
          className="size-[var(--size-selection-md)]"
          data-testid={'active-' + location.id}
        />
        این مرکز فعال است
      </label>
      <Button tone="secondary" type="submit" block disabled={pending} data-testid={'save-location-' + location.id}>
        ذخیره تغییرات
      </Button>
    </form>
  );
}
