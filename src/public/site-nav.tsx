'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icon.tsx';

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

export function DesktopNav({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="ناوبری سایت" className="hidden md:block">
      <ul className="flex items-center gap-xs">
        {links.map((link) => {
          const current = isCurrent(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? 'page' : undefined}
                className={[
                  'flex min-h-[var(--size-touch-min)] items-center rounded-md px-md text-label-md transition-colors',
                  current ? 'text-text-brand' : 'text-text-secondary hover:text-text-primary',
                ].join(' ')}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Small-screen menu.
 *
 * A disclosure, not a modal: the page behind stays usable. It closes when the
 * route changes (the layout persists across client navigation, so it would
 * otherwise stay open over the new page) and on Escape, returning focus to the
 * button that opened it.
 */
export function MobileMenu({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? 'بستن منو' : 'باز کردن منو'}
        onClick={() => setOpen((value) => !value)}
        className="flex size-[var(--size-touch-min)] items-center justify-center rounded-md text-text-primary hover:bg-bg-subtle"
        data-testid="site-menu-toggle"
      >
        <Icon name={open ? 'x' : 'list'} size="md" />
      </button>
      <nav
        id="site-menu"
        aria-label="منوی سایت"
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border-subtle bg-bg-surface"
        data-testid="site-menu"
      >
        <ul className="mx-auto max-w-6xl px-lg py-sm">
          {links.map((link) => {
            const current = isCurrent(pathname, link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className={[
                    'flex min-h-[var(--size-touch-min)] items-center rounded-md px-md text-label-lg',
                    current ? 'bg-bg-brand-subtle text-text-brand' : 'text-text-primary hover:bg-bg-subtle',
                  ].join(' ')}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
