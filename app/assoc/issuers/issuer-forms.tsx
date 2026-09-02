'use client';

import { useActionState } from 'react';
import { Alert } from '../../../src/ui/alert.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { TextField } from '../../../src/ui/field.tsx';
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

export function ToggleIssuerForm({ issuerId, isActive }: { issuerId: string; isActive: boolean }) {
  const [state, submit, pending] = useActionState(setIssuerActiveAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'toggle-issuer-' + issuerId}>
      <Result state={state} />
      <input type="hidden" name="issuerId" value={issuerId} />
      <input type="hidden" name="isActive" value={isActive ? 'false' : 'true'} />
      <TextField label="دلیل" name="reasonFa" required data-testid="toggle-reason" />
      <Button tone="secondary" type="submit" disabled={pending} data-testid="toggle-issuer-submit">
        {isActive ? 'غیرفعال‌کردن' : 'فعال‌کردن'}
      </Button>
    </form>
  );
}
