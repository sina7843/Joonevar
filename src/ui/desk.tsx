import Link from 'next/link';
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';
import { SectionHeader } from './section-header.tsx';
import { DocumentPreview } from './document-preview.tsx';
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

export function DeskStatusBadge({ status, size }: { status: DeskStatus; size?: 'sm' }) {
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
 * age, version) and whose move it is. On a decision desk page the record title
 * is the page h1 (`level={1}`, with OpsShell `headingInPage`); inside a queue
 * page's drawer it stays an h2.
 */
export function DeskHead({
  title,
  status,
  meta,
  owner,
  ownerExtra,
  position,
  children,
  level = 2,
}: {
  title: ReactNode;
  level?: 1 | 2;
  status?: DeskStatus;
  meta?: readonly ReactNode[];
  owner?: ActionOwnerKind | null;
  ownerExtra?: ReactNode;
  /** «پرونده ۲ از ۴» with the previous / next case in queue order (oldest first). */
  position?: DeskPosition | null;
  children?: ReactNode;
}) {
  return (
    <section className="hz-card hz-desk__head">
      <div className="hz-desk__title">
        {level === 1 ? <h1 className="hz-h3">{title}</h1> : <h2 className="hz-h3">{title}</h2>}
        {status ? <DeskStatusBadge status={status} /> : null}
        {position ? <DeskNav position={position} /> : null}
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

export interface DeskPosition {
  readonly index: number;
  readonly total: number;
  readonly prevHref: string | null;
  readonly nextHref: string | null;
}

function DeskNav({ position }: { position: DeskPosition }) {
  const step = (href: string | null, label: string, icon: 'caretRight' | 'caretLeft') =>
    href ? (
      <Link className="hz-icon-btn hz-icon-btn--sm" href={href} aria-label={label}>
        <Icon name={icon} size="xs" mirror />
      </Link>
    ) : (
      <span className="hz-icon-btn hz-icon-btn--sm" aria-disabled="true" aria-label={label}>
        <Icon name={icon} size="xs" mirror />
      </span>
    );
  return (
    <nav className="hz-desk__nav" aria-label="پرونده‌های صف">
      {step(position.prevHref, 'پرونده قبلی', 'caretRight')}
      <span>{'پرونده ' + position.index.toLocaleString('fa-IR') + ' از ' + position.total.toLocaleString('fa-IR')}</span>
      {step(position.nextHref, 'پرونده بعدی', 'caretLeft')}
    </nav>
  );
}

/** The case's place in its queue (oldest first): `ids` in queue order, `href` builds a case address. */
export function deskPosition(ids: readonly string[], id: string, href: (id: string) => string): DeskPosition | null {
  const at = ids.indexOf(id);
  if (at < 0 || ids.length < 2) return null;
  return {
    index: at + 1,
    total: ids.length,
    prevHref: at > 0 ? href(ids[at - 1]!) : null,
    nextHref: at < ids.length - 1 ? href(ids[at + 1]!) : null,
  };
}

/**
 * Case age in the queue — DS `hz-age`: «۱۲ روز در صف», amber past the late
 * threshold, red past the overdue one; thresholds are managed settings, and an
 * unset threshold never colours anything.
 */
export function CaseAge({ since, lateDays, overdueDays, now = new Date() }: { since: Date; lateDays?: number | null; overdueDays?: number | null; now?: Date }) {
  const days = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
  const tone = overdueDays != null && days > overdueDays ? 'overdue' : lateDays != null && days > lateDays ? 'late' : null;
  return (
    <span className={tone ? 'hz-age hz-age--' + tone : 'hz-age'} title={tone ? 'بیش از مهلت بررسی' : undefined}>
      <Icon name="clock" size="xs" />
      {days.toLocaleString('fa-IR') + ' روز در صف'}
    </span>
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
        // Below 1024 the decision form itself is the fixed bar + sheet (DecisionForm), so the card dissolves.
        <aside className="hz-card hz-desk__decision max-lg:contents" aria-labelledby="desk-decision-title">
          <div className="hz-show-lg">
            <SectionHeader title={decisionTitle} size="sm" id="desk-decision-title" />
          </div>
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
 * A private document in the desk: DS *DocumentPreview* (zoom, rotate,
 * fullscreen; no download or new tab) over the authorized private-file route,
 * with the file named in the caption. A missing file is the dashed empty frame.
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
      {href ? (
        <DocumentPreview src={href} altFa={linkLabel ?? label} testId={testId} />
      ) : (
        <div className="hz-doc hz-doc--missing">
          <div className="hz-doc__status">
            <Icon name={icon === 'fileText' ? 'imageBroken' : icon} size="lg" />
            <span>{label + ' بارگذاری نشده است.'}</span>
          </div>
        </div>
      )}
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
  /**
   * DS StatTile states: `loading` (three skeleton bars, aria-busy), `error`
   * («—» + reload line, never ۰) and `unset` («تعیین‌نشده» + `reason`, when the
   * metric depends on an unset setting).
   */
  readonly state?: 'loading' | 'error' | 'unset';
  readonly reason?: ReactNode;
}

/** DS *StatTile* row (`.hz-queue-tiles` grid: 2 × 2 below 768, 4 in a row). */
export function StatTiles({ tiles }: { tiles: readonly StatTileData[] }) {
  return (
    <div className="hz-queue-tiles">
      {tiles.map((tile) => {
        if (tile.state === 'loading') {
          return (
            <div key={tile.label} className="hz-stat-tile" aria-busy="true" data-testid={tile.testId}>
              <span className="hz-visually-hidden">{tile.label + '، در حال بارگذاری'}</span>
              <span className="hz-skeleton hz-skeleton--text" style={{ width: '50%' }} aria-hidden="true" />
              <span className="hz-skeleton hz-skeleton--title" style={{ width: '40%' }} aria-hidden="true" />
              <span className="hz-skeleton hz-skeleton--text" style={{ width: '70%' }} aria-hidden="true" />
            </div>
          );
        }
        const muted = tile.value === null || tile.state === 'error' || tile.state === 'unset';
        const value =
          tile.state === 'unset'
            ? 'تعیین‌نشده'
            : tile.state === 'error' || tile.value === null
              ? '—'
              : typeof tile.value === 'number'
                ? tile.value.toLocaleString('fa-IR')
                : tile.value;
        const sub = tile.state === 'error' ? 'بارگذاری نشد. صفحه را دوباره بار کنید.' : tile.state === 'unset' ? (tile.reason ?? tile.sub) : tile.sub;
        const body = (
          <>
            <span className="hz-stat-tile__label">{tile.label}</span>
            <span
              className={['hz-stat-tile__value', tile.unit ? 'hz-stat-tile__value--long' : '', muted ? 'hz-stat-tile__value--muted' : '']
                .join(' ')
                .trim()}
              data-testid={tile.valueTestId}
            >
              {value}
              {tile.unit && !muted ? <span className="hz-stat-tile__unit">{tile.unit}</span> : null}
            </span>
            {sub ? <span className="hz-stat-tile__sub">{sub}</span> : null}
            {tile.alert && !tile.state ? (
              <span className="hz-stat-tile__flag">
                <Icon name="warning" size="xs" />
                <span>{tile.alert}</span>
              </span>
            ) : null}
          </>
        );
        const className = ['hz-stat-tile', tile.alert && !tile.state ? 'hz-stat-tile--alert' : '', tile.href ? 'hz-card--interactive' : '']
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
      {total > 0 && oldestDays !== undefined && oldestDays !== null && Number.isFinite(oldestDays) ? (
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

export const OWNER_FA: Record<ActionOwnerKind, string> = {
  USER: 'متقاضی',
  VET: 'دامپزشک معتمد',
  ASSOCIATION: 'انجمن',
  GENETICS_CENTRE: 'مرکز ژنتیک',
  COUNTERPARTY: 'طرف مقابل',
  SYSTEM: 'همزیست',
};

/** Which CaseQueue columns a list shows: only facts some row has (P09). */
interface CaseCols {
  readonly age: boolean;
  readonly type: boolean;
  readonly status: boolean;
  readonly owner: boolean;
  readonly action: boolean;
  /** The BulkSelect form id when the list is selectable. */
  readonly select?: string;
}

type CaseItemProps = {
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
  /** Makes the row selectable for a bulk action: the posted id and the checkbox's accessible name. */
  select?: { readonly value: string; readonly label: string };
  /** Set by `CaseList`. */
  cols?: CaseCols;
};

/**
 * One P09 case as a DS *CaseQueue* row: a dense table row from 768, the
 * system card below it (`.hz-table--stack`). Columns: age · case · type ·
 * status · next action · step; `CaseList` drops the ones no row uses.
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
  select,
  cols = { age: true, type: true, status: true, owner: true, action: true },
}: CaseItemProps) {
  const step = hasContent(children) || (href && linkLabel);
  return (
    <tr data-testid={testId}>
      {cols.select ? (
        <td className="hz-table__check">
          {select ? (
            <label className="hz-check">
              <input type="checkbox" name="ids" value={select.value} form={cols.select} aria-label={select.label} />
            </label>
          ) : null}
        </td>
      ) : null}
      {cols.age ? (
        <td data-label="سن پرونده">
          {ageDays !== undefined && ageDays !== null ? (
            <span className={age ? 'hz-age hz-age--' + age : 'hz-age'}>
              <Icon name="clock" size="xs" />
              {ageDays.toLocaleString('fa-IR') + ' روز'}
            </span>
          ) : (
            '—'
          )}
        </td>
      ) : null}
      <td className="hz-table__lead">
        <div className="hz-case">
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
      </td>
      {cols.type ? <td data-label="نوع">{type ? <span className="hz-tag hz-tag--neutral">{type}</span> : '—'}</td> : null}
      {cols.status ? <td data-label="وضعیت">{status ? <DeskStatusBadge status={status} size="sm" /> : '—'}</td> : null}
      {cols.owner ? (
        <td data-label="اقدام بعدی با">
          {owner ? (
            <span className={['hz-owner', 'hz-owner--inline', ownerIsUs && owner !== 'USER' && owner !== 'COUNTERPARTY' ? 'hz-owner--you' : ''].join(' ').trim()}>
              <span className="hz-owner__who">{ownerLabel ?? OWNER_FA[owner]}</span>
            </span>
          ) : (
            '—'
          )}
        </td>
      ) : null}
      {cols.action ? (
        <td className="hz-table__action">
          {step ? (
            <div className="flex flex-wrap items-center gap-sm">
              {href && linkLabel ? (
                <Link className="hz-link hz-link--standalone" href={href} data-testid={linkTestId}>
                  {linkLabel}
                  <Icon name="arrowRight" size="xs" mirror />
                </Link>
              ) : null}
              {hasContent(children) ? children : null}
            </div>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}

const HEAD: ReadonlyArray<[keyof CaseCols | 'name', string]> = [
  ['age', 'سن پرونده'],
  ['name', 'پرونده'],
  ['type', 'نوع'],
  ['status', 'وضعیت'],
  ['owner', 'اقدام بعدی با'],
  ['action', 'اقدام'],
];

/**
 * DS *CaseQueue* around `CaseItem`s: a dense table (40px rows, sticky head)
 * from 768 and the card list below it, from one markup so each row's link and
 * test id exist once. A column shows only when some row carries that fact.
 */
export function CaseList({
  label,
  testId,
  selectForm,
  children,
}: {
  label: string;
  testId?: string;
  /** The BulkSelect `formId`: adds the checkbox column to rows with `select`. */
  selectForm?: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<CaseItemProps>[];
  const some = (pick: (props: CaseItemProps) => unknown) => items.some((item) => hasContent(pick(item.props) as ReactNode));
  const cols: CaseCols = {
    age: items.some((item) => item.props.ageDays !== undefined && item.props.ageDays !== null),
    type: some((props) => props.type),
    status: some((props) => props.status),
    owner: some((props) => props.owner),
    action: items.some((item) => hasContent(item.props.children) || Boolean(item.props.href && item.props.linkLabel)),
    select: selectForm && items.some((item) => item.props.select) ? selectForm : undefined,
  };
  return (
    <div className="hz-table-wrap" data-testid={testId}>
      <table className="hz-table hz-table--dense hz-table--stack hz-queue-table" aria-label={label}>
        <thead>
          <tr>
            {cols.select ? (
              <th scope="col" className="hz-table__check">
                <label className="hz-check">
                  <input type="checkbox" data-select-all aria-label="انتخاب همه ردیف‌های این صفحه" />
                </label>
              </th>
            ) : null}
            {HEAD.filter(([key]) => key === 'name' || cols[key]).map(([key, header]) => (
              <th key={key} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{items.map((item) => cloneElement(item, { cols }))}</tbody>
      </table>
    </div>
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
