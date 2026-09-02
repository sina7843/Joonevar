'use client';

import { useActionState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { updateSettingAction, type SettingFormState } from './actions.ts';

const EMPTY: SettingFormState = {};

/**
 * One managed value, edited in place.
 *
 * Leaving the field empty clears the setting back to NOT_CONFIGURED, which is
 * the honest state for a value nobody has decided yet (D16).
 */
export function SettingForm({
  settingKey,
  version,
  value,
}: {
  settingKey: string;
  version: number;
  value: string;
}) {
  const [state, submit, pending] = useActionState(updateSettingAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid={'setting-form-' + settingKey}>
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="version" value={version} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'} title={state.message} /> : null}
      <TextField
        label="مقدار"
        name="value"
        ltr
        defaultValue={value}
        hint="خالی گذاشتن یعنی «تعیین‌نشده»."
        data-testid={'setting-value-' + settingKey}
      />
      <TextField label="دلیل تغییر" name="reason" data-testid={'setting-reason-' + settingKey} />
      <Button tone="secondary" type="submit" block disabled={pending} data-testid={'save-setting-' + settingKey}>
        {pending ? 'در حال ذخیره…' : 'ذخیره مقدار'}
      </Button>
    </form>
  );
}
