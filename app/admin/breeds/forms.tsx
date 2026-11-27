'use client';

import { useActionState } from 'react';
import { Card } from '../../../src/ui/card.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { SectionHeader } from '../../../src/ui/section-header.tsx';
import { StateChangeForm } from '../../../src/ui/state-change-form.tsx';
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

/** Retiring or restoring one breed, with a reason and the version it was decided on (P11, RTO-018). */
export function BreedStateForm({
  breedId,
  active,
  version,
  suffix,
}: {
  breedId: string;
  active: boolean;
  version: number;
  suffix: string;
}) {
  const label = active ? 'کنارگذاشتن از انتخاب‌های جدید' : 'فعال‌سازی دوباره';
  return (
    <StateChangeForm
      action={setBreedActiveAction}
      hidden={{ breedId, active: active ? 'NO' : 'YES' }}
      version={version}
      changeFa={label}
      openLabel={label}
      ids={{
        form: 'breed-state-form-' + suffix,
        open: 'toggle-breed-' + suffix,
        reason: 'breed-reason-' + suffix,
        save: 'breed-state-save-' + suffix,
      }}
    />
  );
}
