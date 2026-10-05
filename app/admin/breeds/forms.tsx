'use client';

import { useActionState } from 'react';
import { Card } from '../../../src/ui/card.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { SectionHeader } from '../../../src/ui/section-header.tsx';
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
      <SectionHeader title="افزودن نژاد به فهرست مرجع" size="sm" />
      <form action={submit} className="mt-md space-y-md" data-testid="add-breed-form">
        <Result state={state} />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="نام فارسی" name="nameFa" required data-testid="breed-name-fa" />
          <TextField label="نام لاتین" name="nameEn" ltr required data-testid="breed-name-en" />
        </div>
        <Button type="submit" loading={pending} loadingLabel="در حال ثبت…" disabled={pending} data-testid="add-breed">
          افزودن نژاد
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
    <form action={submit} className="space-y-xs" data-testid={'breed-state-form-' + suffix}>
      <input type="hidden" name="breedId" value={breedId} />
      <input type="hidden" name="active" value={active ? 'NO' : 'YES'} />
      <Result state={state} />
      <Button type="submit" tone="ghost" size="sm" disabled={pending} data-testid={'toggle-breed-' + suffix}>
        {pending ? 'در حال ثبت…' : active ? 'کنارگذاشتن از انتخاب‌های جدید' : 'فعال‌سازی دوباره'}
      </Button>
    </form>
  );
}
