'use client';

import { useActionState } from 'react';
import { Alert } from '../../../src/ui/alert.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { editAnimalAction, type FormState } from '../actions.ts';

const EMPTY: FormState = {};

/**
 * Editable identity fields (§10).
 *
 * Microchip number, sample code, genetic result and pedigree data are not here
 * on purpose: they are corrected through the process and the actor that owns
 * them, never from this general form. The server refuses them as well.
 */
export function AnimalEditForm({
  animalId,
  values,
}: {
  animalId: string;
  values: { name: string; color: string; markings: string; birthDateApproximate: boolean };
}) {
  const [state, submit, pending] = useActionState(editAnimalAction, EMPTY);
  return (
    <form action={submit} className="space-y-lg" data-testid="animal-edit-form">
      {state.message ? (
        <Alert tone={state.tone === 'success' ? 'success' : 'error'} title={state.message} />
      ) : null}
      <input type="hidden" name="animalId" value={animalId} />
      <TextField label="نام حیوان" name="name" defaultValue={values.name} data-testid="edit-name" />
      <TextField label="رنگ" name="color" defaultValue={values.color} data-testid="edit-color" />
      <TextField label="نشانه‌های ظاهری" name="markings" defaultValue={values.markings} data-testid="edit-markings" />
      <label className="flex items-center gap-sm text-label-md">
        <input
          type="checkbox"
          name="birthDateApproximate"
          defaultChecked={values.birthDateApproximate}
          className="size-[var(--size-selection-md)]"
        />
        تاریخ تولد تقریبی است
      </label>
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="save-animal-edit">
        {pending ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
      </Button>
    </form>
  );
}
