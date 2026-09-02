'use client';

import { useActionState } from 'react';
import { Card } from '../../../src/ui/card.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { addBreedAction, setBreedActiveAction, type BreedFormState } from './actions.ts';

const EMPTY: BreedFormState = {};

function Result({ state }: { state: BreedFormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />;
}

export function AddBreedForm() {
  const [state, submit, pending] = useActionState(addBreedAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">افزودن نژاد به فهرست مرجع</h2>
      <form action={submit} className="mt-lg space-y-lg" data-testid="add-breed-form">
        <Result state={state} />
        <TextField label="نام فارسی" name="nameFa" required data-testid="breed-name-fa" />
        <TextField label="نام لاتین" name="nameEn" ltr required data-testid="breed-name-en" />
        <Button type="submit" block disabled={pending} data-testid="add-breed">
          {pending ? 'در حال ثبت…' : 'افزودن نژاد'}
        </Button>
      </form>
    </Card>
  );
}

/** Retiring or restoring one breed; every change is audited with its actor. */
export function BreedStateForm({
  breedId,
  active,
  suffix,
}: {
  breedId: string;
  active: boolean;
  suffix: string;
}) {
  const [state, submit, pending] = useActionState(setBreedActiveAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-sm" data-testid={'breed-state-form-' + suffix}>
      <input type="hidden" name="breedId" value={breedId} />
      <input type="hidden" name="active" value={active ? 'NO' : 'YES'} />
      <Result state={state} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'toggle-breed-' + suffix}>
        {pending ? 'در حال ثبت…' : active ? 'کنارگذاشتن از انتخاب‌های جدید' : 'فعال‌سازی دوباره'}
      </Button>
    </form>
  );
}
