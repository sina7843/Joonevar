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

export { FilterPanel } from './filter-panel.tsx';

/**
 * P01 row 11 — DS *CtaBand*: «ثبت حیوان» (primary, start), «استعلام اصالت سند» (secondary). With `media` it is `--media`: the photo first on phones, 5/12
 * at the end on desktop; without it the plain band.
 */
export function CtaBand({ id = 'cta-title', media }: { id?: string; media?: { src: string; altFa: string } }) {
  const content = (
    <>
      <h2 className="hz-cta__title" id={id}>
        هویت حیوانت را ثبت کن
      </h2>
      <p className="hz-cta__body">ثبت در شش مرحله؛ هر مرحله ذخیره می‌شود و بعداً ادامه می‌دهید.</p>
    </>
  );
  const actions = (
    <div className="hz-cta__actions">
      <ButtonLink href="/animals/new" size="lg" iconStart="plus">
        ثبت حیوان
      </ButtonLink>
      <ButtonLink tone="secondary" size="lg" href="/verify" iconStart="shieldCheck">
        استعلام اصالت سند
      </ButtonLink>
    </div>
  );
  if (media) {
    return (
      <section className="hz-cta hz-cta--media" aria-labelledby={id} data-testid="cta-band">
        <figure className="hz-cta__media">
          <img src={media.src} alt={media.altFa} loading="lazy" decoding="async" width={960} height={540} />
        </figure>
        <div className="hz-cta__content">
          {content}
          {actions}
        </div>
      </section>
    );
  }
  return (
    <section className="hz-cta" aria-labelledby={id} data-testid="cta-band">
      <div className="hz-cta__text">{content}</div>
      {actions}
    </section>
  );
}
