'use client';

import { startTransition, useActionState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { ReasonField } from '../../../src/ui/decision.tsx';
import { updateSettingAction, type SettingFormState } from './actions.ts';

const EMPTY: SettingFormState = {};

/**
 * One managed value, edited in place (DS P11 edit row, compact: «مقدار تازه» ·
 * «دلیل تغییر» · save, on one line from 768px).
 *
 * Leaving the field empty clears the setting back to NOT_CONFIGURED, which is
 * the honest state for a value nobody has decided yet (D16). The opened version
 * travels with the save, so a stale row cannot overwrite a newer value: the
 * conflict shows the value now saved and keeps the typed draft (no automatic
 * form reset), and «بارگذاری دوباره» moves the row onto the newer version.
 */
export function SettingForm({
  settingKey,
  labelFa,
  version,
  value,
  unit,
}: {
  settingKey: string;
  labelFa?: string;
  version: number;
  value: string;
  unit?: string;
}) {
  const [state, submit, pending] = useActionState(updateSettingAction, EMPTY);
  const id = useId();
  const router = useRouter();
  const input = (
    <input
      id={id + '-value'}
      name="value"
      dir="ltr"
      defaultValue={value}
      aria-describedby={id + '-hint'}
      className="hz-input hz-input--sm hz-input--ltr"
      data-testid={'setting-value-' + settingKey}
    />
  );
  return (
    <form
      onSubmit={(event) => {
        // Submitted by hand so React does not reset the fields: a rejected save keeps the draft.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => submit(data));
      }}
      className="mt-sm space-y-sm"
      aria-label={labelFa ? 'ویرایش ' + labelFa : undefined}
      data-testid={'setting-form-' + settingKey}
    >
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="version" value={version} />
      {state.stale && state.current ? (
        <Alert
          tone="warning"
          title="این تنظیم پس از باز کردن شما تغییر کرده است"
          action={
            <button type="button" className="hz-btn hz-btn--secondary hz-btn--sm" onClick={() => router.refresh()} data-testid={'setting-reload-' + settingKey}>
              <Icon name="arrowClockwise" size="xs" />
              بارگذاری دوباره
            </button>
          }
        >
          {'مقدار فعلی: ' + state.current.display + ' · نسخه ' + state.current.version.toLocaleString('fa-IR') + '. چیزی ذخیره نشد و پیش‌نویس شما نگه داشته شد.'}
        </Alert>
      ) : state.ok && state.savedVersion ? (
        <Alert tone="success" title={'نسخه ' + state.savedVersion.toLocaleString('fa-IR') + ' ذخیره شد'}>
          {state.message}
        </Alert>
      ) : state.message ? (
        <Alert tone="error" title={state.message} />
      ) : null}
      <div className="grid items-end gap-sm md:grid-cols-3">
        <div className="hz-field">
          <label className="hz-field__label" htmlFor={id + '-value'}>
            مقدار تازه
          </label>
          {unit ? (
            <span className="hz-input-wrap hz-input-wrap--suffix">
              {input}
              <span className="hz-input-wrap__suffix">{unit}</span>
            </span>
          ) : (
            input
          )}
        </div>
        {/* A new saved version starts the next change with an empty reason; a rejected save keeps it. */}
        <ReasonField key={state.savedVersion ?? 0} name="reason" label="دلیل تغییر" rows={2} audience={null} hint="در تاریخچه تغییرات ثبت می‌شود." testId={'setting-reason-' + settingKey} />
        <Button tone="secondary" size="sm" type="submit" disabled={pending} loading={pending} loadingLabel="در حال ذخیره…" data-testid={'save-setting-' + settingKey}>
          {'ذخیره به‌عنوان نسخه ' + (version + 1).toLocaleString('fa-IR')}
        </Button>
      </div>
      <p className="hz-field__hint" id={id + '-hint'}>
        خالی گذاشتن یعنی «تعیین‌نشده»، نه صفر.
      </p>
    </form>
  );
}
