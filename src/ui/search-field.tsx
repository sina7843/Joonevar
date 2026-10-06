import type { InputHTMLAttributes } from 'react';
import { Icon } from './icon.tsx';

/**
 * DS *SearchField* (`.hz-search`): the magnifier at the start and a 48px input,
 * with a visually hidden label. It renders the field only; the page owns the
 * `<form method="get">` so the search stays an address (P02). Suggestions are
 * not drawn: the lists search on submit.
 */
export function SearchField({
  id,
  label,
  size = 'md',
  className = '',
  ...rest
}: { id: string; label: string; size?: 'md' | 'lg' } & Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'>) {
  return (
    <div className={['hz-input-wrap hz-input-wrap--icon hz-search', size === 'lg' ? 'hz-search--lg' : '', className].join(' ').trim()}>
      <label htmlFor={id} className="hz-visually-hidden">
        {label}
      </label>
      <span className="hz-input-wrap__icon" aria-hidden="true">
        <Icon name="magnifyingGlass" size="sm" />
      </span>
      <input id={id} type="search" className="hz-input" placeholder={label} aria-label={label} {...rest} />
    </div>
  );
}
