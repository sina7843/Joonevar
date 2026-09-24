'use client';

import { useActionState } from 'react';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { TextField } from '../../src/ui/field.tsx';
import {
  setSpeciesEnabledAction,
  updateMarketSettingAction,
  type MarketFormState,
} from './actions.ts';

const EMPTY: MarketFormState = {};

/**
 * One kill switch.
 *
 * The button says what pressing it does, not what the current state is, and the
 * reason is mandatory because closing a flow stops other people trading.
 */
export function FlagForm({
  settingKey,
  version,
  enabled,
}: {
  settingKey: string;
  version: number;
  enabled: boolean;
}) {
  const [state, submit, pending] = useActionState(updateMarketSettingAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'flag-form-' + settingKey}>
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="value" value={enabled ? 'false' : 'true'} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'} title={state.message} /> : null}
      <TextField label="دلیل تغییر" name="reason" required data-testid={'flag-reason-' + settingKey} />
      <Button
        tone={enabled ? 'secondary' : 'primary'}
        type="submit"
        disabled={pending}
        data-testid={'flag-toggle-' + settingKey}
      >
        {pending ? 'در حال ثبت…' : enabled ? 'بستن این مسیر' : 'باز کردن این مسیر'}
      </Button>
    </form>
  );
}

/** One managed marketplace value, edited in place with a mandatory reason. */
export function MarketSettingForm({
  settingKey,
  version,
  value,
  kind,
}: {
  settingKey: string;
  version: number;
  value: string;
  kind: string;
}) {
  const [state, submit, pending] = useActionState(updateMarketSettingAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'market-setting-form-' + settingKey}>
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="version" value={version} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'} title={state.message} /> : null}
      <TextField
        label="مقدار"
        name="value"
        ltr
        defaultValue={value}
        hint={
          kind === 'BOOL'
            ? 'مقدار true یا false. خالی گذاشتن یعنی «تعیین‌نشده» و مثل بسته رفتار می‌شود.'
            : 'خالی گذاشتن یعنی «تعیین‌نشده»، نه صفر و نه رایگان.'
        }
        data-testid={'market-setting-value-' + settingKey}
      />
      <TextField label="دلیل تغییر" name="reason" required data-testid={'market-setting-reason-' + settingKey} />
      <Button tone="secondary" type="submit" disabled={pending} data-testid={'market-setting-save-' + settingKey}>
        {pending ? 'در حال ذخیره…' : 'ذخیره مقدار'}
      </Button>
    </form>
  );
}

/** Open or close one species in one market. */
export function SpeciesForm({
  market,
  speciesCode,
  version,
  enabled,
}: {
  market: string;
  speciesCode: string;
  version: number;
  enabled: boolean;
}) {
  const [state, submit, pending] = useActionState(setSpeciesEnabledAction, EMPTY);
  const id = market + '-' + speciesCode;
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'species-form-' + id}>
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="speciesCode" value={speciesCode} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'} title={state.message} /> : null}
      <TextField label="دلیل تغییر" name="reason" required data-testid={'species-reason-' + id} />
      <Button
        tone={enabled ? 'secondary' : 'primary'}
        type="submit"
        disabled={pending}
        data-testid={'species-toggle-' + id}
      >
        {pending ? 'در حال ثبت…' : enabled ? 'غیرفعال کردن این گونه' : 'فعال کردن این گونه'}
      </Button>
    </form>
  );
}
