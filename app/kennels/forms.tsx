'use client';

import { useActionState, useState } from 'react';
import { Card } from '../../src/ui/card.tsx';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { TextField } from '../../src/ui/field.tsx';
import {
  addBreedAction,
  cancelKennelPaymentAction,
  payKennelAction,
  removeBreedAction,
  saveKennelAction,
  startKennelAction,
  submitKennelAction,
  type KennelFormState,
} from './actions.ts';

const EMPTY: KennelFormState = {};

function Result({ state }: { state: KennelFormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? (state.tone === 'info' ? 'info' : 'success') : 'error'} title={state.message} />
  );
}

/** The entry the source names by label: «شروع ثبت کنل» (§15.2). */
export function StartKennelForm({ label }: { label: string }) {
  return (
    <form action={startKennelAction} data-testid="start-kennel-form">
      <Button type="submit" block data-testid="start-kennel">
        {label}
      </Button>
    </form>
  );
}

/**
 * The kennel's own fields — §15.2.
 *
 * The address here is the kennel's and is required before submission; the
 * residence on the account is a different, optional thing.
 */
export function KennelForm({
  kennel,
}: {
  kennel: {
    id: string;
    nameFa: string | null;
    nameEn: string | null;
    phone: string | null;
    provinceFa: string | null;
    cityFa: string | null;
    addressFa: string | null;
    latitude: number | null;
    longitude: number | null;
    noteFa: string | null;
  };
}) {
  const [state, submit, pending] = useActionState(saveKennelAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">مشخصات کنل</h2>
      <p className="mt-md text-caption text-text-secondary">
        نشانی کنل برای ارسال پرونده لازم است. نشانی محل سکونت شما جدا و اختیاری است و خالی‌بودن آن مانع ثبت
        کنل نیست.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="kennel-form">
        <input type="hidden" name="kennelId" value={kennel.id} />
        <Result state={state} />
        <TextField label="نام کنل" name="nameFa" required defaultValue={kennel.nameFa ?? ''} data-testid="kennel-name" />
        <TextField label="نام لاتین (اختیاری)" name="nameEn" ltr defaultValue={kennel.nameEn ?? ''} data-testid="kennel-name-en" />
        <TextField label="تلفن کنل" name="phone" ltr defaultValue={kennel.phone ?? ''} data-testid="kennel-phone" />
        <TextField label="استان" name="province" defaultValue={kennel.provinceFa ?? ''} data-testid="kennel-province" />
        <TextField label="شهر" name="city" required defaultValue={kennel.cityFa ?? ''} data-testid="kennel-city" />
        <TextField label="نشانی کنل" name="address" required defaultValue={kennel.addressFa ?? ''} data-testid="kennel-address" />
        <TextField label="عرض جغرافیایی (اختیاری)" name="latitude" ltr defaultValue={kennel.latitude ?? ''} data-testid="kennel-lat" />
        <TextField label="طول جغرافیایی (اختیاری)" name="longitude" ltr defaultValue={kennel.longitude ?? ''} data-testid="kennel-lng" />
        <TextField label="توضیح (اختیاری)" name="note" defaultValue={kennel.noteFa ?? ''} data-testid="kennel-note" />
        <Button tone="secondary" type="submit" block disabled={pending} data-testid="save-kennel">
          {pending ? 'در حال ذخیره…' : 'ذخیره مشخصات'}
        </Button>
      </form>
    </Card>
  );
}

/**
 * Breeds — §15.2, §15.3.
 *
 * Search runs over the Persian and the English name of the same reference
 * registry the animal form uses, the chosen ones are listed with their count,
 * and the last one cannot be removed.
 */
export function KennelBreeds({
  kennelId,
  selected,
  options,
  editable,
}: {
  kennelId: string;
  selected: ReadonlyArray<{ breedId: string; nameFa: string; nameEn: string }>;
  options: ReadonlyArray<{ id: string; nameFa: string; nameEn: string }>;
  editable: boolean;
}) {
  const [addState, add, adding] = useActionState(addBreedAction, EMPTY);
  const [removeState, remove, removing] = useActionState(removeBreedAction, EMPTY);
  const [term, setTerm] = useState('');

  const chosen = new Set(selected.map((row) => row.breedId));
  const needle = term.trim().toLowerCase();
  const matches = options
    .filter((row) => !chosen.has(row.id))
    .filter(
      (row) =>
        needle === '' ||
        row.nameFa.toLowerCase().includes(needle) ||
        row.nameEn.toLowerCase().includes(needle),
    )
    .slice(0, 8);

  return (
    <Card>
      <h2 className="text-label-lg">نژادهای پرورشی</h2>
      <p className="mt-md text-caption text-text-secondary" data-testid="breed-count">
        {selected.length} نژاد انتخاب شده است. حداقل یک نژاد لازم است و کنل تک‌نژادی همین مسیر با یک انتخاب
        است.
      </p>

      <Result state={addState} />
      <Result state={removeState} />

      <ul className="mt-lg space-y-sm text-body-sm" data-testid="kennel-breeds">
        {selected.map((row) => (
          <li key={row.breedId} className="flex items-center justify-between gap-md">
            <span>
              {row.nameFa} · <bdi className="hz-ltr">{row.nameEn}</bdi>
            </span>
            {editable ? (
              <form action={remove} data-testid={'remove-breed-form-' + row.breedId}>
                <input type="hidden" name="kennelId" value={kennelId} />
                <input type="hidden" name="breedId" value={row.breedId} />
                <Button
                  tone="ghost"
                  type="submit"
                  disabled={removing}
                  data-testid={'remove-breed-' + row.breedId}
                >
                  حذف
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {editable ? (
        <div className="mt-lg space-y-lg">
          <TextField
            label="جست‌وجوی نژاد"
            name="breedSearch"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            hint="جست‌وجو با نام فارسی یا انگلیسی انجام می‌شود."
            data-testid="breed-search"
          />
          <ul className="space-y-sm text-body-sm" data-testid="breed-options">
            {matches.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-md">
                <span>
                  {row.nameFa} · <bdi className="hz-ltr">{row.nameEn}</bdi>
                </span>
                <form action={add} data-testid={'add-breed-form-' + row.id}>
                  <input type="hidden" name="kennelId" value={kennelId} />
                  <input type="hidden" name="breedId" value={row.id} />
                  <Button tone="secondary" type="submit" disabled={adding} data-testid={'add-breed-' + row.id}>
                    افزودن
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

export function PayKennelForm({ kennelId, batchId }: { kennelId: string; batchId: string | null }) {
  const [state, submit, pending] = useActionState(payKennelAction, EMPTY);
  return (
    <>
      <form action={submit} className="mt-lg space-y-lg" data-testid="pay-kennel-form">
        <input type="hidden" name="kennelId" value={kennelId} />
        <Result state={state} />
        <Button type="submit" block disabled={pending} data-testid="pay-kennel">
          {pending ? 'در حال انتقال به درگاه…' : 'پرداخت ثبت کنل'}
        </Button>
      </form>
      {batchId ? (
        <form action={cancelKennelPaymentAction} className="mt-md" data-testid="cancel-kennel-payment-form">
          <input type="hidden" name="kennelId" value={kennelId} />
          <input type="hidden" name="batchId" value={batchId} />
          <Button tone="ghost" type="submit" block data-testid="cancel-kennel-payment">
            لغو پرداخت جاری
          </Button>
        </form>
      ) : null}
    </>
  );
}

export function SubmitKennelForm({ kennelId }: { kennelId: string }) {
  const [state, submit, pending] = useActionState(submitKennelAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="submit-kennel-form">
      <input type="hidden" name="kennelId" value={kennelId} />
      <Result state={state} />
      <Button type="submit" block disabled={pending} data-testid="submit-kennel">
        {pending ? 'در حال ارسال…' : 'ارسال برای بررسی انجمن'}
      </Button>
    </form>
  );
}
