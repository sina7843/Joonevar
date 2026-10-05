import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink } from '../../src/ui/button.tsx';
import { Icon } from '../../src/ui/icon.tsx';

/*
 * Small compositions shared by the public SiteShell pages (P01–P03), built only
 * from DS classes. Filters are plain GET controls so the URL holds the state and
 * the lists work without script (P02).
 */

/** One filter select (`.hz-filter-group` row): label, `.hz-select`, «همه …» first. */
export function FilterSelect({
  name,
  label,
  value,
  all,
  options,
  testId,
  id,
  form,
}: {
  name: string;
  label: string;
  value: string | null;
  all: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  testId?: string;
  id: string;
  /** Owner form when the select sits outside it (filter column beside the results). */
  form?: string;
}) {
  return (
    <div className="hz-field">
      <label htmlFor={id} className="hz-field__label">
        {label}
      </label>
      <span className="hz-select-wrap">
        <select id={id} name={name} form={form} defaultValue={value ?? ''} className="hz-select" data-testid={testId}>
          <option value="">{all}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

/** One filter text/number input with its label. */
export function FilterInput({
  name,
  label,
  value,
  testId,
  id,
  form,
  ltr = false,
  inputMode,
}: {
  name: string;
  label: string;
  value: string;
  testId?: string;
  id: string;
  form?: string;
  ltr?: boolean;
  inputMode?: 'numeric' | 'text';
}) {
  return (
    <div className="hz-field">
      <label htmlFor={id} className="hz-field__label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        form={form}
        defaultValue={value}
        inputMode={inputMode}
        dir={ltr ? 'ltr' : undefined}
        className={ltr ? 'hz-input hz-input--ltr' : 'hz-input'}
        data-testid={testId}
      />
    </div>
  );
}

/**
 * The P02 filter column: a white card «فیلترها» at the start from 1024px, above
 * the results below it. It is a `<details>` that starts open, so on a phone the
 * visitor can fold it away; every control stays reachable without script.
 */
export function FilterPanel({
  children,
  clearHref,
  active,
  footer,
  clearTestId,
}: {
  children: ReactNode;
  clearHref: string;
  active: boolean;
  footer?: ReactNode;
  /** A clear link that tests address: always rendered. */
  clearTestId?: string;
}) {
  return (
    <details open className="hz-card group lg:sticky lg:top-[calc(var(--header-site)+24px)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-sm">
        <span className="hz-section-header__title text-h4">
          <span className="hz-section-header__bar" aria-hidden="true" />
          فیلترها
        </span>
        <Icon name="caretDown" size="sm" className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-md flex flex-col gap-md">{children}</div>
      <div className="mt-lg flex flex-wrap items-center justify-between gap-sm border-t border-border-subtle pt-md">
        {footer}
        {active || clearTestId ? (
          <Link className="hz-link hz-body-sm" href={clearHref} data-testid={clearTestId}>
            پاک کردن همه
          </Link>
        ) : (
          <span className="hz-caption">فیلتری فعال نیست</span>
        )}
      </div>
    </details>
  );
}

/** P01 row 10 — the CtaBand: «ثبت حیوان» (primary, start), «استعلام اصالت سند» (secondary). */
export function CtaBand({ id = 'cta-title' }: { id?: string }) {
  return (
    <section className="hz-cta" aria-labelledby={id}>
      <div className="hz-cta__text">
        <h2 className="hz-cta__title" id={id}>
          هویت حیوانت را ثبت کن
        </h2>
        <p className="hz-cta__body">ثبت در شش مرحله؛ هر مرحله ذخیره می‌شود و بعداً ادامه می‌دهید.</p>
      </div>
      <div className="hz-cta__actions">
        <ButtonLink href="/animals/new" size="lg" iconStart="plus">
          ثبت حیوان
        </ButtonLink>
        <ButtonLink tone="secondary" size="lg" href="/verify" iconStart="shieldCheck">
          استعلام اصالت سند
        </ButtonLink>
      </div>
    </section>
  );
}
