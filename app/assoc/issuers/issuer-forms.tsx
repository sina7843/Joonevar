'use client';

import { useActionState } from 'react';
import { Alert } from '../../../src/ui/alert.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { StateChangeForm } from '../../../src/ui/state-change-form.tsx';
import { addIssuerAction, setIssuerActiveAction, type IssuerState } from './actions.ts';

const EMPTY: IssuerState = {};

function Result({ state }: { state: IssuerState }) {
  if (!state.message) return null;
  return <Alert tone={state.tone === 'success' ? 'success' : 'error'} title={state.message} />;
}

export function AddIssuerForm() {
  const [state, submit, pending] = useActionState(addIssuerAction, EMPTY);
  return (
    <form action={submit} className="space-y-lg" data-testid="add-issuer-form">
      <Result state={state} />
      <TextField label="نام صادرکننده" name="name" required data-testid="issuer-name" />
      <TextField label="کشور" name="country" data-testid="issuer-country" />
      <TextField label="یادداشت" name="noteFa" data-testid="issuer-note" />
      <Button type="submit" block disabled={pending} data-testid="add-issuer">
        {pending ? 'در حال ثبت…' : 'افزودن به فهرست موردتأیید'}
      </Button>
    </form>
  );
}

/** Turning one issuer on or off, with a reason and the version it was decided on (P11, RTO-018). */
export function ToggleIssuerForm({ issuerId, isActive, version }: { issuerId: string; isActive: boolean; version: number }) {
  return (
    <StateChangeForm
      action={setIssuerActiveAction}
      hidden={{ issuerId, isActive: isActive ? 'false' : 'true' }}
      version={version}
      changeFa={isActive ? 'غیرفعال‌کردن' : 'فعال‌کردن'}
      alwaysOpen
      ids={{ form: 'toggle-issuer-' + issuerId, reason: 'toggle-reason', save: 'toggle-issuer-submit' }}
    />
  );
}
