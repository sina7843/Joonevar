import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';
import { SectionHeader } from './section-header.tsx';
import { ActionOwner, StatusBadge, type ActionOwnerKind, type StatusTone } from './status.tsx';

/**
 * DS *DecisionDesk* (P10), *StatTile* and *DocumentPreview*
 * (link variant) for the OpsShell pages. Server-safe: no client state here; the
 * outcome radios and reason field live in `decision.tsx`.
 */

/** A titled panel: `Card` + `SectionHeader --sm` (P10 evidence sections, P11 groups). */
export function Panel({
  title,
  count,
  aside,
  children,
  testId,
  id,
}: {
  title: ReactNode;
  count?: string;
  /** Meta at the inline end of the header («مبلغ‌ها به تومان», a link). */
  aside?: ReactNode;
  children: ReactNode;
  testId?: string;
  id?: string;
}) {
  return (
    <section className="hz-card space-y-md" data-testid={testId} aria-labelledby={id}>
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <SectionHeader title={title} count={count} size="sm" id={id} />
        {aside ? <div className="text-caption text-text-secondary">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A desk status: a status-dictionary `key`, or — only for a value the
 * dictionary has no key for (GAPS #4) — an explicit tone and label.
 */
export type DeskStatus =
  | { key: string; testId?: string }
  | { tone: StatusTone; label: ReactNode; testId?: string };

function DeskStatusBadge({ status, size }: { status: DeskStatus; size?: 'sm' }) {
  if ('key' in status) {
    const badge = <StatusBadge status={status.key} size={size} />;
    return status.testId ? <span data-testid={status.testId}>{badge}</span> : badge;
  }
  return (
    <StatusBadge tone={status.tone} size={size}>
      {status.testId ? <span data-testid={status.testId}>{status.label}</span> : status.label}
    </StatusBadge>
  );
}

/**
 * Record head of a desk (P10 › 2): title + badge, the meta line (codes, dates,
 * age, version) and whose move it is. The shell already renders the page h1,
 * so the record title is an h2.
 */
export function DeskHead({
  title,
  status,
  meta,
  owner,
  ownerExtra,
  children,
}: {
  title: ReactNode;
  status?: DeskStatus;
  meta?: readonly ReactNode[];
  owner?: ActionOwnerKind | null;
  ownerExtra?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="hz-card hz-desk__head">
      <div className="hz-desk__title">
        <h2 className="hz-h3">{title}</h2>
        {status ? <DeskStatusBadge status={status} /> : null}
      </div>
      {meta && meta.length > 0 ? (
        <p className="hz-desk__meta">
          {meta.filter(Boolean).map((item, index) => (
            <span key={index}>{item}</span>
          ))}
        </p>
      ) : null}
      {owner ? <ActionOwner owner={owner} extra={ownerExtra} /> : null}
      {children}
    </section>
  );
}

/**
 * Desk layout (P10): evidence at the start, the sticky decision column (380)
 * at the end from 1024px; one column below, evidence first.
 */
export function Desk({
  children,
  decision,
  decisionTitle = 'تصمیم',
}: {
  children: ReactNode;
  decision?: ReactNode;
  decisionTitle?: string;
}) {
  return (
    <div className="hz-desk">
      <div className="min-w-0 space-y-lg">{children}</div>
      {decision ? (
        <aside className="hz-card hz-desk__decision" aria-labelledby="desk-decision-title">
          <SectionHeader title={decisionTitle} size="sm" id="desk-decision-title" />
          {decision}
        </aside>
      ) : null}
    </div>
  );
}

/** «تصمیم روی نسخه N پرونده ثبت می‌شود و در سابقه می‌ماند.» */
export function DeskVersionNote({ version }: { version: number }) {
  return (
    <p className="hz-desk__note">
      {'تصمیم روی نسخه ' + version.toLocaleString('fa-IR') + ' پرونده ثبت می‌شود و در سابقه می‌ماند.'}
    </p>
  );
}

/**
 * A private document in the desk (DS *DocumentPreview*, link variant): the
 * frame names the file and opens it through the authorized private-file route
 * only when the reviewer asks, so every view is a deliberate, audited look.
 */
export function DocFrame({
  href,
  label,
  linkLabel,
  testId,
  meta,
  icon = 'fileText',
  children,
}: {
  href: string | null;
  label: string;
  linkLabel?: string;
  testId?: string;
  meta?: ReactNode;
  icon?: IconName;
  children?: ReactNode;
}) {
  return (
    <figure className="hz-doc-figure">
      <div className={href ? 'hz-doc' : 'hz-doc hz-doc--missing'}>
        <div className="flex flex-col items-center gap-sm p-lg text-center">
          <Icon name={href ? icon : 'imageBroken'} size="lg" className="text-text-secondary" />
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" className="hz-link hz-link--standalone" data-testid={testId}>
              {linkLabel ?? 'مشاهده ' + label}
            </a>
          ) : (
            <span className="text-body-sm text-text-secondary">مدرکی بارگذاری نشده است.</span>
          )}
        </div>
      </div>
      <figcaption className="hz-doc-figure__caption">
        <b>{label}</b>
        {meta ? <span>{meta}</span> : null}
      </figcaption>
      {children}
    </figure>
  );
}

/** «مدرک خصوصی — فقط در میز تصمیم، بدون دانلود» */
export function PrivateNote() {
  return (
    <span className="hz-doc__private">
      <Icon name="lockSimple" size="xs" />
      مدرک خصوصی — فقط در میز تصمیم، بدون دانلود
    </span>
  );
}

export interface StatTileData {
  readonly label: string;
  readonly value: number | string | null;
  /** «تومان» for amounts (long value style). */
  readonly unit?: string;
  readonly sub?: ReactNode;
  readonly alert?: ReactNode;
  readonly href?: string;
  readonly testId?: string;
  readonly valueTestId?: string;
}

/** DS *StatTile* row (`.hz-queue-tiles` grid: 2 × 2 below 768, 4 in a row). */
export function StatTiles({ tiles }: { tiles: readonly StatTileData[] }) {
  return (
    <div className="hz-queue-tiles">
      {tiles.map((tile) => {
        const value =
          tile.value === null ? '—' : typeof tile.value === 'number' ? tile.value.toLocaleString('fa-IR') : tile.value;
        const body = (
          <>
            <span className="hz-stat-tile__label">{tile.label}</span>
            <span
              className={[
                'hz-stat-tile__value',
                tile.unit ? 'hz-stat-tile__value--long' : '',
                tile.value === null ? 'hz-stat-tile__value--muted' : '',
              ]
                .join(' ')
                .trim()}
              data-testid={tile.valueTestId}
            >
              {value}
              {tile.unit && tile.value !== null ? <span className="hz-stat-tile__unit">{tile.unit}</span> : null}
            </span>
            {tile.sub ? <span className="hz-stat-tile__sub">{tile.sub}</span> : null}
            {tile.alert ? (
              <span className="hz-stat-tile__flag">
                <Icon name="warning" size="xs" />
                <span>{tile.alert}</span>
              </span>
            ) : null}
          </>
        );
        const className = ['hz-stat-tile', tile.alert ? 'hz-stat-tile--alert' : '', tile.href ? 'hz-card--interactive' : '']
          .join(' ')
          .trim();
        return tile.href ? (
          <Link key={tile.label} className={className} href={tile.href} data-testid={tile.testId}>
            {body}
          </Link>
        ) : (
          <div key={tile.label} className={className} data-testid={tile.testId}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** P09 PageHeader meta: «۶ پرونده در صف · قدیمی‌ترین: ۱۲ روز». */
export function QueueMeta({ total, oldestDays, noun = 'پرونده در صف' }: { total: number; oldestDays?: number | null; noun?: string }) {
  return (
    <p className="hz-page-header__meta">
      <span className="hz-page-header__meta-item">{total.toLocaleString('fa-IR') + ' ' + noun}</span>
      {oldestDays !== undefined && oldestDays !== null ? (
        <span className="hz-page-header__meta-item">{'قدیمی‌ترین: ' + oldestDays.toLocaleString('fa-IR') + ' روز'}</span>
      ) : null}
    </p>
  );
}

export interface HistoryEntry {
  readonly id: string;
  readonly title: string;
  readonly whenFa?: string | null;
  readonly status?: string | { tone: StatusTone; label: string };
  readonly body?: ReactNode;
  readonly current?: boolean;
}

/** «سابقه پرونده» — DS *Timeline*, audit variant: newest first, no CTA per entry. */
export function CaseHistory({ entries }: { entries: readonly HistoryEntry[] }) {
  if (entries.length === 0) return <p className="text-body-sm text-text-secondary">—</p>;
  return (
    <ol className="hz-timeline">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={'hz-timeline__item ' + (entry.current ? 'hz-timeline__item--current' : 'hz-timeline__item--done')}
        >
          <span className="hz-timeline__marker" aria-hidden="true" />
          <div className="hz-timeline__content">
            <div className="hz-timeline__head">
              <span className="hz-timeline__title">{entry.title}</span>
              {entry.status === undefined ? null : typeof entry.status === 'string' ? (
                <StatusBadge status={entry.status} size="sm" />
              ) : (
                <StatusBadge tone={entry.status.tone} size="sm">
                  {entry.status.label}
                </StatusBadge>
              )}
            </div>
            {entry.whenFa ? <div className="hz-timeline__meta">{entry.whenFa}</div> : null}
            {entry.body ? <p className="hz-timeline__body">{entry.body}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

const FA_WHEN = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tehran',
});
const FA_DAY = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' });

/** Jalali date (and time) of a stored instant; null → null so callers choose «—». */
export function whenFa(value: Date | null | undefined, withTime = true): string | null {
  if (!value) return null;
  return (withTime ? FA_WHEN : FA_DAY).format(value);
}

const OWNER_FA: Record<ActionOwnerKind, string> = {
  USER: 'متقاضی',
  VET: 'دامپزشک معتمد',
  ASSOCIATION: 'انجمن',
  GENETICS_CENTRE: 'مرکز ژنتیک',
  COUNTERPARTY: 'طرف مقابل',
  SYSTEM: 'همزیست',
};

/**
 * P09 case card — the restacked form of `CaseQueue`, used where a queue's rows
 * carry their own inline step (a one-button custody step, a claim) or where
 * the row must stay a list item. Same content as a queue row: type + age,
 * name (link to the desk) with code and subline, status, whose move it is.
 */
export function CaseItem({
  name,
  href,
  linkTestId,
  linkLabel,
  code,
  sub,
  type,
  ageDays,
  age,
  status,
  owner,
  ownerIsUs = false,
  ownerLabel,
  testId,
  children,
}: {
  name: ReactNode;
  href?: string;
  linkTestId?: string;
  /** A separate «باز کردن پرونده» link (the name stays plain text). */
  linkLabel?: string;
  code?: string | null;
  sub?: ReactNode;
  type?: string;
  ageDays?: number | null;
  age?: 'late' | 'overdue';
  status?: DeskStatus;
  owner?: ActionOwnerKind | null;
  ownerIsUs?: boolean;
  /** Overrides the owner's label (e.g. «ناظر محتوا»). */
  ownerLabel?: string;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <li className="hz-card hz-card--compact" data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div className="flex flex-wrap items-center gap-sm text-caption text-text-secondary">
          {type ? <span className="hz-tag hz-tag--neutral">{type}</span> : null}
          {ageDays !== undefined && ageDays !== null ? (
            <span className={age ? 'hz-age hz-age--' + age : 'hz-age'}>
              <Icon name="clock" size="xs" />
              {ageDays.toLocaleString('fa-IR') + ' روز'}
            </span>
          ) : null}
        </div>
        {status ? <DeskStatusBadge status={status} size="sm" /> : null}
      </div>
      <div className="hz-case mt-xs">
        {href && !linkLabel ? (
          <Link className="hz-case__name" href={href} data-testid={linkTestId}>
            {name}
          </Link>
        ) : (
          <span className="hz-case__name">{name}</span>
        )}
        {code ? (
          <bdi className="hz-id" dir="ltr">
            {code}
          </bdi>
        ) : null}
        {sub ? <span className="hz-case__sub">{sub}</span> : null}
      </div>
      {owner || (href && linkLabel) ? (
        <div className="mt-sm flex flex-wrap items-center justify-between gap-sm">
          {owner ? (
            <span className={['hz-owner', 'hz-owner--inline', ownerIsUs && owner !== 'USER' && owner !== 'COUNTERPARTY' ? 'hz-owner--you' : ''].join(' ').trim()}>
              <span>اقدام بعدی با:</span> <span className="hz-owner__who">{ownerLabel ?? OWNER_FA[owner]}</span>
            </span>
          ) : (
            <span />
          )}
          {href && linkLabel ? (
            <Link className="hz-link hz-link--standalone" href={href} data-testid={linkTestId}>
              {linkLabel}
              <Icon name="arrowRight" size="xs" mirror />
            </Link>
          ) : null}
        </div>
      ) : null}
      {hasContent(children) ? <div className="mt-md">{children}</div> : null}
    </li>
  );
}

/** The list that holds `CaseItem`s (one column; the cards are the rows). */
export function CaseList({ label, testId, children }: { label: string; testId?: string; children: ReactNode }) {
  return (
    <ul className="space-y-sm" aria-label={label} data-testid={testId}>
      {children}
    </ul>
  );
}

/**
 * P09 scope chips («نمای صف»): DS *FilterBar* chips as links (the view lives in
 * the URL), each with its own test id.
 */
export function ViewChips({
  label = 'نمای صف',
  chips,
}: {
  label?: string;
  chips: ReadonlyArray<{ key: string; href: string; label: string; current: boolean; testId?: string; count?: number }>;
}) {
  return (
    <nav aria-label={label} className="hz-filterbar hz-filterbar--scroll pb-2xs">
      <ul className="hz-filterbar__chips">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              aria-current={chip.current ? 'page' : undefined}
              className="hz-chip no-underline aria-[current=page]:border-border-brand aria-[current=page]:bg-bg-brand-subtle aria-[current=page]:text-text-brand"
              data-testid={chip.testId}
            >
              {chip.label}
              {chip.count !== undefined ? <span className="hz-chip__count">{chip.count.toLocaleString('fa-IR')}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function hasContent(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasContent);
  return node !== null && node !== undefined && node !== false && node !== '';
}

/**
 * Environment home tiles (DS *QueueTile* row, P09 home) from real queue counts.
 * The visible count is in Persian digits; a visually hidden twin carries the
 * plain number under `countTestId` for machine checks.
 */
export function CountTiles({
  queues,
  testId,
  countTestId,
  linkTestId,
}: {
  queues: ReadonlyArray<{ key: string; titleFa: string; noteFa?: string; href: string; waiting: number }>;
  testId?: string;
  countTestId?: string;
  linkTestId?: string;
}) {
  return (
    <div className="hz-queue-tiles" data-testid={testId}>
      {queues.map((queue) => (
        <Link
          key={queue.key}
          href={queue.href}
          className={['hz-queue-tile', 'hz-card--interactive', queue.waiting === 0 ? 'hz-queue-tile--empty' : ''].join(' ').trim()}
          data-testid={linkTestId ? linkTestId + queue.key : undefined}
          title={queue.noteFa}
        >
          <span className="hz-queue-tile__head">
            <span className="hz-queue-tile__name">{queue.titleFa}</span>
            <Icon name="arrowRight" size="xs" mirror />
          </span>
          <span className="hz-queue-tile__count hz-num" aria-hidden={countTestId ? true : undefined}>
            {queue.waiting.toLocaleString('fa-IR')}
          </span>
          {countTestId ? (
            <span className="hz-visually-hidden" data-testid={countTestId + queue.key}>
              {queue.waiting}
            </span>
          ) : null}
          <span className="hz-queue-tile__oldest">{queue.waiting === 0 ? 'صف خالی است' : (queue.noteFa ?? '')}</span>
        </Link>
      ))}
    </div>
  );
}
