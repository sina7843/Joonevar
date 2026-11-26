import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';
import { ActionRow } from './button.tsx';

/**
 * SectionHeader — the system's signature (DS *SectionHeader*): a 4px accent bar
 * at the start, a Bold title, an optional count, and «مشاهده همه ←» at the end.
 * `sm` is the OpsShell / in-card size (16/26, bar 3×16).
 */
export function SectionHeader({
  title,
  count,
  link,
  size = 'md',
  as: Tag = 'h2',
  id,
}: {
  title: ReactNode;
  count?: string;
  link?: { href: string; label?: ReactNode; hiddenSuffix?: string };
  size?: 'md' | 'sm';
  as?: 'h2' | 'h3';
  id?: string;
}) {
  return (
    <div className={size === 'sm' ? 'hz-section-header hz-section-header--sm' : 'hz-section-header'}>
      <Tag className="hz-section-header__title" id={id}>
        <span className="hz-section-header__bar" aria-hidden="true" />
        <span>
          {title}
          {/* A bare «۰» says nothing; an empty section shows its empty state instead (CMPB-096). */}
          {count && count !== '۰' && count !== '0' ? <span className="hz-section-header__count"> {count}</span> : null}
        </span>
      </Tag>
      {link ? (
        <Link className="hz-link hz-link--standalone hz-section-header__link" href={link.href}>
          {link.label ?? 'مشاهده همه'}
          {/* «مشاهده همه» alone is ambiguous out of context: the section's name follows for screen readers (CMPB-097). */}
          {link.hiddenSuffix ? (
            <span className="hz-visually-hidden"> {link.hiddenSuffix}</span>
          ) : typeof title === 'string' ? (
            <span className="hz-visually-hidden">{' ' + title}</span>
          ) : null}
          <Icon name="arrowRight" size="xs" mirror />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * PageHeader — DS *PageHeader*: optional crumbs (≥768) and back link (<768),
 * the h1, a meta line, and the page actions (start = primary).
 * `primaryAction` sits with the actions from 768 and below it moves to a
 * sticky ActionRow at the bottom of the phone screen (CMPB-090).
 */
export function PageHeader({
  title,
  meta,
  actions,
  primaryAction,
  back,
  aside,
  level = 'h1',
  size = 'h1',
}: {
  title: ReactNode;
  meta?: readonly ReactNode[];
  actions?: ReactNode;
  /** The page's one main action: in the header ≥768, a sticky bottom row <768. */
  primaryAction?: ReactNode;
  back?: { href: string; label?: string };
  /** Next to the title (identifier, badge). */
  aside?: ReactNode;
  level?: 'h1' | 'h2';
  size?: 'h1' | 'h2' | 'h3';
}) {
  const Tag = level;
  return (
    <header className="hz-page-header">
      <div className="hz-page-header__text">
        {back ? (
          <Link className="hz-page-header__back hz-page-header__back--mobile" href={back.href}>
            <Icon name="arrowLeft" size="sm" mirror />
            {back.label ?? 'بازگشت'}
          </Link>
        ) : null}
        <div className="hz-page-header__title-row">
          <Tag className={'hz-' + size}>{title}</Tag>
          {aside}
        </div>
        {meta && meta.length > 0 ? (
          <div className="hz-page-header__meta">
            {meta.map((item, index) => (
              <span key={index} className="hz-page-header__meta-item">
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {actions || primaryAction ? (
        <div className="hz-page-header__actions">
          {primaryAction ? <span className="hz-show-md">{primaryAction}</span> : null}
          {actions}
        </div>
      ) : null}
      {primaryAction ? (
        <div className="hz-hide-md">
          <ActionRow sticky primary={primaryAction} />
        </div>
      ) : null}
    </header>
  );
}

/** Loading placeholder for a PageHeader: the title bar and one meta line. */
export function PageHeaderSkeleton({ label = 'در حال بارگذاری' }: { label?: string }) {
  return (
    <div className="hz-page-header" role="status" aria-busy="true" aria-label={label}>
      <div className="hz-page-header__text w-full">
        <span className="hz-skeleton hz-skeleton--title" />
        <span className="hz-skeleton hz-skeleton--text w-1/3" />
      </div>
    </div>
  );
}
