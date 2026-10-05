'use client';

import { useActionState, useId } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { updateSettingAction, type SettingFormState } from './actions.ts';

const EMPTY: SettingFormState = {};

/**
 * One managed value, edited in place (DS P11 edit row, compact: «مقدار تازه» ·
 * «دلیل تغییر» · save, on one line from 768px).
 *
 * Leaving the field empty clears the setting back to NOT_CONFIGURED, which is
 * the honest state for a value nobody has decided yet (D16). The opened version
 * travels with the save, so a stale row cannot overwrite a newer value.
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
      action={submit}
      className="mt-sm space-y-sm"
      aria-label={labelFa ? 'ویرایش ' + labelFa : undefined}
      data-testid={'setting-form-' + settingKey}
    >
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="version" value={version} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'} title={state.message} /> : null}
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
        <div className="hz-field">
          <label className="hz-field__label" htmlFor={id + '-reason'}>
            دلیل تغییر
          </label>
          <input
            id={id + '-reason'}
            name="reason"
            className="hz-input hz-input--sm"
            data-testid={'setting-reason-' + settingKey}
          />
        </div>
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
