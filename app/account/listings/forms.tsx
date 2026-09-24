'use client';

import { useActionState, useState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../../../src/ui/field.tsx';
import {
  attachListingMediaAction,
  createListingAction,
  moveListingAction,
  removeListingMediaAction,
  saveListingAction,
  type ListingFormState,
} from './actions.ts';
import {
  DELIVERY_METHODS,
  DELIVERY_METHOD_FA,
  NEUTER_FA,
  PRICE_MODES,
  PRICE_MODE_FA,
  VACCINATION_FA,
  type DeliveryMethod,
  type Disclosure,
} from '../../../src/marketplace/listing-model.ts';

const EMPTY: ListingFormState = {};

export function StartListingForm({ animalId, label }: { animalId: string; label: string }) {
  const [state, submit, pending] = useActionState(createListingAction, EMPTY);
  return (
    <form action={submit} data-testid={'start-listing-' + animalId}>
      <input type="hidden" name="animalId" value={animalId} />
      {state.message ? <Alert tone="error" title={state.message} /> : null}
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'start-listing-button-' + animalId}>
        {pending ? 'در حال ساخت…' : label}
      </Button>
    </form>
  );
}

export interface ListingFormValues {
  readonly listingId: string;
  readonly version: number;
  readonly priceMode: string | null;
  readonly priceToman: string;
  readonly descriptionFa: string;
  readonly reasonForSaleFa: string;
  readonly provinceCode: string;
  readonly cityId: string;
  readonly vaccinationStatus: string | null;
  readonly neuterStatus: string | null;
  readonly healthNoteFa: string;
  readonly deliveryMethods: readonly string[];
}

/**
 * The advert's own content.
 *
 * Everything the animal record already knows — date of birth, sex, breed,
 * identifiers, the current owner — is shown above this form and is not editable
 * here: changing it means correcting the animal, through the process that owns
 * that fact (§10).
 */
export function ListingContentForm({
  values,
  provinces,
  cities,
  disabled,
}: {
  values: ListingFormValues;
  provinces: readonly { code: string; nameFa: string }[];
  cities: readonly { id: string; provinceCode: string; nameFa: string }[];
  disabled: boolean;
}) {
  const [state, submit, pending] = useActionState(saveListingAction, EMPTY);
  const [province, setProvince] = useState(values.provinceCode);
  const [priceMode, setPriceMode] = useState(values.priceMode ?? '');

  return (
    <form action={submit} className="space-y-lg" data-testid="listing-content-form">
      <input type="hidden" name="listingId" value={values.listingId} />
      <input type="hidden" name="version" value={values.version} />
      {state.message ? (
        <div data-testid="listing-save-result">
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        </div>
      ) : null}

      <div className="grid gap-lg md:grid-cols-2">
        <SelectField
          label="نوع قیمت"
          name="priceMode"
          required
          defaultValue={values.priceMode ?? ''}
          onChange={(event) => setPriceMode(event.target.value)}
          options={PRICE_MODES.map((mode) => ({ value: mode, label: PRICE_MODE_FA[mode] }))}
          disabled={disabled}
          data-testid="listing-price-mode"
        />
        <TextField
          label="مبلغ (تومان)"
          name="priceToman"
          ltr
          inputMode="numeric"
          defaultValue={values.priceToman}
          hint={
            priceMode === 'NEGOTIABLE'
              ? 'در قیمت توافقی مبلغ خالی می‌ماند و قیمت نهایی در مذاکره قفل می‌شود.'
              : 'فقط رقم، بدون جداکننده.'
          }
          disabled={disabled || priceMode === 'NEGOTIABLE'}
          data-testid="listing-price"
        />
      </div>

      <TextAreaField
        label="توضیح آگهی"
        name="descriptionFa"
        rows={6}
        required
        defaultValue={values.descriptionFa}
        hint="آنچه خریدار باید بداند و در پرونده حیوان نیست."
        disabled={disabled}
        data-testid="listing-description"
      />

      <TextAreaField
        label="دلیل فروش"
        name="reasonForSaleFa"
        rows={2}
        required
        defaultValue={values.reasonForSaleFa}
        disabled={disabled}
        data-testid="listing-reason"
      />

      <div className="grid gap-lg md:grid-cols-2">
        <SelectField
          label="استان"
          name="provinceCode"
          required
          defaultValue={values.provinceCode}
          onChange={(event) => setProvince(event.target.value)}
          options={provinces.map((row) => ({ value: row.code, label: row.nameFa }))}
          disabled={disabled}
          data-testid="listing-province"
        />
        <SelectField
          label="شهر"
          name="cityId"
          required
          defaultValue={values.cityId}
          options={cities
            .filter((row) => row.provinceCode === province)
            .map((row) => ({ value: row.id, label: row.nameFa }))}
          disabled={disabled}
          data-testid="listing-city"
        />
      </div>

      <fieldset className="space-y-md rounded-lg border border-border-subtle p-lg">
        <legend className="px-xs text-label-md">اظهارات فروشنده</legend>
        <p className="text-caption text-text-secondary">
          همزیست سابقه واکسیناسیون و عقیم‌سازی را نگه نمی‌دارد؛ این موارد اظهار فروشنده‌اند و به همین شکل به
          خریدار نشان داده می‌شوند. «نمی‌دانم» یک پاسخ معتبر است.
        </p>
        <div className="grid gap-lg md:grid-cols-2">
          <SelectField
            label="وضعیت واکسیناسیون"
            name="vaccinationStatus"
            required
            defaultValue={values.vaccinationStatus ?? ''}
            options={(Object.keys(VACCINATION_FA) as Disclosure[]).map((key) => ({
              value: key,
              label: VACCINATION_FA[key],
            }))}
            disabled={disabled}
            data-testid="listing-vaccination"
          />
          <SelectField
            label="وضعیت عقیم‌سازی"
            name="neuterStatus"
            required
            defaultValue={values.neuterStatus ?? ''}
            options={(Object.keys(NEUTER_FA) as Disclosure[]).map((key) => ({
              value: key,
              label: NEUTER_FA[key],
            }))}
            disabled={disabled}
            data-testid="listing-neuter"
          />
        </div>
        <TextAreaField
          label="یادداشت سلامت (اختیاری)"
          name="healthNoteFa"
          rows={3}
          defaultValue={values.healthNoteFa}
          disabled={disabled}
          data-testid="listing-health-note"
        />
      </fieldset>

      <fieldset className="space-y-sm rounded-lg border border-border-subtle p-lg">
        <legend className="px-xs text-label-md">روش‌های تحویل که ارائه می‌دهید</legend>
        {DELIVERY_METHODS.map((method: DeliveryMethod) => (
          <label key={method} className="flex items-center gap-sm text-body-sm">
            <input
              type="checkbox"
              name="deliveryMethods"
              value={method}
              defaultChecked={values.deliveryMethods.includes(method)}
              disabled={disabled}
              className="size-5 rounded border-border-strong"
              data-testid={'listing-delivery-' + method}
            />
            {DELIVERY_METHOD_FA[method]}
          </label>
        ))}
      </fieldset>

      <Button type="submit" disabled={pending || disabled} data-testid="save-listing">
        {pending ? 'در حال ذخیره…' : 'ذخیره اطلاعات آگهی'}
      </Button>
    </form>
  );
}

export function AddMediaForm({ listingId, kind }: { listingId: string; kind: 'IMAGE' | 'VIDEO' }) {
  const [state, submit, pending] = useActionState(attachListingMediaAction, EMPTY);
  const image = kind === 'IMAGE';
  return (
    <form action={submit} className="space-y-md" data-testid={'add-media-' + kind}>
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="kind" value={kind} />
      {state.message ? (
        <div data-testid={'media-result-' + kind}>
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        </div>
      ) : null}
      <FileField
        label={image ? 'افزودن تصویر' : 'افزودن ویدئو (اختیاری)'}
        name="file"
        accept={image ? 'image/jpeg,image/png' : 'video/mp4'}
        maxBytes={image ? 5 * 1024 * 1024 : 20 * 1024 * 1024}
        hint={image ? 'JPG یا PNG، حداکثر ۵ مگابایت.' : 'MP4، حداکثر ۲۰ مگابایت. هر آگهی یک ویدئو می‌پذیرد.'}
        required
        testId={'media-file-' + kind}
      />
      <TextField
        label="متن جایگزین"
        name="altFa"
        required
        hint="برای کسی که تصویر را نمی‌بیند، بنویسید چه چیزی در آن است."
        data-testid={'media-alt-' + kind}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'upload-media-' + kind}>
        {pending ? 'در حال بارگذاری…' : image ? 'بارگذاری تصویر' : 'بارگذاری ویدئو'}
      </Button>
    </form>
  );
}

export function RemoveMediaForm({ listingId, mediaId }: { listingId: string; mediaId: string }) {
  const [state, submit, pending] = useActionState(removeListingMediaAction, EMPTY);
  return (
    <form action={submit} data-testid={'remove-media-form-' + mediaId}>
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="mediaId" value={mediaId} />
      {state.message && !state.ok ? <Alert tone="error" title={state.message} /> : null}
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'remove-media-' + mediaId}>
        حذف
      </Button>
    </form>
  );
}

/** Publish, pause, resume or remove. Only the moves the state machine allows are rendered. */
export function MoveListingForm({
  listingId,
  version,
  to,
  label,
  tone = 'secondary',
  withReason = false,
}: {
  listingId: string;
  version: number;
  to: string;
  label: string;
  tone?: 'primary' | 'secondary' | 'ghost';
  withReason?: boolean;
}) {
  const [state, submit, pending] = useActionState(moveListingAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'move-form-' + to}>
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="to" value={to} />
      {state.message ? (
        <div data-testid={'move-result-' + to}>
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        </div>
      ) : null}
      {withReason ? <TextField label="دلیل (اختیاری)" name="reason" data-testid={'move-reason-' + to} /> : null}
      <Button type="submit" tone={tone} disabled={pending} data-testid={'move-' + to}>
        {pending ? 'در حال ثبت…' : label}
      </Button>
    </form>
  );
}

/** A small read-only card used for the animals that cannot be listed yet. */
export function BlockedAnimalCard({
  title,
  blockers,
}: {
  title: string;
  blockers: readonly { code: string; messageFa: string; href?: string; ctaFa?: string }[];
}) {
  return (
    <Card>
      <h3 className="text-label-md">{title}</h3>
      <ul className="mt-sm space-y-2xs text-caption text-text-secondary" data-testid="animal-blockers">
        {blockers.map((blocker) => (
          <li key={blocker.code}>
            {blocker.messageFa}
            {blocker.href ? (
              <a className="mx-xs text-text-brand" href={blocker.href}>
                {blocker.ctaFa ?? 'ادامه'}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
