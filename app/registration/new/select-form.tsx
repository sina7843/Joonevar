'use client';

import { useActionState } from 'react';
import { Card } from '../../../src/ui/card.tsx';
import { Button, ButtonLink } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { createSheetRequestAction, type SheetFormState } from '../actions.ts';

const EMPTY: SheetFormState = {};

/**
 * Choosing animals for one checkout — §13 step 1, DEC-0136.
 *
 * Every animal that can still get a sheet is selectable, because the fee is what
 * buys the visit rather than what follows it. An animal that cannot be bought
 * for at all — already issued, or its own registration unfinished — is shown
 * with the reason and the link that resolves it, not hidden.
 */
export function SelectSheetAnimals({
  animals,
  feeLabel,
}: {
  animals: ReadonlyArray<{
    animalId: string;
    name: string | null;
    ready: boolean;
    payable: boolean;
    reasonFa: string | null;
    nextStep: { labelFa: string; href: string } | null;
  }>;
  feeLabel: string | null;
}) {
  const [state, submit, pending] = useActionState(createSheetRequestAction, EMPTY);
  const payable = animals.filter((a) => a.payable);

  return (
    <Card>
      <h2 className="text-label-lg">انتخاب حیوان‌ها</h2>
      <p className="mt-md text-caption text-text-secondary">
        هزینه هر حیوان جداگانه محاسبه می‌شود و در یک پرداخت گروهی جمع می‌شود. پس از پرداخت، دامپزشک معتمد و
        نوع خدمت هر حیوان انتخاب می‌شود. مبلغ خدمت دامپزشک جدا است و در این پرداخت نیست.
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
                  disabled={!animal.payable}
                  className="mt-1 size-[var(--size-selection-md)]"
                  data-testid={'sheet-pick-' + animal.animalId}
                />
                <span>
                  <span className="block">{animal.name ?? 'بدون نام'}</span>
                  {feeLabel && animal.payable ? (
                    <span className="text-caption text-text-secondary">هزینه: {feeLabel}</span>
                  ) : null}
                  {animal.reasonFa ? (
                    <span className="block text-caption text-text-secondary" data-testid={'sheet-reason-' + animal.animalId}>
                      {animal.reasonFa}
                    </span>
                  ) : null}
                </span>
              </label>
              {animal.payable || animal.nextStep === null ? null : (
                <div className="mt-md">
                  <ButtonLink
                    tone="secondary"
                    href={animal.nextStep.href}
                    data-testid={'sheet-next-' + animal.animalId}
                  >
                    {animal.nextStep.labelFa}
                  </ButtonLink>
                </div>
              )}
            </li>
          ))}
        </ul>

        <Button
          type="submit"
          block
          disabled={pending || payable.length === 0 || feeLabel === null}
          data-testid="create-sheet-request"
        >
          {pending ? 'در حال ساخت درخواست…' : 'ادامه و مرور هزینه'}
        </Button>
      </form>
    </Card>
  );
}
