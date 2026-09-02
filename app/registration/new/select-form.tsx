'use client';

import { useActionState } from 'react';
import { Card } from '../../../src/ui/card.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { createSheetRequestAction, type SheetFormState } from '../actions.ts';

const EMPTY: SheetFormState = {};

/**
 * Choosing animals for one checkout — §13 steps 1 and 6.
 *
 * An animal that is not ready is shown with the reason rather than hidden, so
 * the missing step is visible instead of the animal simply being absent.
 */
export function SelectSheetAnimals({
  animals,
  feeLabel,
}: {
  animals: ReadonlyArray<{ animalId: string; name: string | null; ready: boolean; reasonFa: string | null }>;
  feeLabel: string | null;
}) {
  const [state, submit, pending] = useActionState(createSheetRequestAction, EMPTY);
  const ready = animals.filter((a) => a.ready);

  return (
    <Card>
      <h2 className="text-label-lg">انتخاب حیوان‌ها</h2>
      <p className="mt-md text-caption text-text-secondary">
        هزینه هر حیوان جداگانه محاسبه می‌شود و در یک پرداخت گروهی جمع می‌شود. مبلغ خدمت دامپزشک جدا است و در این
        پرداخت نیست.
      </p>

      <form action={submit} className="mt-lg space-y-lg" data-testid="sheet-select-form">
        {state.message ? <Alert tone="error" title={state.message} /> : null}

        <ul className="space-y-md" data-testid="sheet-animal-list">
          {animals.map((animal) => (
            <li key={animal.animalId} className="rounded-lg border border-border-subtle p-lg">
              <label className="flex items-start gap-sm text-body-sm">
                <input
                  type="checkbox"
                  name="animalId"
                  value={animal.animalId}
                  disabled={!animal.ready}
                  className="mt-1 size-[var(--size-selection-md)]"
                  data-testid={'sheet-pick-' + animal.animalId}
                />
                <span>
                  <span className="block">{animal.name ?? 'بدون نام'}</span>
                  {animal.ready ? (
                    feeLabel ? (
                      <span className="text-caption text-text-secondary">هزینه صدور: {feeLabel}</span>
                    ) : null
                  ) : (
                    <span className="text-caption text-text-secondary" data-testid={'sheet-reason-' + animal.animalId}>
                      {animal.reasonFa}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <Button type="submit" block disabled={pending || ready.length === 0 || feeLabel === null} data-testid="create-sheet-request">
          {pending ? 'در حال ساخت درخواست…' : 'ادامه و مرور هزینه'}
        </Button>
      </form>
    </Card>
  );
}
