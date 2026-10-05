'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icon.tsx';
import { LOCKUP_FA } from '../brand/assets.ts';

/** A header group with its live items already resolved on the server. */
export interface ResolvedNavGroup {
  readonly id: string;
  readonly labelFa: string;
  readonly parts: ReadonlyArray<{
    readonly labelFa: string;
    readonly items: ReadonlyArray<{ readonly href: string; readonly label: string; readonly descFa: string }>;
  }>;
}

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

const groupIsCurrent = (pathname: string, group: ResolvedNavGroup) =>
  group.parts.some((part) => part.items.some((item) => isCurrent(pathname, item.href)));

/**
 * Desktop header navigation — DS *GroupedNav*: five buttons with a caret, each
 * opening a panel (`.hz-menu--nav`), then «استعلام اصالت» as a plain link.
 * One panel at a time; Escape, an outside click and a route change close it.
 * The current page's group is marked (`--current`).
 */
export function DesktopNav({ groups, verify }: { groups: readonly ResolvedNavGroup[]; verify: NavLink | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => setOpen(null), [pathname]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const trigger = root.current?.querySelector<HTMLButtonElement>('[aria-controls="nav-' + open + '"]');
      setOpen(null);
      trigger?.focus();
    };
    const onClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <nav ref={root} className="hz-nav" aria-label="ناوبری سایت" data-testid="site-nav">
      {groups.map((group) => {
        const current = groupIsCurrent(pathname, group);
        const expanded = open === group.id;
        return (
          <div key={group.id} className="hz-nav-group">
            <button
              type="button"
              className={['hz-nav__item', current ? 'hz-nav__item--current' : ''].join(' ').trim()}
              aria-expanded={expanded}
              aria-controls={'nav-' + group.id}
              aria-current={current ? 'true' : undefined}
              onClick={() => setOpen(expanded ? null : group.id)}
            >
              {group.labelFa}
              <Icon name="caretDown" size="xs" />
            </button>
            <div className="hz-menu hz-menu--nav" id={'nav-' + group.id} hidden={!expanded}>
              {group.parts.map((part, index) => (
                <div key={part.labelFa}>
                  {index > 0 ? <div className="hz-menu__sep" role="separator" /> : null}
                  <p className="hz-menu__group-label" id={'nav-' + group.id + '-g' + index}>
                    {part.labelFa}
                  </p>
                  <ul className="hz-menu__list" aria-labelledby={'nav-' + group.id + '-g' + index}>
                    {part.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          className="hz-menu__item"
                          href={item.href}
                          aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                        >
                          <span className="hz-menu__label">{item.label}</span>
                          <span className="hz-menu__desc">{item.descFa}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {verify ? (
        <Link
          className={['hz-nav__item', isCurrent(pathname, verify.href) ? 'hz-nav__item--current' : ''].join(' ').trim()}
          href={verify.href}
          aria-current={isCurrent(pathname, verify.href) ? 'page' : undefined}
        >
          {verify.label}
        </Link>
      ) : null}
    </nav>
  );
}

/**
 * Small-screen menu — DS *GroupedNav* mobile: a Drawer from the inline start
 * with the groups as accordions and the account button at the foot. It traps
 * focus, closes on Escape, on the scrim and after navigating, and returns
 * focus to the button that opened it. The current page's group starts open.
 */
export function MobileMenu({
  groups,
  verify,
  account,
}: {
  groups: readonly ResolvedNavGroup[];
  verify: NavLink | null;
  account: NavLink;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setExpanded(groups.find((group) => groupIsCurrent(pathname, group))?.id ?? null);
  }, [pathname, groups]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button, a')?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || panel.current === null) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
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

  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };

  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="hz-icon-btn"
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? 'بستن منو' : 'باز کردن منو'}
        onClick={() => setOpen((value) => !value)}
        data-testid="site-menu-toggle"
      >
        <Icon name="list" size="md" />
      </button>
      {open ? (
        <>
          <div className="hz-scrim" onClick={close} aria-hidden="true" />
          <div
            ref={panel}
            id="site-menu"
            className="hz-drawer hz-drawer--start hz-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="منوی همزیست"
            data-testid="site-menu"
          >
            <div className="hz-mobile-menu__head">
              <Link className="hz-logo hz-logo--mobile" href="/" aria-label="همزیست — صفحه اصلی">
                <img src={LOCKUP_FA.path} alt="همزیست" width={LOCKUP_FA.width} height={LOCKUP_FA.height} />
              </Link>
              <button type="button" className="hz-icon-btn" aria-label="بستن منو" onClick={close}>
                <Icon name="x" size="md" />
              </button>
            </div>
            <nav className="hz-mobile-menu__body" aria-label="منوی سایت">
              <Link className="hz-accordion-row" href="/" aria-current={pathname === '/' ? 'page' : undefined}>
                خانه
                <Icon name="caretLeft" size="sm" />
              </Link>
              {groups.map((group) => {
                const isOpen = expanded === group.id;
                return (
                  <div key={group.id}>
                    <button
                      type="button"
                      className="hz-accordion-row"
                      aria-expanded={isOpen}
                      aria-controls={'mm-' + group.id}
                      onClick={() => setExpanded(isOpen ? null : group.id)}
                    >
                      {group.labelFa}
                      <Icon name="caretDown" size="sm" />
                    </button>
                    <ul className="hz-mobile-menu__list" id={'mm-' + group.id} hidden={!isOpen}>
                      {group.parts.map((part, index) => [
                        index > 0 ? <li key={part.labelFa + '-sep'} className="hz-mobile-menu__sep" role="separator" /> : null,
                        ...part.items.map((item) => (
                          <li key={item.href}>
                            <Link
                              className="hz-menu__item"
                              href={item.href}
                              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                            >
                              <span className="hz-menu__label">{item.label}</span>
                              <span className="hz-menu__desc">{item.descFa}</span>
                            </Link>
                          </li>
                        )),
                      ])}
                    </ul>
                  </div>
                );
              })}
              {verify ? (
                <Link
                  className="hz-accordion-row"
                  href={verify.href}
                  aria-current={isCurrent(pathname, verify.href) ? 'page' : undefined}
                >
                  {verify.label}
                  <Icon name="caretLeft" size="sm" />
                </Link>
              ) : null}
            </nav>
            <div className="hz-mobile-menu__foot">
              <Link className="hz-btn hz-btn--primary hz-btn--block" href={account.href}>
                <Icon name="user" size="sm" weight="fill" />
                {account.label}
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

/**
 * One footer group — DS *SiteFooter*: a heading from 768px, an accordion row
 * below it. Both are rendered; the bundle shows the right one per width.
 */
export function FooterColumn({ id, labelFa, links }: { id: string; labelFa: string; links: readonly NavLink[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hz-footer-col">
      <h2 className="hz-footer-col__title">{labelFa}</h2>
      <button
        type="button"
        className="hz-accordion-row"
        aria-expanded={open}
        aria-controls={'ft-' + id}
        onClick={() => setOpen((value) => !value)}
      >
        {labelFa}
        <Icon name="caretDown" size="sm" />
      </button>
      <ul className="hz-footer-col__links" id={'ft-' + id}>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
