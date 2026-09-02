'use client';

import { useActionState } from 'react';
import { Alert } from '../../src/ui/alert.tsx';
import { Button } from '../../src/ui/button.tsx';
import { LocationField, TextField } from '../../src/ui/field.tsx';
import { useState } from 'react';
import {
  completeProfileAction,
  confirmMobileChangeAction,
  saveProfileAction,
  saveResidenceAction,
  startMobileChangeAction,
  type FormState,
} from './actions.ts';

const EMPTY: FormState = {};

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert
      tone={state.tone === 'success' ? 'success' : state.tone === 'error' ? 'error' : 'info'}
      title={state.message}
    />
  );
}

export interface ProfileValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly nationalId: string;
  readonly birthDate: string;
  readonly displayName: string;
  readonly displayNameVisible: boolean;
}

/**
 * Identity fields (§6.2, §6.4).
 *
 * After KYC approval the national id is read-only while the name and birth date
 * stay directly editable — no support gate and no second KYC.
 */
export function IdentityForm({
  values,
  nationalIdLocked,
  mode,
  next,
}: {
  values: Partial<ProfileValues>;
  nationalIdLocked: boolean;
  mode: 'complete' | 'edit';
  next?: string | null;
}) {
  const [state, submit, pending] = useActionState(
    mode === 'complete' ? completeProfileAction : saveProfileAction,
    EMPTY,
  );

  return (
    <form action={submit} className="space-y-lg" data-testid="identity-form">
      <Result state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <TextField label="نام" name="firstName" required defaultValue={values.firstName ?? ''} data-testid="first-name" />
      <TextField label="نام خانوادگی" name="lastName" required defaultValue={values.lastName ?? ''} data-testid="last-name" />

      {nationalIdLocked ? (
        <div className="space-y-xs">
          <span className="block text-label-md">کد ملی</span>
          <p className="rounded-md border border-border-disabled bg-bg-disabled px-md py-sm">
            <bdi className="hz-ltr font-mono" data-testid="national-id-readonly">
              {values.nationalId}
            </bdi>
          </p>
          <p className="text-caption text-text-secondary">کد ملی پس از تأیید احراز هویت قابل تغییر نیست.</p>
          <input type="hidden" name="nationalId" value={values.nationalId ?? ''} />
        </div>
      ) : (
        <TextField
          label="کد ملی"
          name="nationalId"
          required
          ltr
          inputMode="numeric"
          hint="ده رقم، بدون خط تیره."
          defaultValue={values.nationalId ?? ''}
          data-testid="national-id"
        />
      )}

      <TextField
        label="تاریخ تولد"
        name="birthDate"
        required
        ltr
        type="date"
        defaultValue={values.birthDate ?? ''}
        data-testid="birth-date"
      />
      <TextField
        label="نام نمایشی"
        name="displayName"
        hint="اختیاری. اگر خالی بماند، نام نمایشی ثبت نمی‌شود."
        defaultValue={values.displayName ?? ''}
        data-testid="display-name"
      />
      <label className="flex items-center gap-sm text-label-md">
        <input
          type="checkbox"
          name="displayNameVisible"
          defaultChecked={values.displayNameVisible ?? false}
          className="size-[var(--size-selection-md)]"
          data-testid="display-name-visible"
        />
        نام نمایشی برای دیگران دیده شود
      </label>

      <Button type="submit" block disabled={pending} data-testid="save-identity">
        {pending ? 'در حال ذخیره…' : mode === 'complete' ? 'ادامه' : 'ذخیره اطلاعات هویتی'}
      </Button>
    </form>
  );
}

/** Residence is an optional group; an empty one blocks nothing downstream. */
export function ResidenceForm({
  values,
}: {
  values: { province?: string | null; city?: string | null; address?: string | null; postalCode?: string | null };
}) {
  const [state, submit, pending] = useActionState(saveResidenceAction, EMPTY);
  const [address, setAddress] = useState(values.address ?? '');

  return (
    <form action={submit} className="space-y-lg" data-testid="residence-form">
      <Result state={state} />
      <p className="text-caption text-text-secondary">
        این بخش اختیاری است. خالی‌بودن آن، تکمیل حساب، احراز هویت و ثبت حیوان را قفل نمی‌کند.
      </p>
      <TextField label="استان" name="province" defaultValue={values.province ?? ''} />
      <TextField label="شهر" name="city" defaultValue={values.city ?? ''} />
      <LocationField
        label="نشانی"
        mapAvailable={false}
        value={address}
        onChange={setAddress}
      />
      <input type="hidden" name="address" value={address} />
      <TextField
        label="کدپستی"
        name="postalCode"
        ltr
        inputMode="numeric"
        hint="اختیاری؛ اگر وارد شود باید ده رقم باشد."
        defaultValue={values.postalCode ?? ''}
        data-testid="postal-code"
      />
      <Button type="submit" block disabled={pending} data-testid="save-residence">
        {pending ? 'در حال ذخیره…' : 'ذخیره اطلاعات سکونت'}
      </Button>
    </form>
  );
}

/**
 * Mobile change (§6.4): a code goes to the new number and the current number
 * stays valid until it is verified.
 */
export function MobileChangeForm({ currentMobile }: { currentMobile: string }) {
  const [startState, startSubmit, startPending] = useActionState(startMobileChangeAction, EMPTY);
  const [confirmState, confirmSubmit, confirmPending] = useActionState(confirmMobileChangeAction, EMPTY);
  const challengeId = confirmState.challengeId ?? startState.challengeId;
  const done = confirmState.ok === true && !confirmState.challengeId;

  return (
    <div className="space-y-xl">
      <p className="text-body-sm">
        شماره فعلی: <bdi className="hz-ltr font-mono" data-testid="current-mobile">{currentMobile}</bdi>
      </p>

      <form action={startSubmit} className="space-y-lg" data-testid="start-mobile-change">
        <Result state={startState} />
        <TextField
          label="شماره موبایل جدید"
          name="mobile"
          required
          ltr
          inputMode="tel"
          hint="کد تأیید به شماره جدید ارسال می‌شود. تا تأیید موفق، شماره فعلی معتبر می‌ماند."
          data-testid="new-mobile"
        />
        <Button type="submit" block disabled={startPending} data-testid="send-change-code">
          {startPending ? 'در حال ارسال…' : 'ارسال کد به شماره جدید'}
        </Button>
      </form>

      {challengeId && !done ? (
        <form action={confirmSubmit} className="space-y-lg" data-testid="confirm-mobile-change">
          <Result state={confirmState} />
          <input type="hidden" name="challengeId" value={challengeId} />
          <TextField label="کد تأیید شماره جدید" name="code" required ltr inputMode="numeric" data-testid="change-code" />
          <Button type="submit" block disabled={confirmPending} data-testid="confirm-change">
            {confirmPending ? 'در حال بررسی…' : 'تأیید تغییر شماره'}
          </Button>
        </form>
      ) : null}

      {done ? <Result state={confirmState} /> : null}
    </div>
  );
}
