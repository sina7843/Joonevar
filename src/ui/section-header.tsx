import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';

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
  link?: { href: string; label?: string; hiddenSuffix?: string };
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
          {count ? <span className="hz-section-header__count"> {count}</span> : null}
        </span>
      </Tag>
      {link ? (
        <Link className="hz-link hz-link--standalone hz-section-header__link" href={link.href}>
          {link.label ?? 'مشاهده همه'}
          {link.hiddenSuffix ? <span className="hz-visually-hidden"> {link.hiddenSuffix}</span> : null}
          <Icon name="arrowRight" size="xs" mirror />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * PageHeader — DS *PageHeader*: optional crumbs (≥768) and back link (<768),
 * the h1, a meta line, and the page actions (start = primary).
 */
export function PageHeader({
  title,
  meta,
  actions,
  back,
  aside,
  level = 'h1',
  size = 'h1',
}: {
  title: ReactNode;
  meta?: readonly ReactNode[];
  actions?: ReactNode;
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
      {actions ? <div className="hz-page-header__actions">{actions}</div> : null}
    </header>
  );
}
