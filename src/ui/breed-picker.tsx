'use client';

import { useMemo, useState } from 'react';
import { Field } from './field.tsx';
import { Icon } from './icon.tsx';

export interface BreedOption {
  readonly id: string;
  readonly nameFa: string;
  readonly nameEn: string;
}

/**
 * Choosing a breed — prototype F04, the breed dropdown with real search.
 *
 * The approved states search by both names, including typing "retriever" in
 * latin script, so the filter matches either name and the list is the result of
 * what was typed rather than the whole catalogue. The chosen breed is submitted
 * through a hidden input, so the form posts exactly what a select would.
 *
 * Nothing is invented here: the breed list is the reference data from the
 * database, and an unmatched search offers no free-text value — a breed the
 * association has not published is not a breed this form can create.
 */
export function BreedPicker({
  breeds,
  defaultValue,
  name = 'breedId',
  required,
  testId,
}: {
  breeds: readonly BreedOption[];
  defaultValue?: string | null;
  name?: string;
  required?: boolean;
  testId?: string;
}) {
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<string | null>(defaultValue ?? null);

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (needle === '') return breeds;
    return breeds.filter(
      (breed) =>
        breed.nameFa.toLowerCase().includes(needle) || breed.nameEn.toLowerCase().includes(needle),
    );
  }, [breeds, term]);

  const chosen = breeds.find((breed) => breed.id === selected) ?? null;

  return (
    <div className="space-y-sm">
      <input type="hidden" name={name} value={selected ?? ''} data-testid={testId} />

      <Field
        label="نژاد"
        required={required}
        hint="با نام فارسی یا انگلیسی جست‌وجو کنید؛ مثلاً «رتریور» یا «retriever»."
      >
        {({ inputId, describedBy }) => (
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-md flex items-center text-text-secondary"
            >
              <Icon name="magnifyingGlass" size="sm" />
            </span>
            <input
              id={inputId}
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              aria-describedby={describedBy}
              autoComplete="off"
              placeholder="جست‌وجوی نژاد"
              className="w-full rounded-md border border-border-subtle bg-bg-surface py-sm ps-[calc(var(--size-icon-sm)+var(--spacing-lg))] pe-md text-body-sm focus:border-border-brand"
              data-testid={testId ? testId + '-search' : undefined}
            />
          </div>
        )}
      </Field>

      {chosen ? (
        <p className="text-caption text-text-secondary" data-testid={testId ? testId + '-chosen' : undefined}>
          انتخاب‌شده: {chosen.nameFa} · {chosen.nameEn}
        </p>
      ) : null}

      {matches.length === 0 ? (
        <p className="text-caption text-text-secondary" data-testid={testId ? testId + '-empty' : undefined}>
          نژادی با این عبارت پیدا نشد. فهرست نژادها را انجمن نگه می‌دارد؛ نام دلخواه اضافه نمی‌شود.
        </p>
      ) : (
        <ul
          className="hz-rail max-h-[240px] space-y-2xs overflow-y-auto rounded-md border border-border-subtle p-2xs"
          data-testid={testId ? testId + '-list' : undefined}
        >
          {matches.map((breed) => {
            const active = breed.id === selected;
            return (
              <li key={breed.id}>
                <button
                  type="button"
                  onClick={() => setSelected(breed.id)}
                  aria-pressed={active}
                  className={[
                    'flex min-h-[var(--size-control-sm)] w-full items-center justify-between gap-sm rounded-md px-md text-body-sm',
                    active ? 'bg-bg-brand-subtle text-text-brand' : 'hover:bg-bg-subtle',
                  ].join(' ')}
                  data-testid={'breed-option-' + breed.id}
                >
                  <span className="truncate">
                    {breed.nameFa} · {breed.nameEn}
                  </span>
                  {active ? <Icon name="check" size="sm" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
