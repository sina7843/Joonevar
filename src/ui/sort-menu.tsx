'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icon.tsx';

/**
 * DS *SortMenu*: a secondary trigger naming the current order and a menu of
 * orders, the current one checked. The order lives in the URL, so every option
 * is a link (`?sort=…`) and the server sorts; nothing is reordered on the client.
 */
export function SortMenu({
  label,
  options,
  testId,
}: {
  /** Accessible name of the menu («مرتب‌سازی پرونده‌ها»). */
  label: string;
  options: ReadonlyArray<{ key: string; label: string; href: string; current: boolean }>;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((option) => option.current) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onClick = (event: MouseEvent) => !root.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);
  if (!current) return null;
  return (
    <div ref={root} className="hz-popover hz-sort" data-testid={testId}>
      <button
        type="button"
        className="hz-btn hz-btn--secondary hz-btn--sm hz-sort__trigger hz-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="sortAscending" size="xs" />
        <span className="hz-sort__label">مرتب‌سازی:</span>
        <span className="hz-sort__value">{current.label}</span>
        <Icon name="caretDown" size="xs" className="hz-menu-trigger__caret" />
      </button>
      <div className="hz-menu hz-menu--popover" role="menu" id={id} aria-label={label} hidden={!open}>
        <p className="hz-menu__group-label" aria-hidden="true">
          مرتب‌سازی بر اساس
        </p>
        {options.map((option) => (
          <Link
            key={option.key}
            href={option.href}
            className="hz-menu__action"
            role="menuitemradio"
            aria-checked={option.current}
            onClick={() => setOpen(false)}
            data-testid={testId ? testId + '-' + option.key : undefined}
          >
            <span className="hz-menu__action-label">{option.label}</span>
            {option.current ? <Icon name="check" size="xs" className="hz-menu__check" /> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
