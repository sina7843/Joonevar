'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '../../../src/ui/card.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { SERVICE_TYPE_FA, type VisitServiceTypeName } from '../../../src/domain/referral.ts';
import { encodeSelection } from '../selection.ts';

/**
 * Animal selection with an independent service per animal — §11.2.
 *
 * The group is only a way to show several animals together. Each animal keeps
 * its own service choice here and gets its own request and code later, so
 * nothing about this screen turns the group into a single booking.
 */
export function SelectAnimalsForm({
  context,
  services,
  animals,
}: {
  context: string;
  services: readonly VisitServiceTypeName[];
  animals: ReadonlyArray<{ id: string; name: string | null }>;
}) {
  const router = useRouter();
  const single = services.length === 1;
  const [chosen, setChosen] = useState<Record<string, VisitServiceTypeName>>({});
  const [error, setError] = useState<string | null>(null);

  const toggle = (animalId: string) => {
    setChosen((current) => {
      const next = { ...current };
      if (next[animalId]) delete next[animalId];
      else next[animalId] = services[0]!;
      return next;
    });
  };

  const items = Object.entries(chosen).map(([animalId, serviceType]) => ({ animalId, serviceType }));

  const submit = () => {
    if (items.length === 0) {
      setError('حداقل یک حیوان انتخاب کنید.');
      return;
    }
    router.push('/vets?context=' + context + '&sel=' + encodeURIComponent(encodeSelection(items)));
  };

  return (
    <Card>
      <h2 className="text-label-lg">انتخاب حیوان و نوع خدمت</h2>
      {single ? null : (
        <p className="mt-md text-caption text-text-secondary">
          نوع خدمت هر حیوان جداگانه انتخاب می‌شود؛ انتخاب یک حیوان روی بقیه اثری ندارد.
        </p>
      )}
      {error ? (
        <div className="mt-md">
          <Alert tone="error" title={error} />
        </div>
      ) : null}

      <ul className="mt-lg space-y-md" data-testid="animal-picker">
        {animals.map((animal) => {
          const selected = chosen[animal.id];
          return (
            <li key={animal.id} className="rounded-lg border border-border-subtle p-lg">
              <label className="flex items-center gap-sm text-body-sm">
                <input
                  type="checkbox"
                  checked={selected !== undefined}
                  onChange={() => toggle(animal.id)}
                  className="size-[var(--size-selection-md)]"
                  data-testid={'pick-animal-' + animal.id}
                />
                {animal.name ?? 'بدون نام'}
              </label>

              {selected === undefined ? null : (
                <fieldset className="mt-md space-y-sm ps-lg">
                  <legend className="text-caption text-text-secondary">نوع خدمت این حیوان</legend>
                  {services.map((service) => (
                    <label key={service} className="flex items-center gap-sm text-body-sm">
                      <input
                        type="radio"
                        name={'service-' + animal.id}
                        checked={selected === service}
                        onChange={() => setChosen((c) => ({ ...c, [animal.id]: service }))}
                        className="size-[var(--size-selection-md)]"
                        data-testid={'service-' + animal.id + '-' + service}
                      />
                      {SERVICE_TYPE_FA[service]}
                    </label>
                  ))}
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-lg">
        <Button type="button" block onClick={submit} data-testid="choose-vet">
          انتخاب دامپزشک و مرکز
        </Button>
      </div>
    </Card>
  );
}
