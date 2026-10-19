import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';
import { StatusBadge, type ActionOwnerKind, type StatusTone } from './status.tsx';
import { statusOf } from './status-dictionary.ts';

/** A queue/desk status: a status-dictionary key (preferred) or a legacy tone + label pair. */
export type RowStatus = { readonly key: string } | { readonly tone: StatusTone; readonly label: string };

/**
 * Tone + label for a dictionary key, for components that still take the
 * legacy pair (DeskHeader, CaseItem). A module value with no dictionary key
 * (GAPS #4) uses `fallback`, else neutral with the raw key.
 */
export function keyStatus(key: string, fallback?: { tone: StatusTone; label: string }): { tone: StatusTone; label: string } {
  const entry = statusOf(key);
  if (entry?.labelFa) return { tone: entry.tone, label: entry.labelFa };
  return fallback ?? { tone: 'neutral', label: key };
}

/**
 * CaseQueue — DS pattern P09 (`.hz-table--dense` + `.hz-case` + inline
 * ActionOwner). Age first and oldest first, then the case code, the name (a
 * link to the decision desk), status, whose move it is, and an open caret.
 *
 * One markup for every width: below 768px the same rows restack as the
 * system's card list (`.hz-table--stack`, globals.css), so a row's test id and
 * link exist once, never twice.
 */
export interface QueueRow {
  readonly id: string;
  readonly href: string;
  readonly name: ReactNode;
  readonly sub?: ReactNode;
  readonly code?: string | null;
  /** Whole days since first submission; null when unknown. */
  readonly ageDays?: number | null;
  /** Only when the clock is ours (P09 › Overdue). */
  readonly age?: 'late' | 'overdue';
  readonly status?: RowStatus;
  readonly owner?: ActionOwnerKind;
  /** The owner is the viewing environment itself. */
  readonly ownerIsUs?: boolean;
  readonly type?: string;
  readonly openLabel?: string;
  readonly testId?: string;
  readonly extra?: ReactNode;
}

const OWNER_FA: Record<ActionOwnerKind, string> = {
  USER: 'متقاضی',
  VET: 'دامپزشک معتمد',
  ASSOCIATION: 'انجمن',
  GENETICS_CENTRE: 'مرکز ژنتیک',
  COUNTERPARTY: 'طرف مقابل',
  SYSTEM: 'همزیست',
};

export function CaseQueue({
  label,
  rows,
  showCode = true,
  showType = false,
  showOwner = true,
  extraLabel,
  nameLabel = 'متقاضی',
}: {
  label: string;
  /** Header of the name column (متقاضی، حیوان، عنوان…). */
  nameLabel?: string;
  rows: readonly QueueRow[];
  showCode?: boolean;
  showType?: boolean;
  showOwner?: boolean;
  /** Header of an optional module-specific column. */
  extraLabel?: string;
}) {
  const showAge = rows.some((row) => row.ageDays !== undefined);
  const showStatus = rows.some((row) => row.status);
  return (
    <div className="hz-table-wrap">
      <table className="hz-table hz-table--dense hz-table--stack" aria-label={label}>
        <thead>
          <tr>
            {showAge ? <th scope="col">سن پرونده</th> : null}
            {showCode ? <th scope="col">کد پرونده</th> : null}
            <th scope="col">{nameLabel}</th>
            {showType ? <th scope="col">نوع</th> : null}
            {showStatus ? <th scope="col">وضعیت</th> : null}
            {showOwner ? <th scope="col">اقدام بعدی با</th> : null}
            {extraLabel ? <th scope="col">{extraLabel}</th> : null}
            <th scope="col">
              <span className="hz-visually-hidden">باز کردن</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {showAge ? (
                <td data-label="سن پرونده">
                  {row.ageDays === null || row.ageDays === undefined ? (
                    '—'
                  ) : (
                    <span className={row.age ? 'hz-age hz-age--' + row.age : 'hz-age'}>
                      <Icon name="clock" size="xs" />
                      {row.ageDays.toLocaleString('fa-IR') + ' روز'}
                    </span>
                  )}
                </td>
              ) : null}
              {showCode ? (
                <td data-label="کد پرونده">
                  {row.code ? (
                    <bdi className="hz-id" dir="ltr">
                      {row.code}
                    </bdi>
                  ) : (
                    '—'
                  )}
                </td>
              ) : null}
              <td className="hz-table__lead">
                <div className="hz-case">
                  <Link className="hz-case__name" href={row.href} data-testid={row.testId}>
                    {row.name}
                  </Link>
                  {row.sub ? <span className="hz-case__sub">{row.sub}</span> : null}
                </div>
              </td>
              {showType ? <td data-label="نوع">{row.type ?? '—'}</td> : null}
              {showStatus ? (
                <td data-label="وضعیت">
                  {row.status ? (
                    'key' in row.status ? (
                      <StatusBadge status={row.status.key} size="sm" />
                    ) : (
                      <StatusBadge tone={row.status.tone} size="sm">
                        {row.status.label}
                      </StatusBadge>
                    )
                  ) : (
                    '—'
                  )}
                </td>
              ) : null}
              {showOwner ? (
                <td data-label="اقدام بعدی با">
                  {row.owner ? (
                    <span className={['hz-owner', 'hz-owner--inline', row.ownerIsUs ? 'hz-owner--you' : ''].join(' ').trim()}>
                      <span className="hz-owner__who">{OWNER_FA[row.owner]}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              ) : null}
              {extraLabel ? <td data-label={extraLabel}>{row.extra ?? '—'}</td> : null}
              <td className="hz-table__open">
                {/* Decorative: the name is the one link per case, so a case is never two links. */}
                <span className="hz-icon-btn hz-icon-btn--sm" aria-hidden="true">
                  <Icon name="caretRight" size="sm" mirror />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** QueueTile row — DS *QueueTile*: name, count, oldest age, alert when overdue. */
export function QueueTiles({
  tiles,
}: {
  tiles: ReadonlyArray<{ href: string; name: string; count: number | null; oldestDays?: number | null; alert?: boolean; testId?: string }>;
}) {
  return (
    <div className="hz-queue-tiles">
      {tiles.map((tile) => (
        <Link
          key={tile.href}
          href={tile.href}
          className={['hz-queue-tile', 'hz-card--interactive', tile.alert ? 'hz-queue-tile--alert' : '', tile.count === 0 ? 'hz-queue-tile--empty' : '']
            .join(' ')
            .trim()}
          data-testid={tile.testId}
        >
          <span className="hz-queue-tile__head">
            <span className="hz-queue-tile__name">{tile.name}</span>
            <Icon name="arrowRight" size="xs" mirror />
          </span>
          <span className="hz-queue-tile__count hz-num">{tile.count === null ? '—' : tile.count.toLocaleString('fa-IR')}</span>
          {tile.count === 0 ? (
            <span className="hz-queue-tile__oldest">صف خالی است</span>
          ) : tile.oldestDays !== undefined && tile.oldestDays !== null ? (
            <span className="hz-queue-tile__oldest">
              قدیمی‌ترین:{' '}
              <span className={tile.alert ? 'hz-age hz-age--overdue' : 'hz-age'}>{tile.oldestDays.toLocaleString('fa-IR') + ' روز'}</span>
            </span>
          ) : null}
          {tile.alert ? (
            <span className="hz-queue-tile__flag">
              <Icon name="warning" size="xs" />
              از مهلت بررسی گذشته
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

/** Whole days between a submission and now (P09: age in whole days). */
export function ageInDays(from: Date | null | undefined, now: Date = new Date()): number | null {
  if (!from) return null;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}
