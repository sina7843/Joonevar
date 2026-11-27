'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../src/ui/icon.tsx';

/**
 * The P02 filter column (DS *FilterBar* + *Drawer*).
 *
 * From 1024px it is the white «فیلترها» card at the start of the results and a
 * changed control applies at once (the GET form submits itself). Below 1024px
 * the results come first and a «فیلترها» button opens the same controls in a
 * full-height Drawer with «نمایش نتایج»; Escape or the scrim closes it. Without
 * script the card simply stays open with its «اعمال فیلترها» button, so the
 * list keeps working (the URL holds the state).
 */
export function FilterPanel({
  children,
  clearHref,
  active,
  activeCount,
  formId,
  applyTestId,
  clearTestId,
}: {
  children: ReactNode;
  clearHref: string;
  active: boolean;
  /** How many filters are on, for the button's counter; omitted = a dot when active. */
  activeCount?: number;
  /** The GET form the controls belong to (they sit outside it, beside the results). */
  formId: string;
  applyTestId?: string;
  /** A clear link that tests address: always rendered. */
  clearTestId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => setEnhanced(true), []);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('select, input, button, a')?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Desktop: a changed filter applies at once (KPUB-021). In the Drawer the
  // visitor sets several and presses «نمایش نتایج».
  const onChange = () => {
    if (!enhanced || open || !window.matchMedia('(min-width: 1024px)').matches) return;
    (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
  };

  const count = activeCount ?? (active ? undefined : 0);
  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="hz-btn hz-btn--secondary lg:hidden"
        aria-expanded={open}
        aria-controls="filter-panel"
        onClick={() => setOpen(true)}
        data-testid="filters-open"
        hidden={!enhanced}
      >
        <Icon name="funnelSimple" size="sm" />
        فیلترها
        {count === undefined ? (
          <span className="hz-count hz-count--alert" aria-label="فیلتر فعال">
            •
          </span>
        ) : count > 0 ? (
          <span className="hz-count hz-count--alert" aria-label={count.toLocaleString('fa-IR') + ' فیلتر فعال'}>
            {count.toLocaleString('fa-IR')}
          </span>
        ) : null}
      </button>
      {open ? <div className="hz-scrim lg:hidden" aria-hidden="true" onClick={() => setOpen(false)} /> : null}
      <div
        ref={panel}
        id="filter-panel"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? 'فیلترها' : undefined}
        className={
          open
            ? 'hz-drawer'
            : enhanced
              ? 'max-lg:hidden'
              : undefined
        }
        onChange={onChange}
      >
        <div className={open ? 'flex min-h-0 flex-1 flex-col overflow-y-auto p-lg' : 'hz-card lg:sticky lg:top-[calc(var(--header-site)+24px)]'}>
          <div className="flex items-center justify-between gap-sm">
            <h2 className="hz-section-header__title text-h4">
              <span className="hz-section-header__bar" aria-hidden="true" />
              فیلترها
            </h2>
            {open ? (
              <button type="button" className="hz-icon-btn" aria-label="بستن فیلترها" onClick={() => setOpen(false)}>
                <Icon name="x" size="md" />
              </button>
            ) : null}
          </div>
          <div className="mt-md flex flex-col gap-md">{children}</div>
          <div className="mt-lg flex flex-wrap items-center justify-between gap-sm border-t border-border-subtle pt-md">
            <button
              type="submit"
              form={formId}
              className={open ? 'hz-btn hz-btn--primary' : enhanced ? 'hz-btn hz-btn--secondary hz-btn--sm lg:hidden' : 'hz-btn hz-btn--secondary hz-btn--sm'}
              data-testid={applyTestId ?? 'filters-apply'}
            >
              {open ? 'نمایش نتایج' : 'اعمال فیلترها'}
            </button>
            {active || clearTestId ? (
              <Link className="hz-link hz-body-sm" href={clearHref} data-testid={clearTestId}>
                پاک کردن همه
              </Link>
            ) : (
              <span className="hz-caption">فیلتری فعال نیست</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
