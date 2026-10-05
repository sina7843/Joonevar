'use client';

import { useActionState } from 'react';
import { Alert } from '../../src/ui/alert.tsx';
import { ActionRow, Button } from '../../src/ui/button.tsx';
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
  primary = true,
}: {
  values: Partial<ProfileValues>;
  nationalIdLocked: boolean;
  mode: 'complete' | 'edit';
  next?: string | null;
  /** One primary per view: a page whose next step is elsewhere passes false. */
  primary?: boolean;
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
        <div className="hz-field">
          <span className="hz-field__label">کد ملی</span>
          <div className="hz-input hz-input--ltr flex items-center" aria-readonly="true" aria-disabled="true">
            <bdi dir="ltr" data-testid="national-id-readonly">
              {values.nationalId}
            </bdi>
          </div>
          <div className="hz-field__hint">کد ملی پس از تأیید احراز هویت قابل تغییر نیست.</div>
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
        required
        hint="نامی که در صورت روشن‌بودن نمایش، دیگران می‌بینند."
        defaultValue={values.displayName ?? ''}
        data-testid="display-name"
      />
      <label className="hz-check">
        <input
          type="checkbox"
          name="displayNameVisible"
          defaultChecked={values.displayNameVisible ?? false}
          data-testid="display-name-visible"
        />
        <span className="hz-check__text">
          <span className="hz-check__label">نام نمایشی برای دیگران دیده شود</span>
        </span>
      </label>

      <ActionRow
        primary={
          <Button type="submit" tone={primary ? 'primary' : 'secondary'} size={primary ? 'lg' : 'md'} block={mode === 'complete'} loading={pending} disabled={pending} loadingLabel="در حال ذخیره…" data-testid="save-identity">
            {mode === 'complete' ? 'ادامه' : 'ذخیره اطلاعات هویتی'}
          </Button>
        }
      />
    </form>
  );
}

/** Residence is an optional group; an empty one blocks nothing downstream. */
export function ResidenceForm({
  values,
  mapAvailable = false,
}: {
  values: { province?: string | null; city?: string | null; address?: string | null; postalCode?: string | null };
  /** True when a map key is configured; manual entry works either way. */
  mapAvailable?: boolean;
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
        mapAvailable={mapAvailable}
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
      <ActionRow
        primary={
          <Button type="submit" tone="secondary" loading={pending} disabled={pending} loadingLabel="در حال ذخیره…" data-testid="save-residence">
            ذخیره اطلاعات سکونت
          </Button>
        }
      />
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
      <div className="hz-setting">
        <div className="hz-setting__label">
          <span className="hz-setting__name">شماره فعلی</span>
        </div>
        <div className="hz-setting__end">
          <bdi className="hz-setting__value" dir="ltr" data-testid="current-mobile">
            {currentMobile}
          </bdi>
        </div>
      </div>

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
        <ActionRow
          primary={
            <Button type="submit" tone={challengeId && !done ? 'secondary' : 'primary'} loading={startPending} disabled={startPending} loadingLabel="در حال ارسال…" data-testid="send-change-code">
              ارسال کد به شماره جدید
            </Button>
          }
        />
      </form>

      {challengeId && !done ? (
        <form action={confirmSubmit} className="space-y-lg border-t border-border-subtle pt-xl" data-testid="confirm-mobile-change">
          <Result state={confirmState} />
          <input type="hidden" name="challengeId" value={challengeId} />
          <TextField label="کد تأیید شماره جدید" name="code" required ltr inputMode="numeric" data-testid="change-code" />
          <ActionRow
            primary={
              <Button type="submit" loading={confirmPending} disabled={confirmPending} loadingLabel="در حال بررسی…" data-testid="confirm-change">
                تأیید تغییر شماره
              </Button>
            }
          />
        </form>
      ) : null}

      {done ? <Result state={confirmState} /> : null}
    </div>
  );
}
