'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';

/**
 * The interactive parts of the app shells — DS *OpsShell*, *PublicShell*,
 * *AccountMenu*. Kept in one small client module so the shells themselves stay
 * server components (they read the session and the profile).
 */

export interface ShellNavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
}
export interface ShellNavSection {
  /** No label = the unlabelled home section. */
  readonly label?: string;
  readonly items: readonly ShellNavItem[];
}

const isActive = (pathname: string, href: string, all: readonly string[]) => {
  if (pathname !== href && !pathname.startsWith(href + '/')) return false;
  // The longest matching address wins, so «/market» is not current on «/market/orders».
  return !all.some((other) => other.length > href.length && (pathname === other || pathname.startsWith(other + '/')));
};

function SideItem({ item, current, dense }: { item: ShellNavItem; current: boolean; dense: boolean }) {
  return (
    <Link
      className={dense ? 'hz-side-item hz-side-item--dense' : 'hz-side-item'}
      href={item.href}
      aria-current={current ? 'page' : undefined}
      title={item.label}
    >
      <span className="hz-side-item__icon">
        <Icon name={item.icon} size="sm" weight={current ? 'fill' : 'regular'} />
      </span>
      <span className="hz-side-item__label">{item.label}</span>
    </Link>
  );
}

/**
 * Sidebar navigation. Sections with a label become collapsible toggles when the
 * environment has 15 or more items (Shells › OpsShell sidebar); the current
 * page's group is always open.
 */
export function SidebarNav({
  sections,
  pathname,
  dense,
  label,
}: {
  sections: readonly ShellNavSection[];
  pathname: string;
  dense: boolean;
  label: string;
}) {
  const all = sections.flatMap((section) => section.items.map((item) => item.href));
  const collapsible = all.length >= 15;
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());

  return (
    <nav className="hz-sidebar__nav" aria-label={label}>
      {sections.map((section, index) => {
        const containsCurrent = section.items.some((item) => isActive(pathname, item.href, all));
        const open = !collapsible || containsCurrent || !closed.has(section.label ?? '');
        const id = 'side-g' + index;
        return (
          <div key={section.label ?? index} className="hz-sidebar__section">
            {section.label ? (
              collapsible ? (
                <button
                  type="button"
                  className="hz-sidebar__group hz-sidebar__group--toggle"
                  aria-expanded={open}
                  aria-controls={id}
                  onClick={() =>
                    setClosed((previous) => {
                      const next = new Set(previous);
                      if (next.has(section.label!)) next.delete(section.label!);
                      else next.add(section.label!);
                      return next;
                    })
                  }
                >
                  <span>{section.label}</span>
                  <Icon name="caretDown" size="xs" />
                </button>
              ) : (
                <span className="hz-sidebar__group" id={id + '-l'}>
                  {section.label}
                </span>
              )
            ) : null}
            <div
              className="hz-sidebar__items"
              id={id}
              role={section.label ? 'group' : undefined}
              aria-label={section.label}
              hidden={!open}
            >
              {section.items.map((item) => (
                <SideItem key={item.href} item={item} current={isActive(pathname, item.href, all)} dense={dense} />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** «جمع‌کردن منو»: the desktop sidebar collapses to the 72px rail (OpsShell). */
export function SidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const aside = ref.current?.closest('.hz-sidebar');
    const app = ref.current?.closest('.hz-app');
    aside?.classList.toggle('hz-sidebar--collapsed', collapsed);
    app?.classList.toggle('hz-app--rail', collapsed);
  }, [collapsed]);
  return (
    <div className="hz-sidebar__foot hz-show-lg">
      <button
        ref={ref}
        type="button"
        className="hz-sidebar__collapse"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        <Icon name="sidebarSimple" size="sm" mirror />
        <span className="hz-sidebar__collapse-label">{collapsed ? 'باز کردن منو' : 'جمع‌کردن منو'}</span>
      </button>
    </div>
  );
}

/**
 * Below 768px the operational navigation lives in a Drawer from the start edge
 * (`.hz-drawer--nav`). It traps focus, closes on Escape, the scrim or a route
 * change, and returns focus to the menu button.
 */
export function NavDrawer({
  label,
  brand,
  foot,
  children,
  pathname,
}: {
  label: string;
  brand: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(
        (element) => element.offsetParent !== null,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="hz-icon-btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls="ops-drawer"
        onClick={() => setOpen(true)}
        data-testid="ops-menu-toggle"
      >
        <Icon name="list" size="md" />
      </button>
      {open ? (
        <>
          <div className="hz-scrim" aria-hidden="true" onClick={() => setOpen(false)} />
          <div ref={panel} id="ops-drawer" className="hz-drawer hz-drawer--start hz-drawer--nav" role="dialog" aria-modal="true" aria-label={label}>
            <div className="hz-nav-drawer__head">
              <div className="hz-nav-drawer__brand">{brand}</div>
              <button type="button" className="hz-icon-btn" aria-label="بستن منو" onClick={() => setOpen(false)}>
                <Icon name="x" size="md" />
              </button>
            </div>
            <div className="hz-sidebar">{children}</div>
            {foot ? <div className="hz-nav-drawer__foot">{foot}</div> : null}
          </div>
        </>
      ) : null}
    </>
  );
}

/**
 * Account button with its popover — DS *AccountMenu*: the person's name and
 * role, «پنل من», «پروفایل» and «خروج». Sign-out stays a server form; it is
 * passed in as a node.
 */
export function AccountPopover({
  name,
  role,
  initial,
  children,
  variant,
}: {
  name: string;
  role: string;
  initial: string;
  children: ReactNode;
  variant: 'topbar' | 'sidebar';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
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

  const avatar = (
    <span className={variant === 'topbar' ? 'hz-avatar hz-avatar--sm' : 'hz-avatar'} aria-hidden="true">
      {initial}
    </span>
  );
  return (
    <div ref={root} className={variant === 'sidebar' ? 'hz-popover hz-popover--block' : 'hz-popover'}>
      <button
        type="button"
        className={variant === 'topbar' ? 'hz-topbar__account' : 'hz-sidebar__user hz-sidebar__user--button'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={'حساب ' + name + '، ' + role}
        onClick={() => setOpen((value) => !value)}
        data-testid="account-name"
        title={name}
      >
        {avatar}
        <span className={variant === 'topbar' ? 'hz-topbar__account-text' : 'hz-sidebar__user-text'}>
          <span className={variant === 'topbar' ? 'hz-topbar__account-name' : 'hz-sidebar__user-name'}>{name}</span>
          <span className={variant === 'topbar' ? 'hz-topbar__account-role' : 'hz-sidebar__user-role'}>{role}</span>
        </span>
        <Icon name="caretDown" size="xs" className="hz-account-caret" />
      </button>
      <div
        className="hz-menu hz-menu--popover hz-account-menu"
        role="menu"
        hidden={!open}
        style={variant === 'sidebar' ? { insetBlockStart: 'auto', insetBlockEnd: 'calc(100% + 6px)' } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
